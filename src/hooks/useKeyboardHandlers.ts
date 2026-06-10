import { useKeyboard } from "@opentui/react"
import type { TextareaRenderable } from "@opentui/core"
import type { DialogMode } from "./useFileOperations"
import type { VimMode, VimCmdState } from "./useVimState"

interface FindState {
  query: string
  replacement: string
  matches: { start: number; end: number }[]
  currentIndex: number
  mode: "find" | "replace"
  focus: "query" | "replacement"
}

export interface UseKeyboardHandlersParams {
  // Find/replace
  findState: FindState | null
  setFindState: React.Dispatch<React.SetStateAction<FindState | null>>

  // Dialog
  dialogMode: DialogMode
  setDialogMode: React.Dispatch<React.SetStateAction<DialogMode>>
  setDialogPath: React.Dispatch<React.SetStateAction<string>>

  // Textarea
  textareaRef: React.RefObject<TextareaRenderable | null>

  // Vim state
  vimEnabled: boolean
  setVimEnabled: React.Dispatch<React.SetStateAction<boolean>>
  vimMode: VimMode
  setVimMode: React.Dispatch<React.SetStateAction<VimMode>>
  vimCmdStateRef: React.MutableRefObject<VimCmdState | null>
  setVimCmdState: React.Dispatch<React.SetStateAction<VimCmdState | null>>
  setShowHelp: React.Dispatch<React.SetStateAction<boolean>>
  showHelp: boolean
  enableTextareaInput: (ref: React.RefObject<TextareaRenderable | null>) => void
  disableTextareaInput: (ref: React.RefObject<TextareaRenderable | null>) => void

  // Status
  setStatusMessage: React.Dispatch<React.SetStateAction<{ text: string; type: "success" | "error" | "info" } | null>>

  // File operations
  currentFilePath: string | null
  saveFile: (filePath: string) => Promise<void>

  // Clipboard
  copyActiveCodeBlock: () => void
  copyAllCodeBlocks: () => void

  // Code wrap
  setCodeWrap: React.Dispatch<React.SetStateAction<boolean>>
  codeWrap: boolean

  // Vim handlers
  handleVimCmdKey: (key: any, state: VimCmdState) => void
  handleVimVisualKey: (key: any) => boolean
  handleVimNormalKey: (key: any) => boolean

  // Search
  runSearch: (query: string, markdownText: string) => { matches: { start: number; end: number }[]; currentIndex: number }
  handleContentChange: () => void
  markdown: string
  setMarkdown: React.Dispatch<React.SetStateAction<string>>
}

