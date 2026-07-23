/**
 * bash —— 在会话工作区执行受约束的单个程序。program/args 参数化传入，不经过 shell。
 */
import { constants as fsConstants } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { z } from 'zod'
import type { ToolDef, ToolResult } from '@/server/tools/types'
import { ensureWorkspace, resolveExistingInWorkspace } from '@/server/tools/workspace'

const commandSchema = z
  .object({
    program: z.string().min(1).max(64).regex(/^[A-Za-z0-9._+-]+$/),
    args: z.array(z.string().max(4096)).max(64).default([]),
  })
  .strict()

const DIRECT_PROGRAMS = new Set(['pwd', 'date', 'ls', 'cat', 'head', 'tail', 'wc', 'stat', 'tree', 'grep', 'which'])
const APPROVAL_PROGRAMS = new Set(['node', 'npm', 'pnpm', 'python', 'python3', 'tsc', 'git'])
const DENIED_PROGRAMS = new Set([
  'sh', 'bash', 'zsh', 'cmd', 'cmd.exe', 'powershell', 'powershell.exe', 'pwsh', 'npx',
  'rm', 'rmdir', 'del', 'sudo', 'su', 'shutdown', 'reboot', 'halt', 'poweroff',
  'mkfs', 'fdisk', 'dd', 'format', 'chmod', 'chown', 'kill', 'killall', 'reg',
])

const PACKAGE_MUTATIONS = new Set([
  'add', 'install', 'i', 'remove', 'rm', 'uninstall', 'update', 'up', 'publish',
  'link', 'unlink', 'rebuild', 'exec', 'dlx', 'create', 'init',
])
const NODE_CODE_FLAGS = [
  '-e', '--eval', '-p', '--print', '-r', '--require', '--import', '--loader', '--experimental-loader',
  '--env-file', '--env-file-if-exists',
]
const PYTHON_CODE_FLAGS = ['-c', '-m']
const OUTSIDE_PATH_PATTERN = /(^|[\\/])\.\.([\\/]|$)/
const ENV_REFERENCE_PATTERN = /\$\{?[A-Za-z_][A-Za-z0-9_]*\}?|%[A-Za-z_][A-Za-z0-9_]*%/

const TIMEOUT_MS = 60_000
const MAX_OUTPUT = 100_000

export type CommandValidation =
  | { verdict: 'ok'; program: string; args: string[]; pathArgIndexes: number[] }
  | { verdict: 'needs_approval'; program: string; args: string[]; pathArgIndexes: number[] }
  | { verdict: 'deny'; reason: string }

function denied(reason: string): CommandValidation {
  return { verdict: 'deny', reason }
}

function containsFlag(args: string[], flag: string): boolean {
  return args.some((arg) => arg === flag || arg.startsWith(`${flag}=`))
}

function validateGenericArg(arg: string): string | null {
  if (arg.includes('\0') || /[\r\n]/.test(arg)) return '参数包含不允许的控制字符'
  if (ENV_REFERENCE_PATTERN.test(arg)) return `参数包含环境变量引用: ${arg}`

  const candidate = arg.startsWith('-') && arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : arg
  if (
    path.isAbsolute(candidate) ||
    path.win32.isAbsolute(candidate) ||
    path.posix.isAbsolute(candidate) ||
    candidate.startsWith('~') ||
    candidate.startsWith('file:') ||
    OUTSIDE_PATH_PATTERN.test(candidate)
  ) {
    return `参数可能越出工作区: ${arg}`
  }
  return null
}

