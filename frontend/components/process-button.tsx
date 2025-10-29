"use client"

import { CheckCircle2, Loader2, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

type ProcessState = "idle" | "loading" | "success" | "error"

interface ProcessButtonProps {
  state: ProcessState
  disabled?: boolean
  onClick: () => void
}

export function ProcessButton({ state, disabled, onClick }: ProcessButtonProps) {
  return (
    <Button
      onClick={onClick}
      disabled={disabled || state === "loading"}
      className="min-w-[140px]"
      aria-busy={state === "loading"}
    >
      {state === "loading" && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
      {state === "success" && <CheckCircle2 className="w-4 h-4 mr-2" />}
      {state === "error" && <XCircle className="w-4 h-4 mr-2" />}
      {state === "idle" && "处理并预览"}
      {state === "loading" && "处理中..."}
      {state === "success" && "处理成功"}
      {state === "error" && "处理失败"}
    </Button>
  )
}