export function useKeyboardHandlers(params: UseKeyboardHandlersParams): void {
  const {
    findState, setFindState,
    dialogMode, setDialogMode, setDialogPath,
    textareaRef,
    vimEnabled, setVimEnabled, vimMode, setVimMode,
    vimCmdStateRef, setVimCmdState, setShowHelp, showHelp,
    enableTextareaInput, disableTextareaInput,
    setStatusMessage,
    currentFilePath, saveFile,
    copyActiveCodeBlock, copyAllCodeBlocks,
    setCodeWrap, codeWrap,
    handleVimCmdKey, handleVimVisualKey, handleVimNormalKey,
    runSearch, handleContentChange, markdown, setMarkdown,
  } = params

  useKeyboard((key) => {
    // ── 1. Find/Replace bar ──
    if (findState) {
      if (key.name === "escape") {
        setFindState(null)
        textareaRef.current?.focus()
        textareaRef.current?.clearSelection()
        textareaRef.current?.clearAllHighlights()
        return
      }

      if (key.name === "tab") {
        setFindState((prev) =>
          prev
            ? {
                ...prev,
                focus: prev.mode === "replace"
                  ? prev.focus === "query" ? "replacement" : "query"
                  : "query",
              }
            : null,
        )
        return
      }

      if (key.ctrl && key.name === "r" && findState.focus === "query") {
        setFindState((prev) =>
          prev
            ? {
                ...prev,
                mode: prev.mode === "find" ? "replace" : "find",
                focus: prev.mode === "find" ? "replacement" : "query",
              }
            : null,
        )
        return
      }

      if (key.name === "enter" || key.name === "return") {
        if (findState.focus === "query") {
          setFindState((prev) => {
            if (!prev || prev.matches.length === 0) return prev
            const delta = key.shift ? -1 : 1
            const count = prev.matches.length
            const newIndex = ((prev.currentIndex + delta) % count + count) % count
            const match = prev.matches[newIndex]
            if (match) textareaRef.current?.setSelection(match.start, match.end)
            return { ...prev, currentIndex: newIndex }
          })
        } else if (findState.mode === "replace") {
          const currentFind = findState
          if (currentFind.matches.length === 0) return
          if (key.shift) {
            for (let i = currentFind.matches.length - 1; i >= 0; i--) {
              const m = currentFind.matches[i]
              if (!m) continue
              textareaRef.current?.setSelection(m.start, m.end)
              textareaRef.current?.deleteSelection()
              textareaRef.current?.insertText(currentFind.replacement)
            }
            textareaRef.current?.clearSelection()
            handleContentChange()
            const newText = textareaRef.current?.plainText ?? markdown
            setMarkdown(newText)
            const { matches } = runSearch(currentFind.query, newText)
            setFindState((prev) =>
              prev ? { ...prev, matches, currentIndex: matches.length > 0 ? 0 : 0 } : prev,
            )
          } else {
            const match = currentFind.matches[currentFind.currentIndex]
            if (!match) return
            textareaRef.current?.setSelection(match.start, match.end)
            textareaRef.current?.deleteSelection()
            textareaRef.current?.insertText(currentFind.replacement)
            handleContentChange()
            const newText = textareaRef.current?.plainText ?? markdown
            setMarkdown(newText)
            const { matches } = runSearch(currentFind.query, newText)
            setFindState((prev) =>
              prev
                ? {
                    ...prev, matches,
                    currentIndex: matches.length > 0 ? Math.min(prev.currentIndex, matches.length - 1) : 0,
                  }
                : prev,
            )
          }
        }
        return
      }

      if (key.name === "backspace") {
        setFindState((prev) => {
          if (!prev) return prev
          const target = prev.focus === "query" ? prev.query : prev.replacement
          if (target.length === 0) return prev
          const newTarget = target.slice(0, -1)
          const updated = prev.focus === "query"
            ? { ...prev, query: newTarget }
            : { ...prev, replacement: newTarget }
          if (prev.focus === "query") {
            const { matches, currentIndex } = runSearch(newTarget, markdown)
            return { ...updated, matches, currentIndex }
          }
          return updated
        })
        return
      }

      if (key.name.length === 1 && !key.ctrl && !key.meta) {
        setFindState((prev) => {
          if (!prev) return prev
          const ch = key.name
          const updated = prev.focus === "query"
            ? { ...prev, query: prev.query + ch }
            : { ...prev, replacement: prev.replacement + ch }
          if (prev.focus === "query") {
            const { matches, currentIndex } = runSearch(prev.query + ch, markdown)
            return { ...updated, matches, currentIndex }
          }
          return updated
        })
        return
      }

      if (key.name === "space") {
        setFindState((prev) => {
          if (!prev) return prev
          const updated = prev.focus === "query"
            ? { ...prev, query: prev.query + " " }
            : { ...prev, replacement: prev.replacement + " " }
          if (prev.focus === "query") {
            const { matches, currentIndex } = runSearch(prev.query + " ", markdown)
            return { ...updated, matches, currentIndex }
          }
          return updated
        })
        return
      }

      return
    }

    // ── 2. Dialog mode ──
    if (dialogMode) {
      if (key.name === "escape") {
        setDialogMode(null)
        setDialogPath("")
        textareaRef.current?.focus()
      }
      return
    }

    // ── 3. Vim toggle (Ctrl+Z) ──
    if (key.ctrl && key.name === "z") {
      const wasEnabled = vimEnabled
      setVimEnabled(!wasEnabled)
      if (wasEnabled) {
        enableTextareaInput(textareaRef)
        setVimMode("insert")
        vimCmdStateRef.current = null
        setVimCmdState(null)
        setShowHelp(false)
      }
      setStatusMessage({ text: wasEnabled ? "🔴 Vim: OFF" : "🟢 Vim: ON", type: "info" })
      return
    }

    // ── 4. Global Ctrl/Option shortcuts ──
    if (key.ctrl && key.name === "s") {
      if (currentFilePath) { saveFile(currentFilePath) }
      else { setDialogPath(""); setDialogMode("save") }
      return
    }
    if (key.ctrl && key.name === "o") {
      setDialogPath(""); setDialogMode("open")
      return
    }
    if (key.ctrl && key.name === "k") {
      if (key.shift) { copyAllCodeBlocks() } else { copyActiveCodeBlock() }
      return
    }
    if (key.ctrl && key.name === "e") {
      if (key.shift) { setDialogPath(""); setDialogMode("export-single") }
      else { setDialogPath(""); setDialogMode("export") }
      return
    }
    if (key.ctrl && key.name === "f") {
      setFindState({ query: "", replacement: "", matches: [], currentIndex: 0, mode: "find", focus: "query" })
      return
    }
    if (key.option && key.name === "w") {
      setCodeWrap((prev) => !prev)
      key.preventDefault()
      setStatusMessage({ text: codeWrap ? "📜 Scroll mode" : "📐 Wrap mode", type: "info" })
      return
    }

    // ── 5. Help overlay ──
    if (showHelp) {
      if (key.name === "escape") {
        setShowHelp(false)
        textareaRef.current?.focus()
      }
      return
    }

    // ── 6. Escape ──
    if (key.name === "escape") {
      if (vimEnabled && vimMode === "insert") {
        disableTextareaInput(textareaRef); setVimMode("normal"); return
      }
      if (vimEnabled && vimMode === "visual") {
        disableTextareaInput(textareaRef); textareaRef.current?.clearSelection(); setVimMode("normal"); return
      }
      if (vimEnabled && vimMode === "normal") { return }
      process.exit(0)
      return
    }

    // ── 6. Vim command/search bar ──
    const currentCmdState = vimCmdStateRef.current
    if (vimEnabled && currentCmdState) {
      handleVimCmdKey(key, currentCmdState)
      return
    }

    // ── 7. Insert mode ──
    if (vimMode === "insert") { enableTextareaInput(textareaRef); return }

    // ── 8. Visual mode ──
    if (vimEnabled && vimMode === "visual") {
      disableTextareaInput(textareaRef)
      if (handleVimVisualKey(key)) return
    }

    // ── 9. Normal mode ──
    if (vimEnabled && vimMode === "normal") {
      disableTextareaInput(textareaRef)
      handleVimNormalKey(key)
    }
  })
}
