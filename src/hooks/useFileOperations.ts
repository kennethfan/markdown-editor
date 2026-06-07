import { useState, useRef, useCallback, useEffect, useMemo } from "react"
import type { TextareaRenderable } from "@opentui/core"

export type DialogMode = "save" | "open" | "export" | "export-single" | null

export interface StatusMessage {
  text: string
  type: "success" | "error" | "info"
}

export interface UseFileOperationsReturn {
  currentFilePath: string | null
  dialogMode: DialogMode
  dialogPath: string
  statusMessage: StatusMessage | null
  isModified: boolean
  setDialogMode: React.Dispatch<React.SetStateAction<DialogMode>>
  setDialogPath: React.Dispatch<React.SetStateAction<string>>
  setStatusMessage: React.Dispatch<React.SetStateAction<StatusMessage | null>>
  saveFile: (filePath: string) => Promise<void>
  loadFile: (filePath: string) => Promise<void>
  handleDialogSubmit: () => void
}

export function useFileOperations(
  textareaRef: React.RefObject<TextareaRenderable | null>,
  markdown: string,
  setMarkdown: (value: string) => void,
): UseFileOperationsReturn {
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null)
  const [dialogMode, setDialogMode] = useState<DialogMode>(null)
  const [dialogPath, setDialogPath] = useState("")
  const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(null)

  // Track the last saved/loaded content for modified indicator
  const savedContentRef = useRef(markdown)

  // Markdown is modified if it differs from the last saved content
  const isModified = useMemo(
    () => markdown !== savedContentRef.current,
    [markdown],
  )

  // Auto-clear status messages after 3 seconds
  useEffect(() => {
    if (statusMessage) {
      const timer = setTimeout(() => setStatusMessage(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [statusMessage])

  const saveFile = useCallback(
    async (filePath: string) => {
      try {
        const text = textareaRef.current?.plainText ?? markdown
        await Bun.write(filePath, text, { createPath: true })
        setCurrentFilePath(filePath)
        savedContentRef.current = text
        setStatusMessage({ text: `✅ Saved: ${filePath}`, type: "success" })
        setDialogMode(null)
      } catch (err) {
        setStatusMessage({
          text: `❌ Save failed: ${(err as Error).message}`,
          type: "error",
        })
      }
    },
    [markdown, textareaRef],
  )

  const loadFile = useCallback(
    async (filePath: string) => {
      try {
        const file = Bun.file(filePath)
        const exists = await file.exists()
        if (!exists) {
          setStatusMessage({ text: `❌ File not found: ${filePath}`, type: "error" })
          return
        }
        const text = await file.text()
        setCurrentFilePath(filePath)
        savedContentRef.current = text
        setMarkdown(text)
        textareaRef.current?.setText(text)
        setStatusMessage({ text: `📂 Loaded: ${filePath}`, type: "success" })
        setDialogMode(null)
      } catch (err) {
        setStatusMessage({
          text: `❌ Load failed: ${(err as Error).message}`,
          type: "error",
        })
      }
    },
    [textareaRef, setMarkdown],
  )

  const handleDialogSubmit = useCallback(() => {
    const path = dialogPath.trim()
    if (!path) return
    if (dialogMode === "save") {
      saveFile(path)
    } else if (dialogMode === "open") {
      loadFile(path)
    }
    textareaRef.current?.focus()
  }, [dialogPath, dialogMode, saveFile, loadFile, textareaRef])

  return {
    currentFilePath,
    dialogMode,
    dialogPath,
    statusMessage,
    isModified,
    setDialogMode,
    setDialogPath,
    setStatusMessage,
    saveFile,
    loadFile,
    handleDialogSubmit,
  }
}
