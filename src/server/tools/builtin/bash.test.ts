import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs/promises'
import { bash, validateCommand } from './bash'

test('只读程序使用结构化 args 并直接执行', () => {
  assert.equal(validateCommand('ls', ['-la', 'src']).verdict, 'ok')
  assert.equal(validateCommand('cat', ['docs/my notes.md']).verdict, 'ok')
  assert.equal(validateCommand('grep', ['TODO;still-data', 'src/app.ts']).verdict, 'ok')
})

test('构建和代码运行程序必须审批', () => {
  assert.equal(validateCommand('node', ['script.js']).verdict, 'needs_approval')
  assert.equal(validateCommand('pnpm', ['typecheck']).verdict, 'needs_approval')
  assert.equal(validateCommand('git', ['status']).verdict, 'needs_approval')
})

test('拒绝 shell、未知程序和路径形式的 program', () => {
  assert.equal(validateCommand('bash', ['-c', 'echo hi']).verdict, 'deny')
  assert.equal(validateCommand('curl', ['https://example.com']).verdict, 'deny')
  assert.equal(validateCommand('../node', ['script.js']).verdict, 'deny')
  assert.equal(validateCommand('C:\\Windows\\cmd.exe', ['/c', 'dir']).verdict, 'deny')
})

test('拒绝解释器内联代码与包管理器任意执行入口', () => {
  assert.equal(validateCommand('node', ['-e', 'process.exit()']).verdict, 'deny')
  assert.equal(validateCommand('python', ['-c', 'print(1)']).verdict, 'deny')
  assert.equal(validateCommand('python', ['-m', 'http.server']).verdict, 'deny')
  assert.equal(validateCommand('npx', ['some-package']).verdict, 'deny')
  assert.equal(validateCommand('pnpm', ['exec', 'some-package']).verdict, 'deny')
  assert.equal(validateCommand('npm', ['install', 'some-package']).verdict, 'deny')
  assert.equal(validateCommand('node', ['--env-file', 'secrets.env', 'script.js']).verdict, 'deny')
  assert.equal(validateCommand('pnpm', ['--dir=workspace-link', 'typecheck']).verdict, 'deny')
  assert.equal(validateCommand('git', ['--work-tree=workspace-link', 'status']).verdict, 'deny')
})

test('拒绝工作区逃逸和环境变量引用', () => {
  assert.equal(validateCommand('cat', ['../secret.txt']).verdict, 'deny')
  assert.equal(validateCommand('node', ['../outside.js']).verdict, 'deny')
  assert.equal(validateCommand('node', ['C:\\Users\\user\\outside.js']).verdict, 'deny')
  assert.equal(validateCommand('pnpm', ['$OPENAI_API_KEY']).verdict, 'deny')
  assert.equal(validateCommand('pnpm', ['%OPENAI_API_KEY%']).verdict, 'deny')
})

test('拒绝只读程序的危险选项', () => {
  assert.equal(validateCommand('grep', ['-f', 'pattern.txt', 'input.txt']).verdict, 'deny')
  assert.equal(validateCommand('ls', ['--color=always']).verdict, 'deny')
  assert.equal(validateCommand('cat', ['-n', 'input.txt']).verdict, 'deny')
  assert.equal(validateCommand('head', []).verdict, 'deny')
})

test('实际执行保持 args 边界且不继承敏感环境变量', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'agenthub-bash-'))
  const scriptName = 'script with space.js'
  const scriptPath = path.join(workspace, scriptName)
  await fs.writeFile(
    scriptPath,
    "process.stdout.write(JSON.stringify({ arg: process.argv[2], isolated: !process.env.AGENTHUB_TEST_SECRET }))",
  )
  process.env.AGENTHUB_TEST_SECRET = 'must-not-leak'

  try {
    const result = await bash.execute(
      { program: 'node', args: [scriptName, 'hello world'] },
      {
        conversationId: 'test',
        messageId: 'message',
        runId: 'run',
        signal: new AbortController().signal,
        depth: 0,
        workspaceRoot: workspace,
      },
    )
    assert.equal(result.isError, false)
    const output = result.result as { stdout: string }
    assert.deepEqual(JSON.parse(output.stdout), { arg: 'hello world', isolated: true })
  } finally {
    delete process.env.AGENTHUB_TEST_SECRET
    await fs.rm(workspace, { recursive: true, force: true })
  }
})