function validateDirectProgram(program: string, args: string[]): CommandValidation {
  if (program === 'pwd' || program === 'date') {
    return args.length === 0 ? { verdict: 'ok', program, args, pathArgIndexes: [] } : denied(`${program} 不接受参数`)
  }

  if (program === 'which') {
    if (args.length === 0 || args.some((arg) => !/^[A-Za-z0-9._+-]+$/.test(arg))) {
      return denied('which 只接受程序名称')
    }
    return { verdict: 'ok', program, args, pathArgIndexes: [] }
  }

  if (program === 'grep') {
    if (args.length < 2 || args[0].startsWith('-')) return denied('grep 仅支持 grep <pattern> <workspace-path...>')
    const pathArgIndexes = args.slice(1).map((_, index) => index + 1)
    return { verdict: 'ok', program, args, pathArgIndexes }
  }

  let pathArgIndexes: number[] = []
  if (program === 'ls') {
    const allowedFlags = /^-(?:[al1]+)$|^--(?:all|long)$/
    if (args.some((arg) => arg.startsWith('-') && !allowedFlags.test(arg))) return denied('ls 包含未允许的选项')
    pathArgIndexes = args.flatMap((arg, index) => (arg.startsWith('-') ? [] : [index]))
  } else if (program === 'head' || program === 'tail') {
    let index = 0
    if (args[index] === '-n') {
      if (!/^\d+$/.test(args[index + 1] ?? '')) return denied(`${program} 的 -n 必须跟正整数`)
      index += 2
    } else if (/^-\d+$/.test(args[index] ?? '')) {
      index += 1
    }
    if (args.slice(index).some((arg) => arg.startsWith('-'))) return denied(`${program} 包含未允许的选项`)
    pathArgIndexes = args.slice(index).map((_, offset) => index + offset)
  } else if (program === 'wc') {
    if (args.some((arg) => arg.startsWith('-') && !/^-[lwcm]+$/.test(arg))) return denied('wc 包含未允许的选项')
    pathArgIndexes = args.flatMap((arg, index) => (arg.startsWith('-') ? [] : [index]))
  } else if (program === 'tree') {
    if (args.length > 1 || args.some((arg) => arg.startsWith('-'))) return denied('tree 最多接受一个工作区路径')
    pathArgIndexes = args.length === 1 ? [0] : []
  } else {
    if (args.some((arg) => arg.startsWith('-'))) return denied(`${program} 不允许命令选项`)
    pathArgIndexes = args.map((_, index) => index)
  }

  const requiresPath = new Set(['cat', 'head', 'tail', 'wc', 'stat'])
  if (requiresPath.has(program) && pathArgIndexes.length === 0) return denied(`${program} 至少需要一个工作区路径`)
  for (const index of pathArgIndexes) {
    const reason = validateGenericArg(args[index])
    if (reason) return denied(reason)
  }
  return { verdict: 'ok', program, args, pathArgIndexes }
}

function validateApprovalProgram(program: string, args: string[]): CommandValidation {
  for (const arg of args) {
    const reason = validateGenericArg(arg)
    if (reason) return denied(reason)
  }

  if (program === 'node') {
    if (NODE_CODE_FLAGS.some((flag) => containsFlag(args, flag))) return denied('node 禁止内联代码、预加载和自定义 loader')
  }
  if (program === 'python' || program === 'python3') {
    if (PYTHON_CODE_FLAGS.some((flag) => containsFlag(args, flag)) || args.includes('-')) {
      return denied('python 禁止 -c、-m 和标准输入代码执行')
    }
  }
  if (program === 'npm' || program === 'pnpm') {
    const subcommand = args.find((arg) => !arg.startsWith('-'))
    const informational = args.some((arg) => ['--version', '-v', '--help', '-h'].includes(arg))
    if (!subcommand && !informational) return denied(`${program} 缺少要执行的脚本`)
    if (subcommand && PACKAGE_MUTATIONS.has(subcommand)) {
      return denied(`${program} ${subcommand} 会安装、修改或任意执行包，已拒绝`)
    }
    const blockedDirectoryFlags = ['-g', '--global', '-C', '--dir', '--prefix', '--global-dir', '--store-dir', '--userconfig']
    if (args.some((arg) => blockedDirectoryFlags.some((flag) => arg === flag || arg.startsWith(`${flag}=`)))) {
      return denied(`${program} 不允许切换目录或操作全局环境`)
    }
  }
  if (
    program === 'git' &&
    args.some((arg) => ['-C', '--git-dir', '--work-tree'].some((flag) => arg === flag || arg.startsWith(`${flag}=`)))
  ) {
    return denied('git 不允许切换工作区或指定外部仓库目录')
  }

  const pathArgIndexes: number[] = []
  if (program === 'node') {
    const scriptIndex = args.findIndex((arg) => !arg.startsWith('-'))
    if (scriptIndex >= 0) pathArgIndexes.push(scriptIndex)
    else if (!args.some((arg) => ['--test', '--version', '-v', '--help', '-h'].includes(arg))) return denied('node 缺少工作区脚本')
  }
  if (program === 'python' || program === 'python3') {
    const scriptIndex = args.findIndex((arg) => !arg.startsWith('-'))
    if (scriptIndex >= 0) pathArgIndexes.push(scriptIndex)
    else if (!args.some((arg) => ['--version', '-V', '--help', '-h'].includes(arg))) return denied('python 缺少工作区脚本')
  }

  return { verdict: 'needs_approval', program, args, pathArgIndexes }
}

