import { useCallback } from "react"
import type { TextareaRenderable } from "@opentui/core"
import type { DialogMode } from "./useFileOperations"
import { extractCodeBlocksWithLang } from "../vim-helpers"

// Language → file extension mapping for code block export
const LANG_EXTENSIONS: Record<string, string> = {
  javascript: "js",
  typescript: "ts",
  python: "py",
  ruby: "rb",
  go: "go",
  rust: "rs",
  java: "java",
  c: "c",
  cpp: "cpp",
  csharp: "cs",
  html: "html",
  css: "css",
  bash: "sh",
  shell: "sh",
  json: "json",
  yaml: "yml",
  yml: "yml",
  xml: "xml",
  sql: "sql",
  php: "php",
  swift: "swift",
  kotlin: "kt",
  scala: "scala",
  dart: "dart",
  elixir: "ex",
  haskell: "hs",
  lua: "lua",
  zig: "zig",
  toml: "toml",
  dockerfile: "dockerfile",
  makefile: "Makefile",
  markdown: "md",
  text: "txt",
}

export interface UseExportReturn {
  handleExportSubmit: () => Promise<void>
  handleExportSingleSubmit: () => Promise<void>
}

export function useExport(
  dialogPath: string,
  markdown: string,
  setStatusMessage: React.Dispatch<React.SetStateAction<{ text: string; type: "success" | "error" | "info" } | null>>,
  setDialogMode: React.Dispatch<React.SetStateAction<DialogMode>>,
  textareaRef: React.RefObject<TextareaRenderable | null>,
): UseExportReturn {
  const handleExportSubmit = useCallback(async () => {
    const dir = dialogPath.trim()
    if (!dir) return

    const blocks = extractCodeBlocksWithLang(markdown)
    if (blocks.length === 0) {
      setStatusMessage({ text: "❌ No code blocks to export", type: "error" })
      setDialogMode(null)
      textareaRef.current?.focus()
      return
    }

    const langCounts: Record<string, number> = {}
    const written: string[] = []

    for (let idx = 0; idx < blocks.length; idx++) {
      const block = blocks[idx]
      if (!block) continue
      const { content, lang } = block
      const ext = LANG_EXTENSIONS[lang] || "txt"
      const prefix = lang || "code"
      langCounts[prefix] = (langCounts[prefix] || 0) + 1
      const label = langCounts[prefix] > 1
        ? `${prefix}_${langCounts[prefix]}`
        : prefix
      const filename = `${String(idx + 1).padStart(2, "0")}_${label}.${ext}`
      const filePath = `${dir.replace(/\/$/, "")}/${filename}`

      try {
        await Bun.write(filePath, content, { createPath: true })
        written.push(filename)
      } catch (err) {
        setStatusMessage({
          text: `❌ Export failed: ${filename} — ${(err as Error).message}`,
          type: "error",
        })
        setDialogMode(null)
        textareaRef.current?.focus()
        return
      }
    }

    setStatusMessage({
      text: `✅ Exported ${written.length} ${written.length === 1 ? "file" : "files"} to ${dir}`,
      type: "success",
    })
    setDialogMode(null)
    textareaRef.current?.focus()
  }, [dialogPath, markdown, setStatusMessage, setDialogMode, textareaRef])

  const handleExportSingleSubmit = useCallback(async () => {
    const filePath = dialogPath.trim()
    if (!filePath) return

    const blocks = extractCodeBlocksWithLang(markdown)
    if (blocks.length === 0) {
      setStatusMessage({ text: "❌ No code blocks to export", type: "error" })
      setDialogMode(null)
      textareaRef.current?.focus()
      return
    }

    const parts: string[] = []
    for (let idx = 0; idx < blocks.length; idx++) {
      const block = blocks[idx]
      if (!block) continue
      const { content, lang } = block
      const langLabel = lang || "text"
      const ext = LANG_EXTENSIONS[lang] || "txt"
      const header = `// ─── Code Block ${idx + 1}: ${langLabel} (.${ext}) ───`
      const separator = idx === 0 ? "" : "\n"
      parts.push(`${separator}${header}\n${content}`)
    }
    const combined = parts.join("\n") + "\n"

    try {
      await Bun.write(filePath, combined, { createPath: true })
      setStatusMessage({
        text: `✅ Exported ${blocks.length} ${blocks.length === 1 ? "block" : "blocks"} → ${filePath}`,
        type: "success",
      })
    } catch (err) {
      setStatusMessage({
        text: `❌ Export failed: ${(err as Error).message}`,
        type: "error",
      })
    }

    setDialogMode(null)
    textareaRef.current?.focus()
  }, [dialogPath, markdown, setStatusMessage, setDialogMode, textareaRef])

  return { handleExportSubmit, handleExportSingleSubmit }
}
