'use client'

import { useEffect, useState } from 'react'
import type { ArtifactRecord } from '@/shared/types'
import { MarkdownContent } from '@/components/chat/markdown-content'
import { FileCode, Globe, FileText, Loader2 } from 'lucide-react'

// 产物预览卡片：按 artifactId 自行 fetch 内容（不进 store，仅本组件用），按 type 分渲染。
export function ArtifactCard({ artifactId }: { artifactId: string }) {
  const [artifact, setArtifact] = useState<ArtifactRecord | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch(`/api/artifacts/${artifactId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('产物加载失败'))))
      .then((data) => alive && setArtifact(data))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      alive = false
    }
  }, [artifactId])

  if (error) {
    return <div className="my-1.5 rounded-lg border border-destructive/40 px-3 py-2 text-xs text-destructive">⚠ {error}</div>
  }
  if (!artifact) {
    return (
      <div className="my-1.5 flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> 加载产物…
      </div>
    )
  }

  const Icon = artifact.type === 'web_app' ? Globe : artifact.type === 'code_file' ? FileCode : FileText

  return (
    <div className="my-1.5 overflow-hidden rounded-lg border border-border/60 bg-background/50">
      <div className="flex items-center gap-1.5 border-b bg-muted/40 px-3 py-1.5 text-xs font-medium">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        {artifact.title}
      </div>
      <div className="p-1">
        <ArtifactBody artifact={artifact} />
      </div>
    </div>
  )
}

function ArtifactBody({ artifact }: { artifact: ArtifactRecord }) {
  if (artifact.type === 'web_app') {
    // §5.1 铁律：LLM 生成的 HTML 只给 allow-scripts，坚决不给 allow-same-origin（隔离主站 cookie/同源请求）
    return (
      <iframe
        srcDoc={artifact.content}
        sandbox="allow-scripts"
        className="h-[400px] w-full rounded border-0 bg-white"
        title={artifact.title}
      />
    )
  }
  if (artifact.type === 'code_file') {
    // 包成 markdown 代码块，复用 MarkdownContent 的高亮 + 复制按钮
    const fenced = `\`\`\`${artifact.language ?? ''}\n${artifact.content}\n\`\`\``
    return <MarkdownContent content={fenced} className="px-1" />
  }
  // document：直接渲染 markdown
  return <MarkdownContent content={artifact.content} className="px-2 py-1" />
}
