"use client"

import type React from "react"

import { Upload, X } from "lucide-react"
import { useCallback, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { formatFileSize } from "@/lib/format"
import type { UploadedFile } from "@/lib/types"

interface FileDropzoneProps {
  requiredFiles: Array<{ key: string; label: string; patterns: string[] }>
  files: Record<string, UploadedFile>
  onChange: (files: Record<string, UploadedFile>) => void
}

export function FileDropzone({ requiredFiles, files, onChange }: FileDropzoneProps) {
  const [dragActive, setDragActive] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    console.log("[v0] Drag event:", e.type)
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }, [])

  const handleFiles = useCallback(
    (fileList: FileList) => {
      console.log("[v0] handleFiles called with", fileList.length, "files")
      const newFiles = { ...files }
      Array.from(fileList).forEach((file) => {
        console.log("[v0] Processing file:", file.name)
        const matchedFile = requiredFiles.find((rf) =>
          rf.patterns.some((pattern) => file.name.toLowerCase().includes(pattern.toLowerCase())),
        )

        if (matchedFile) {
          console.log("[v0] Matched file to key:", matchedFile.key)
          newFiles[matchedFile.key] = { name: file.name, size: file.size, file }
        } else {
          console.log("[v0] No match found for file:", file.name)
        }
      })
      onChange(newFiles)
    },
    [files, requiredFiles, onChange],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDragActive(false)
      console.log("[v0] Drop event triggered")

      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFiles(e.dataTransfer.files)
      }
    },
    [handleFiles],
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      e.preventDefault()
      console.log("[v0] Input change event triggered")
      if (e.target.files && e.target.files[0]) {
        handleFiles(e.target.files)
      }
    },
    [handleFiles],
  )

  const handleClick = useCallback(() => {
    console.log("[v0] Click handler triggered, opening file dialog")
    inputRef.current?.click()
  }, [])

  const removeFile = (key: string) => {
    const newFiles = { ...files }
    delete newFiles[key]
    onChange(newFiles)
  }

  const allFilesUploaded = requiredFiles.every((rf) => files[rf.key])

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium mb-2">必需文件清单</h3>
        <ul className="text-sm text-muted-foreground space-y-1">
          {requiredFiles.map((rf) => (
            <li key={rf.key} className="flex items-center gap-2">
              <span className={`inline-block w-2 h-2 rounded-full ${files[rf.key] ? "bg-green-500" : "bg-muted"}`} />
              {rf.label}
            </li>
          ))}
        </ul>
      </div>

      <Card
        className={`relative border-2 border-dashed transition-colors ${
          dragActive ? "border-primary bg-accent" : "border-border hover:border-muted-foreground"
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <div onClick={handleClick} className="flex flex-col items-center justify-center p-8 cursor-pointer">
          <Upload className="w-10 h-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium mb-1">点击选择文件或拖拽到此处</p>
          <p className="text-xs text-muted-foreground">支持 .xlsx 格式</p>
          <input
            ref={inputRef}
            id="file-upload"
            type="file"
            className="sr-only"
            multiple
            accept=".xlsx,.xls"
            onChange={handleChange}
          />
        </div>
      </Card>

      {Object.keys(files).length > 0 && (
        <div className="space-y-2">
          {Object.entries(files).map(([key, file]) => (
            <Card key={key} className="p-3">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(file.size)}
                    {file.size > 50 * 1024 * 1024 && (
                      <span className="ml-2 text-amber-600">文件较大，处理可能需要更长时间</span>
                    )}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => removeFile(key)} aria-label={`删除 ${file.name}`}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