export function validateCommand(programInput: string, args: string[]): CommandValidation {
  const program = programInput.toLowerCase()
  if (!/^[A-Za-z0-9._+-]+$/.test(program) || program.includes('..')) return denied('program 必须是程序名，不能包含路径')
  if (DENIED_PROGRAMS.has(program)) return denied(`程序 "${program}" 不允许执行`)
  if (DIRECT_PROGRAMS.has(program)) return validateDirectProgram(program, args)
  if (APPROVAL_PROGRAMS.has(program)) return validateApprovalProgram(program, args)
  return denied(`程序 "${program}" 不在允许列表中`)
}

function isWithin(root: string, target: string): boolean {
  const rel = path.relative(root, target)
  return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel))
}

async function resolveExecutable(program: string, workspaceRoot: string): Promise<string> {
  const pathValue = process.env.PATH ?? process.env.Path ?? ''
  const extensions = process.platform === 'win32' ? ['.exe', '.com'] : ['']
  for (const entry of pathValue.split(path.delimiter)) {
    if (!entry || !path.isAbsolute(entry) || isWithin(workspaceRoot, entry)) continue
    for (const extension of extensions) {
      const candidate = path.join(entry, process.platform === 'win32' ? `${program}${extension}` : program)
      try {
        await fs.access(candidate, fsConstants.X_OK)
        return candidate
      } catch {
        // 继续查找下一个可信 PATH 目录。
      }
    }
  }
  throw new Error(`安全模式下找不到可直接执行的程序: ${program}`)
}

interface Invocation {
  executable: string
  args: string[]
}

async function resolveInvocation(program: string, args: string[], workspaceRoot: string): Promise<Invocation> {
  if (program === 'node') return { executable: process.execPath, args }

  // Windows 的 npm/pnpm 是 .cmd 包装器，不能在 shell:false 下直接执行；改由当前 Node 加载可信 CLI。
  if (process.platform === 'win32' && (program === 'npm' || program === 'pnpm')) {
    const nodeDir = path.dirname(process.execPath)
    const cliRelative = program === 'npm'
      ? path.join('node_modules', 'npm', 'bin', 'npm-cli.js')
      : path.join('node_modules', 'corepack', 'dist', 'pnpm.js')
    const cliPath = path.join(nodeDir, cliRelative)
    await fs.access(cliPath, fsConstants.R_OK)
    return { executable: process.execPath, args: [cliPath, ...args] }
  }

  return { executable: await resolveExecutable(program, workspaceRoot), args }
}

async function prepareArgs(args: string[], pathArgIndexes: number[], workspaceRoot: string): Promise<string[]> {
  const prepared = [...args]
  for (const index of pathArgIndexes) {
    const userPath = args[index]
    prepared[index] = await resolveExistingInWorkspace(workspaceRoot, userPath)
  }
  return prepared
}

async function isolatedEnvironment(cwd: string): Promise<NodeJS.ProcessEnv> {
  const runtimeRoot = path.join(cwd, '.agenthub-runtime')
  const tempDir = path.join(runtimeRoot, 'tmp')
  const homeDir = path.join(runtimeRoot, 'home')
  await fs.mkdir(tempDir, { recursive: true })
  await fs.mkdir(homeDir, { recursive: true })

  return {
    PATH: process.env.PATH ?? process.env.Path ?? '',
    PATHEXT: process.env.PATHEXT,
    SystemRoot: process.env.SystemRoot,
    ComSpec: process.env.ComSpec,
    LANG: process.env.LANG ?? 'C.UTF-8',
    TEMP: tempDir,
    TMP: tempDir,
    HOME: homeDir,
    USERPROFILE: homeDir,
    XDG_CONFIG_HOME: path.join(homeDir, '.config'),
    NODE_ENV: process.env.NODE_ENV ?? 'development',
    CI: '1',
    NO_COLOR: '1',
  }
}

