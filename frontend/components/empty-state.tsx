import { FileX } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

interface EmptyStateProps {
  message?: string
}

export function EmptyState({ message = "暂无数据" }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <FileX className="w-12 h-12 text-muted-foreground mb-4" />
      <p className="text-sm text-muted-foreground mb-4">{message}</p>
      <Button variant="outline" asChild>
        <Link href="/">返回上传页</Link>
      </Button>
    </div>
  )
}
