'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'

// 渲染 agent/用户消息里的 markdown 正文。代码块带复制按钮，其余走 prose 语义样式。
export function MarkdownContent({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn('prose-chat text-sm leading-relaxed', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const isBlock = /language-/.test(className ?? '')
            if (!isBlock) {
              return (
                <code className="rounded bg-muted px-1 py-0.5 text-[0.85em]" {...props}>
                  {children}
                </code>
              )
            }
            return <CodeBlock className={className}>{String(children)}</CodeBlock>
          },
          a({ children, ...props }) {
            return (
              <a className="text-primary underline underline-offset-2" target="_blank" rel="noreferrer" {...props}>
                {children}
              </a>
            )
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

function CodeBlock({ className, children }: { className?: string; children: string }) {
  const [copied, setCopied] = useState(false)
  const lang = className?.replace('language-', '') ?? ''

  const copy = async () => {
    await navigator.clipboard.writeText(children.replace(/\n$/, ''))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="group relative my-2 overflow-hidden rounded-lg border bg-muted/50">
      <div className="flex items-center justify-between border-b bg-muted/60 px-3 py-1 text-xs text-muted-foreground">
        <span>{lang || 'code'}</span>
        <button onClick={copy} className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-accent" title="复制">
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-xs">
        <code className={className}>{children.replace(/\n$/, '')}</code>
      </pre>
    </div>
  )
}
