import { useCallback } from "react"
import type { TextareaRenderable } from "@opentui/core"
import type { ImageStatusInfo } from "../MarkdownPreview"
import type { DialogMode } from "./useFileOperations"

export interface UseAppUIReturn {
  handleImageStatus: (status: ImageStatusInfo) => void
  handleCancelDialog: () => void
}

export function useAppUI(
  setStatusMessage: React.Dispatch<React.SetStateAction<{ text: string; type: "success" | "error" | "info" } | null>>,
  setDialogMode: React.Dispatch<React.SetStateAction<DialogMode>>,
  setDialogPath: React.Dispatch<React.SetStateAction<string>>,
  textareaRef: React.RefObject<TextareaRenderable | null>,
): UseAppUIReturn {
  const handleImageStatus = useCallback((status: ImageStatusInfo) => {
    if (status) {
      setStatusMessage({ text: status.text, type: status.type })
    }
  }, [])

  const handleCancelDialog = useCallback(() => {
    setDialogMode(null)
    setDialogPath("")
    textareaRef.current?.focus()
  }, [setDialogMode, setDialogPath, textareaRef])

  return { handleImageStatus, handleCancelDialog }
}
