"use client"

import { formatFileSize } from "@/lib/format"
import type { RequiredFile } from "@/lib/platform-config"
import type { UploadFileType, UploadedFile } from "@/lib/types"

interface FileStatusListProps {
  requiredFiles: RequiredFile[]
  files: Record<UploadFileType, UploadedFile>
}

export function FileStatusList({ requiredFiles, files }: FileStatusListProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-foreground mb-4">必须文件清单</h3>
      {requiredFiles.map((rf) => {
        const uploadedFile = files[rf.key]
        const isUploaded = !!uploadedFile

        return (
          <div key={rf.key} className="flex items-center gap-3">
            <div
              className={`h-2 w-2 rounded-full flex-shrink-0 ${isUploaded ? "bg-green-500" : "bg-muted-foreground/40"}`}
            />
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium text-foreground">{rf.label}：</span>
              {isUploaded ? (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-foreground">{uploadedFile.file.name}</span>
                  <span className="text-xs text-muted-foreground">{formatFileSize(uploadedFile.file.size)}</span>
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">未上传</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
