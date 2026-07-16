import type { LucideIcon } from 'lucide-react'

interface PlaceholderViewProps {
  icon: LucideIcon
  title: string
  description: string
}

// 智能体 / 监控等视图的建设中占位页，内容后续单独开 task 填充
export function PlaceholderView({ icon: Icon, title, description }: PlaceholderViewProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-muted-foreground">
        <Icon className="h-7 w-7" />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
      <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">建设中</span>
    </div>
  )
}
