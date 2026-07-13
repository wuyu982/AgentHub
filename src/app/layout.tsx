import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AgentHub',
  description: '多 Agent 协同 + RAG 知识增强工作台',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  )
}
