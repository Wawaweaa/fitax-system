"use client"

import { cn } from "@/lib/utils"

interface WorkflowStep {
  label: string
  completed: boolean
}

interface WorkflowStepsProps {
  steps: WorkflowStep[]
}

export function WorkflowSteps({ steps }: WorkflowStepsProps) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {steps.map((step, index) => (
        <div key={step.label} className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "w-2 h-2 rounded-full flex-shrink-0",
                step.completed ? "bg-green-500" : "bg-muted-foreground/40",
              )}
            />
            <span className={cn("text-sm", step.completed ? "text-foreground font-medium" : "text-muted-foreground")}>
              {step.label}
            </span>
          </div>
          {index < steps.length - 1 && <div className="w-8 border-t border-border" />}
        </div>
      ))}
    </div>
  )
}
