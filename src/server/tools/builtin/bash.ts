/**
 * bash —— 在会话工作区执行单条 shell 命令。cwd 强制锁定 workspace root（§5.3）。
 * 安全三道闸：① 禁 shell 元字符（防注入/链式，只允许单条命令，即 §5.1「参数化」）；
 * ② 命令白名单（危险命令走人工审批，审批通道待增量3下一步接入）；③ 超时 + 输出截断 + 尊重 abort。
 */
import { z } from 'zod'
import { spawn } from 'node:child_process'
import type { ToolDef, ToolResult } from '@/server/tools/types'
import { ensureWorkspace } from '@/server/tools/workspace'

const argsSchema = z.object({
  command: z.string().min(1),
})

// 命令白名单：只读/信息类 + 构建/运行类，直接执行无需审批
const COMMAND_WHITELIST = new Set([
  'ls', 'cat', 'echo', 'pwd', 'head', 'tail', 'wc', 'grep', 'find', 'sort', 'uniq',
  'tree', 'stat', 'which', 'date', 'env', 'mkdir', 'touch',
  'node', 'npm', 'pnpm', 'npx', 'python', 'python3', 'pip', 'tsc',
])

// 硬拒黑名单：不可逆破坏（删除/提权/关机/磁盘格式化等），直接拒绝，不给审批机会
const COMMAND_DENYLIST = new Set([
  'rm', 'rmdir', 'del', 'sudo', 'su', 'shutdown', 'reboot', 'halt', 'poweroff',
  'mkfs', 'fdisk', 'dd', 'format', 'chmod', 'chown', 'kill', 'killall', 'reg',
])

// 危险 shell 元字符：管道/重定向/链式/命令替换/后台/换行一律拒绝，强制单条命令
const DANGEROUS_PATTERN = /[;&|`\n]|\$\(|>|</

const TIMEOUT_MS = 60_000
const MAX_OUTPUT = 100_000 // stdout/stderr 各自字符上限，防撑爆 LLM 上下文

type Validation =
  | { verdict: 'ok'; program: string }
  | { verdict: 'needs_approval'; program: string }
  | { verdict: 'deny'; reason: string }

// 纯函数：三档判定 ok(直跑) / needs_approval(弹审批) / deny(硬拒)。抽出便于单测（不触发子进程）
export function validateCommand(command: string): Validation {
  const trimmed = command.trim()
  if (!trimmed) return { verdict: 'deny', reason: '命令为空' }
  if (DANGEROUS_PATTERN.test(trimmed)) {
    return { verdict: 'deny', reason: '命令包含不允许的 shell 操作符（管道/重定向/链式/命令替换），仅支持单条命令' }
  }
  const program = trimmed.split(/\s+/)[0]
  if (program.includes('=')) {
    return { verdict: 'deny', reason: '不支持环境变量前缀（如 FOO=bar cmd），请直接执行命令' }
  }
  if (COMMAND_DENYLIST.has(program)) {
    return { verdict: 'deny', reason: `命令 "${program}" 属不可逆危险操作，已硬性拒绝` }
  }
  if (COMMAND_WHITELIST.has(program)) return { verdict: 'ok', program }
  // 白名单外、非硬拒 → 走人工审批
  return { verdict: 'needs_approval', program }
}

// 非 Windows 用默认 /bin/sh；Windows 优先复用开发环境的 SHELL（Git Bash），否则退回 ComSpec(cmd.exe)
function resolveShell(): string | boolean {
  if (process.platform !== 'win32') return true
  return process.env.SHELL || true
}

function runCommand(command: string, cwd: string, signal: AbortSignal): Promise<ToolResult> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve({ result: '执行前已中止', isError: true })
      return
    }

    const child = spawn(command, { cwd, shell: resolveShell(), windowsHide: true })
    let stdout = ''
    let stderr = ''
    let stdoutTruncated = false
    let stderrTruncated = false
    let timedOut = false
    let settled = false

    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, TIMEOUT_MS)
    const onAbort = () => child.kill()
    signal.addEventListener('abort', onAbort, { once: true })

    const finish = (result: unknown, isError: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      resolve({ result, isError })
    }

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

    child.on('error', (err) => finish(`命令启动失败: ${err.message}`, true))
    child.on('close', (code) => {
      if (timedOut) {
        finish(`命令执行超时（${TIMEOUT_MS / 1000}s）已终止\nstdout:\n${stdout}\nstderr:\n${stderr}`, true)
        return
      }
      finish(
        {
          command,
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
}

export const bash: ToolDef = {
  name: 'bash',
  description:
    '在当前会话工作区执行单条 shell 命令（cwd 锁定工作区根）。白名单命令（ls/cat/head/grep/node/npm/pnpm/tsc 等）直接执行；其他命令需用户审批后执行；不可逆危险命令（rm/sudo/shutdown 等）会被拒绝。不支持管道、重定向、命令链（| > && ; 等操作符）。',
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: '要执行的单条命令，如 "ls -la" 或 "node script.js"。不支持 |、>、&&、; 等 shell 操作符。',
      },
    },
    required: ['command'],
  },
  // 三档审批判定：白名单直跑 / 硬拒危险命令 / 其余弹审批（executor 挂起等确认）
  checkApproval(args) {
    const parsed = argsSchema.safeParse(args)
    if (!parsed.success) return { verdict: 'skip' } // 参数非法交给 execute 报错
    const v = validateCommand(parsed.data.command)
    if (v.verdict === 'deny') return { verdict: 'deny', reason: v.reason }
    if (v.verdict === 'needs_approval') {
      return { verdict: 'approve', summary: `执行命令: ${parsed.data.command.trim()}` }
    }
    return { verdict: 'skip' }
  },
  async execute(args, ctx) {
    const parsed = argsSchema.safeParse(args)
    if (!parsed.success) {
      return { result: `参数非法: ${parsed.error.message}`, isError: true }
    }
    if (!ctx.workspaceRoot) {
      return { result: '当前上下文无工作区，无法执行命令', isError: true }
    }

    // 硬拒档兜底：即使绕过 executor 的 checkApproval 直接调 execute，deny 仍拦截
    const validation = validateCommand(parsed.data.command)
    if (validation.verdict === 'deny') {
      return { result: validation.reason, isError: true }
    }

    await ensureWorkspace(ctx.workspaceRoot)
    return runCommand(parsed.data.command.trim(), ctx.workspaceRoot, ctx.signal)
  },
}