function runCommand(program: string, args: string[], cwd: string, signal: AbortSignal): Promise<ToolResult> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new DOMException('命令执行已中止', 'AbortError'))
      return
    }

    let child: ReturnType<typeof spawn> | undefined
    let stdout = ''
    let stderr = ''
    let stdoutTruncated = false
    let stderrTruncated = false
    let timedOut = false
    let settled = false

    const finish = (result: unknown, isError: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      resolve({ result, isError })
    }
    const fail = (error: unknown) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      reject(error)
    }
    const onAbort = () => {
      child?.kill()
      fail(signal.reason ?? new DOMException('命令执行已中止', 'AbortError'))
    }
    const timer = setTimeout(() => {
      timedOut = true
      child?.kill()
    }, TIMEOUT_MS)

    signal.addEventListener('abort', onAbort, { once: true })
    isolatedEnvironment(cwd)
      .then((env) => resolveInvocation(program, args, cwd).then((invocation) => ({ env, invocation })))
      .then(({ env, invocation }) => {
        if (signal.aborted) {
          onAbort()
          return
        }
        child = spawn(invocation.executable, invocation.args, { cwd, env, shell: false, windowsHide: true })
        child.stdout?.on('data', (chunk: Buffer) => {
          if (stdout.length >= MAX_OUTPUT) return
          stdout += chunk.toString('utf8')
          if (stdout.length >= MAX_OUTPUT) {
            stdout = stdout.slice(0, MAX_OUTPUT)
            stdoutTruncated = true
          }
        })
        child.stderr?.on('data', (chunk: Buffer) => {
          if (stderr.length >= MAX_OUTPUT) return
          stderr += chunk.toString('utf8')
          if (stderr.length >= MAX_OUTPUT) {
            stderr = stderr.slice(0, MAX_OUTPUT)
            stderrTruncated = true
          }
        })
        child.on('error', (error) => finish(`命令启动失败: ${error.message}`, true))
        child.on('close', (code) => {
          if (timedOut) {
            finish(`命令执行超时（${TIMEOUT_MS / 1000}s）已终止\nstdout:\n${stdout}\nstderr:\n${stderr}`, true)
            return
          }
          finish(
            {
              program,
              args,
              exitCode: code,
              stdout,
              stderr,
              stdoutTruncated: stdoutTruncated || undefined,
              stderrTruncated: stderrTruncated || undefined,
            },
            code !== 0,
          )
        })
      })
      .catch(fail)
  })
}

export const bash: ToolDef = {
  name: 'bash',
  description:
    '在当前会话工作区执行一个受约束的程序。program 是程序名，args 是独立参数数组；不经过 shell。只读命令可直接执行，构建/运行命令需用户审批，安装依赖、内联代码和越界路径会被拒绝。',
  parameters: {
    type: 'object',
    properties: {
      program: { type: 'string', description: '程序名，如 ls、cat、node、pnpm；不能包含路径' },
      args: { type: 'array', items: { type: 'string' }, description: '独立参数数组，如 ["typecheck"] 或 ["src/app.ts"]' },
    },
    required: ['program', 'args'],
  },
  checkApproval(input) {
    const parsed = commandSchema.safeParse(input)
    if (!parsed.success) return { verdict: 'skip' }
    const validation = validateCommand(parsed.data.program, parsed.data.args)
    if (validation.verdict === 'deny') return { verdict: 'deny', reason: validation.reason }
    if (validation.verdict === 'needs_approval') {
      return {
        verdict: 'approve',
        summary: `执行高风险程序（进程拥有当前用户权限）: program=${validation.program}, args=${JSON.stringify(validation.args)}`,
      }
    }
    return { verdict: 'skip' }
  },
  async execute(input, ctx) {
    const parsed = commandSchema.safeParse(input)
    if (!parsed.success) return { result: `参数非法: ${parsed.error.message}`, isError: true }
    if (!ctx.workspaceRoot) return { result: '当前上下文无工作区，无法执行命令', isError: true }

    const validation = validateCommand(parsed.data.program, parsed.data.args)
    if (validation.verdict === 'deny') return { result: validation.reason, isError: true }

    await ensureWorkspace(ctx.workspaceRoot)
    const preparedArgs = await prepareArgs(validation.args, validation.pathArgIndexes, ctx.workspaceRoot)
    return runCommand(validation.program, preparedArgs, ctx.workspaceRoot, ctx.signal)
  },
}
