import { useCallback } from "react"

export interface UseClipboardReturn {
  copyToClipboard: (content: string) => boolean
  copyActiveCodeBlock: () => void
  copyAllCodeBlocks: () => void
}

export function useClipboard(
  markdown: string,
  cursorLine: number,
  setStatusMessage: React.Dispatch<React.SetStateAction<{ text: string; type: "success" | "error" | "info" } | null>>,
): UseClipboardReturn {
  // ─── Clipboard helper: use pbcopy on macOS ────────────────
  const copyToClipboard = useCallback((content: string): boolean => {
    try {
      const proc = Bun.spawnSync(["pbcopy"], {
        stdin: new Blob([content]),
      })
      return proc.exitCode === 0
    } catch {
      return false
    }
  }, [])

  // ─── Copy active code block content ───
  const copyActiveCodeBlock = useCallback(() => {
    const writeClipboard = (content: string) => {
      if (copyToClipboard(content)) {
        setStatusMessage({ text: "📋 Copied!", type: "success" })
      } else {
        setStatusMessage({ text: "❌ Copy failed", type: "error" })
      }
    }

    const cursorLine0 = cursorLine - 1
    const lines = markdown.split("\n")

    let inBlock = false
    let contentStart = 0

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line?.trimStart().startsWith("```")) {
        if (!inBlock) {
          inBlock = true
          contentStart = i + 1
        } else {
          const contentEnd = i - 1
          if (cursorLine0 >= contentStart && cursorLine0 <= contentEnd) {
            writeClipboard(lines.slice(contentStart, contentEnd + 1).join("\n"))
            return
          }
          inBlock = false
        }
      }
    }

    if (inBlock && cursorLine0 >= contentStart && cursorLine0 < lines.length) {
      writeClipboard(lines.slice(contentStart).join("\n"))
      return
    }

    setStatusMessage({ text: "❌ No code block at cursor", type: "error" })
  }, [markdown, cursorLine, copyToClipboard, setStatusMessage])

  // ─── Copy ALL fenced code block content ───
  const copyAllCodeBlocks = useCallback(() => {
    const writeClipboard = (content: string) => {
      if (copyToClipboard(content)) {
        setStatusMessage({ text: "📋 All code copied!", type: "success" })
      } else {
        setStatusMessage({ text: "❌ Copy failed", type: "error" })
      }
    }

    const lines = markdown.split("\n")
    const blocks: string[] = []
    let i = 0

    while (i < lines.length) {
      const line = lines[i]
      if (line?.trimStart().startsWith("```")) {
        const contentStart = i + 1
        let j = i + 1
        while (j < lines.length) {
          const fenceLine = lines[j]
          if (fenceLine?.trimStart().startsWith("```")) break
          j++
        }
        if (j < lines.length) {
          blocks.push(lines.slice(contentStart, j).join("\n"))
        }
        i = j + 1
      } else {
        i++
      }
    }

    if (blocks.length === 0) {
      setStatusMessage({ text: "❌ No code blocks in document", type: "error" })
      return
    }

    writeClipboard(blocks.join("\n\n─────\n\n"))
  }, [markdown, copyToClipboard, setStatusMessage])

  return { copyToClipboard, copyActiveCodeBlock, copyAllCodeBlocks }
}
