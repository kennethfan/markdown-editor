import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import { useState, useRef, useCallback, useMemo } from "react"
import { SyntaxStyle, type TextareaRenderable } from "@opentui/core"
import { MarkdownPreview, type ImageStatusInfo } from "./MarkdownPreview"
import path from "node:path"
import { useFileOperations } from "./hooks/useFileOperations"
import { StatusBar } from "./components/StatusBar"
import { FileDialog } from "./components/FileDialog"
import { FindReplaceBar } from "./components/FindReplaceBar"
import { VimCmdBar } from "./components/VimCmdBar"
import { HelpOverlay } from "./components/HelpOverlay"

type VimMode = "normal" | "insert" | "visual"
type VimPendingOp = "d" | "y" | "c" | ">" | "<" | "g" | null

const DEFAULT_MARKDOWN = `# Markdown Editor

Welcome to your **terminal-based** markdown editor!

## Features

- ✏️ **Left pane**: Type markdown in real-time
- 👁️ **Right pane**: See the rendered preview instantly
- ⌨️ **Shortcuts**: \`Ctrl+S\` save · \`Ctrl+K\` copy · \`Ctrl+Shift+K\` copy all · \`Ctrl+E\` export · \`Ctrl+Shift+E\` export single · \`Ctrl+F\` find · \`Alt+W\` wrap · \`Ctrl+O\` open · \`Esc\` exit

## Formatting

### Text styles

- **Bold text** with \`**\`
- *Italic text* with \`*\`
- ~~Strikethrough~~ with \`~~\`
- \`Inline code\` with backticks

### Code blocks

\`\`\`javascript
function fibonacci(n) {
  if (n <= 1) return n
  return fibonacci(n - 1) + fibonacci(n - 2)
}
console.log(fibonacci(10))
\`\`\`

### Blockquotes

> The only way to do great work
> is to love what you do.
> — Steve Jobs

### Lists

1. First item
2. Second item
3. Third item

- Unordered item
- Another item

### Links

[OpenTUI](https://opentui.com) — built with Zig
`

export function App() {
  const [markdown, setMarkdown] = useState(DEFAULT_MARKDOWN)
  const textareaRef = useRef<TextareaRenderable>(null)
  const { width, height } = useTerminalDimensions()

  // Cursor position
  const [cursorLine, setCursorLine] = useState(1)
  const [cursorCol, setCursorCol] = useState(1)

  // Code block word-wrap toggle (Alt+W)
  const [codeWrap, setCodeWrap] = useState(true)

  // Find/replace state
  const [findState, setFindState] = useState<{
    query: string
    replacement: string
    matches: { start: number; end: number }[]
    currentIndex: number
    mode: "find" | "replace"
    focus: "query" | "replacement"
  } | null>(null)

  // Vim mode state
  const [vimMode, setVimMode] = useState<VimMode>("insert")
  const [vimEnabled, setVimEnabled] = useState(true)
  const vimYankRef = useRef("")
  const vimCountRef = useRef("")
  const vimPendingOpRef = useRef<VimPendingOp>(null)
  const vimGCountRef = useRef("") // stash count for gg
  // Ref for repeating last edit operation (.)
  const vimRepeatRef = useRef<(() => void) | null>(null)

  // Vim command/search bar state
  const [vimCmdState, setVimCmdState] = useState<{
    mode: "search" | "command"
    input: string
  } | null>(null)
  // Sync ref for vimCmdState to avoid async React state race conditions
  const vimCmdStateRef = useRef<{
    mode: "search" | "command"
    input: string
  } | null>(null)
  // Persistent search state for n/N navigation
  const vimSearchRef = useRef({
    query: "",
    matches: [] as { start: number; end: number }[],
    currentIndex: 0,
  })
  // Help overlay state
  const [showHelp, setShowHelp] = useState(false)

  // Cached styleId for search highlight (registered on textarea syntaxStyle)
  const vimSearchHlStyleIdRef = useRef<number | null>(null)

  // Ref for saving/restoring textarea's handleKeyPress (direct override to prevent
  // textarea from processing keys in NORMAL/VISUAL mode, bypassing OpenTUI's event routing)
  const savedHandleKeyPressRef = useRef<((key: any) => boolean) | null>(null)
  const textareaInputEnabledRef = useRef(true)

  // Disable textarea's internal keypress handler (for NORMAL/VISUAL mode)
  const disableTextareaInput = useCallback(() => {
    const ta = textareaRef.current
    if (!ta || !textareaInputEnabledRef.current) return
    savedHandleKeyPressRef.current = ta.handleKeyPress
    ta.handleKeyPress = () => false
    textareaInputEnabledRef.current = false
  }, [textareaRef])

  // Restore textarea's original keypress handler (for INSERT mode)
  const enableTextareaInput = useCallback(() => {
    const ta = textareaRef.current
    if (!ta || textareaInputEnabledRef.current) return
    if (savedHandleKeyPressRef.current) {
      ta.handleKeyPress = savedHandleKeyPressRef.current
    }
    savedHandleKeyPressRef.current = null
    textareaInputEnabledRef.current = true
  }, [textareaRef])

  const {
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
  } = useFileOperations(textareaRef, markdown, setMarkdown)

  // Calculate layout dimensions
  const halfWidth = Math.floor(width / 2) - 1
  const mainHeight = height - 2

  // Directory of the current file for relative image path resolution
  const baseDir = useMemo(() => {
    if (currentFilePath) {
      return path.dirname(currentFilePath)
    }
    return undefined
  }, [currentFilePath])

  // Word count derived from markdown
  const wordCount = useMemo(() => {
    const text = markdown.trim()
    if (!text) return 0
    return text.split(/\s+/).length
  }, [markdown])

  const handleContentChange = useCallback(() => {
    if (textareaRef.current) {
      setMarkdown(textareaRef.current.plainText)
    }
  }, [textareaRef, setMarkdown])

  const handleCursorChange = useCallback(
    (event: { line: number; visualColumn: number }) => {
      setCursorLine(event.line + 1)
      setCursorCol(event.visualColumn + 1)
    },
    [],
  )

  // ─── Vim mode helpers ────────────────────────────────────────

  // Reset count and pending operator refs
  const resetVimRefs = useCallback(() => {
    vimCountRef.current = ""
    vimPendingOpRef.current = null
  }, [])

  // Execute a motion on the textarea (for d{motion}, y{motion})
  const applyVimMotion = useCallback(
    (keyName: string, count: number, select: boolean): boolean => {
      const ta = textareaRef.current
      if (!ta) return false
      const moved = {
        h: () => ta.moveCursorLeft({ select }),
        j: () => ta.moveCursorDown({ select }),
        k: () => ta.moveCursorUp({ select }),
        l: () => ta.moveCursorRight({ select }),
        w: () => ta.moveWordForward({ select }),
        b: () => ta.moveWordBackward({ select }),
        e: () => ta.moveWordForward({ select }),
        "0": () => ta.gotoLineHome({ select }),
        "$": () => ta.gotoLineEnd({ select }),
        "^": () => ta.gotoLineTextEnd(),
        G: () => ta.gotoBufferEnd({ select }),
      } as Record<string, () => boolean | void>
      const fn = moved[keyName]
      if (fn) {
        for (let i = 0; i < count; i++) fn()
        return true
      }
      return false
    },
    [textareaRef],
  )

  // Execute an operator on a selection range
  const executePendingOp = useCallback(
    (op: "d" | "y" | "c", count: number, motionKey: string): boolean => {
      const ta = textareaRef.current
      if (!ta) return false

      // Select target range
      if (!applyVimMotion(motionKey, count, true)) return false

      const selected = ta.getSelectedText()
      if (!selected) return false

      vimYankRef.current = selected

      if (op === "d" || op === "c") {
        ta.deleteSelection()
        if (op === "c") {
          ta.focus()
          setVimMode("insert")
        }
      } else {
        ta.clearSelection()
      }
      resetVimRefs()
      return true
    },
    [textareaRef, applyVimMotion, resetVimRefs],
  )

  // Indent lines: add 2 spaces at the start of each line
  const indentLines = useCallback(
    (startLine: number, count: number): void => {
      const ta = textareaRef.current
      if (!ta) return
      const lines = ta.plainText.split("\n")
      const endLine = Math.min(startLine + count - 1, lines.length - 1)
      for (let i = startLine; i <= endLine; i++) {
        const line = lines[i]
        if (line !== undefined) {
          lines[i] = "  " + line
        }
      }
      ta.replaceText(lines.join("\n"))
      handleContentChange()
    },
    [textareaRef, handleContentChange],
  )

  // Deindent lines: remove up to 2 leading spaces from each line
  const deindentLines = useCallback(
    (startLine: number, count: number): void => {
      const ta = textareaRef.current
      if (!ta) return
      const lines = ta.plainText.split("\n")
      const endLine = Math.min(startLine + count - 1, lines.length - 1)
      for (let i = startLine; i <= endLine; i++) {
        const line = lines[i]
        if (line !== undefined) {
          lines[i] = line.replace(/^ {1,2}/, "")
        }
      }
      ta.replaceText(lines.join("\n"))
      handleContentChange()
    },
    [textareaRef, handleContentChange],
  )

  // Handle normal-mode vim keys
  const handleVimNormalKey = useCallback(
    (key: any): boolean => {
      const ta = textareaRef.current
      if (!ta) return true // swallow if no textarea

      // Handle Ctrl shortcuts that should work in normal mode
      if (key.ctrl && key.name === "r") {
        ta.redo()
        handleContentChange()
        return true
      }

      // Only non-modifier keys (except Ctrl+R handled above)
      if (key.ctrl || key.meta || key.option) return true
      if (key.name === "tab") return true
      if (key.name === "enter" || key.name === "return") {
        ta.newLine()
        return true
      }
      if (key.name === "backspace") {
        ta.moveCursorLeft()
        return true
      }

      const countStr = vimCountRef.current
      const count = countStr ? Math.max(1, parseInt(countStr) || 1) : 1
      const pendingOp = vimPendingOpRef.current

      // ── With pending operator (d{motion}, c{motion}, y{motion}) ──
      if (pendingOp && pendingOp !== "g") {
        // Repeated same key = line operation (dd, yy, cc, >>, <<)
        if (key.name === pendingOp) {
          const lineIdx = ta.logicalCursor.row
          vimCountRef.current = "" // reset count

          if (pendingOp === "d") {
            // Yank + delete count lines
            const yankedLines: string[] = []
            for (let i = 0; i < Math.min(count, ta.lineCount - lineIdx); i++) {
              yankedLines.push(ta.plainText.split("\n")[lineIdx + i] ?? "")
            }
            vimYankRef.current = yankedLines.join("\n") + "\n"
            for (let i = 0; i < Math.min(count, ta.lineCount - lineIdx); i++) {
              ta.deleteLine()
            }
            handleContentChange()
            vimRepeatRef.current = () => {
              const curLine = ta.logicalCursor.row
              vimYankRef.current = yankedLines.join("\n") + "\n"
              for (let i = 0; i < Math.min(count, ta.lineCount - curLine); i++) {
                ta.deleteLine()
              }
              handleContentChange()
            }
          } else if (pendingOp === "y") {
            // Yank y lines
            const yankedLines: string[] = []
            for (let i = 0; i < Math.min(count, ta.lineCount - lineIdx); i++) {
              yankedLines.push(ta.plainText.split("\n")[lineIdx + i] ?? "")
            }
            vimYankRef.current = yankedLines.join("\n") + "\n"
          } else if (pendingOp === "c") {
            // Change line: delete and enter insert mode
            const yankedLines: string[] = []
            for (let i = 0; i < Math.min(count, ta.lineCount - lineIdx); i++) {
              yankedLines.push(ta.plainText.split("\n")[lineIdx + i] ?? "")
            }
            vimYankRef.current = yankedLines.join("\n") + "\n"
            for (let i = 0; i < Math.min(count, ta.lineCount - lineIdx); i++) {
              ta.deleteLine()
            }
            handleContentChange()
            vimRepeatRef.current = () => {
              const curLine = ta.logicalCursor.row
              for (let i = 0; i < Math.min(count, ta.lineCount - curLine); i++) {
                ta.deleteLine()
              }
              handleContentChange()
              ta.focus()
              setVimMode("insert")
            }
            ta.focus()
            setVimMode("insert")
          } else if (pendingOp === ">") {
            // Indent count lines
            indentLines(lineIdx, Math.min(count, ta.lineCount - lineIdx))
            vimRepeatRef.current = () => {
              indentLines(ta.logicalCursor.row, Math.min(count, ta.lineCount - ta.logicalCursor.row))
            }
          } else if (pendingOp === "<") {
            // Deindent count lines
            deindentLines(lineIdx, Math.min(count, ta.lineCount - lineIdx))
            vimRepeatRef.current = () => {
              deindentLines(ta.logicalCursor.row, Math.min(count, ta.lineCount - ta.logicalCursor.row))
            }
          }

          resetVimRefs()
          return true
        }

        // Operator + motion (dw, cw, y$, etc.)
        if (pendingOp === "c" || pendingOp === "d" || pendingOp === "y") {
          if (executePendingOp(pendingOp as "d" | "y" | "c", count, key.name)) {
            handleContentChange()
            if (pendingOp === "c") {
              vimRepeatRef.current = () => {
                if (executePendingOp("d", count, key.name)) {
                  handleContentChange()
                  setVimMode("insert")
                }
              }
            } else if (pendingOp === "d") {
              vimRepeatRef.current = () => {
                if (executePendingOp("d", count, key.name)) {
                  handleContentChange()
                }
              }
            }
            resetVimRefs()
            return true
          }
        }

        // Unknown motion -> cancel
        resetVimRefs()
        return true
      }

      // ── Two-chord `gg` ──
      if (key.name === "g" && pendingOp === "g") {
        // Count + gg = goto line N (0-indexed, so 5gg = line 4)
        const ggCount = vimGCountRef.current || countStr
        vimGCountRef.current = ""
        const targetLine = ggCount ? Math.max(0, parseInt(ggCount) - 1) : 0
        if (targetLine === 0) {
          ta.gotoBufferHome()
        } else if (targetLine < ta.lineCount) {
          ta.setCursor(targetLine, 0)
        } else {
          ta.gotoBufferEnd()
        }
        resetVimRefs()
        return true
      }
      if (pendingOp === "g") {
        // Was waiting for second g, got something else -> reset
        resetVimRefs()
      }

      // ── Number prefix ──
      if (/^[0-9]$/.test(key.name) && !pendingOp) {
        vimCountRef.current += key.name
        return true
      }

      // ── Mode switching ──
      if (key.name === "i" && !key.shift) {
        ta.focus()
        setVimMode("insert")
        return true
      }
      if (key.name === "a" && !key.shift) {
        ta.moveCursorRight()
        ta.focus()
        setVimMode("insert")
        return true
      }
      if (key.name === "i" && key.shift) {
        ta.gotoLineStart()
        ta.focus()
        setVimMode("insert")
        return true
      }
      if (key.name === "a" && key.shift) {
        ta.gotoLineEnd()
        ta.focus()
        setVimMode("insert")
        return true
      }
      if (key.name === "o" && !key.shift) {
        ta.gotoLineEnd()
        ta.newLine()
        handleContentChange()
        ta.focus()
        setVimMode("insert")
        return true
      }
      if (key.name === "o" && key.shift) {
        ta.gotoLineStart()
        ta.newLine()
        ta.moveCursorUp()
        handleContentChange()
        ta.focus()
        setVimMode("insert")
        return true
      }
      if (key.name === "v") {
        setVimMode("visual")
        return true
      }

      // ── Vim search/command ──
      if (key.name === "/") {
        const newState = { mode: "search" as const, input: "" }
        setVimCmdState(newState)
        vimCmdStateRef.current = newState
        return true
      }
      if (key.name === ":") {
        const newState = { mode: "command" as const, input: "" }
        setVimCmdState(newState)
        vimCmdStateRef.current = newState
        return true
      }

      // n/N for search navigation
      if (key.name === "n" && !key.shift) {
        const search = vimSearchRef.current
        if (search.query && search.matches.length > 0) {
          const newIdx = (search.currentIndex + 1) % search.matches.length
          search.currentIndex = newIdx
          const match = search.matches[newIdx]
          if (match && ta) {
            ta.setSelection(match.start, match.end)
          }
        }
        vimCountRef.current = ""
        return true
      }
      if (key.name === "n" && key.shift) {
        const search = vimSearchRef.current
        if (search.query && search.matches.length > 0) {
          const newIdx = (search.currentIndex - 1 + search.matches.length) % search.matches.length
          search.currentIndex = newIdx
          const match = search.matches[newIdx]
          if (match && ta) {
            ta.setSelection(match.start, match.end)
          }
        }
        vimCountRef.current = ""
        return true
      }

      // ── Movement (reset count after use) ──
      if (key.name === "h") {
        vimCountRef.current = ""
        for (let i = 0; i < count; i++) ta.moveCursorLeft()
        return true
      }
      if (key.name === "j" && !key.shift) {
        vimCountRef.current = ""
        for (let i = 0; i < count; i++) ta.moveCursorDown()
        return true
      }
      if (key.name === "k") {
        vimCountRef.current = ""
        for (let i = 0; i < count; i++) ta.moveCursorUp()
        return true
      }
      if (key.name === "l") {
        vimCountRef.current = ""
        for (let i = 0; i < count; i++) ta.moveCursorRight()
        return true
      }
      if (key.name === "w") {
        vimCountRef.current = ""
        for (let i = 0; i < count; i++) ta.moveWordForward()
        return true
      }
      if (key.name === "b") {
        vimCountRef.current = ""
        for (let i = 0; i < count; i++) ta.moveWordBackward()
        return true
      }
      if (key.name === "e") {
        vimCountRef.current = ""
        for (let i = 0; i < count; i++) ta.moveWordForward()
        return true
      }
      if (key.name === "0") {
        vimCountRef.current = ""
        ta.gotoLineStart()
        return true
      }
      if (key.name === "$") {
        vimCountRef.current = ""
        ta.gotoLineEnd()
        return true
      }
      if (key.name === "^") {
        vimCountRef.current = ""
        ta.gotoLineTextEnd()
        return true
      }
      if (key.name === "g" && !key.shift) {
        // Stash count for the second g (gg with count)
        vimGCountRef.current = vimCountRef.current
        vimCountRef.current = ""
        vimPendingOpRef.current = "g"
        return true
      }
      if (key.name === "g" && key.shift) {
        vimCountRef.current = ""
        ta.gotoBufferEnd()
        return true
      }

      // ── Editing ──
      if (key.name === "x") {
        vimCountRef.current = ""
        const xCount = count
        for (let i = 0; i < xCount; i++) ta.deleteChar()
        handleContentChange()
        vimRepeatRef.current = () => {
          for (let i = 0; i < xCount; i++) ta.deleteChar()
          handleContentChange()
        }
        return true
      }
      if (key.name === "d") {
        vimPendingOpRef.current = "d"
        return true
      }
      if (key.name === "y") {
        vimPendingOpRef.current = "y"
        return true
      }
      if (key.name === "c") {
        vimPendingOpRef.current = "c"
        return true
      }
      if (key.name === ">") {
        vimPendingOpRef.current = ">"
        return true
      }
      if (key.name === "<") {
        vimPendingOpRef.current = "<"
        return true
      }
      if (key.name === "p" && !key.shift) {
        vimCountRef.current = ""
        if (vimYankRef.current) {
          const txt = vimYankRef.current
          ta.insertText(txt)
          handleContentChange()
          vimRepeatRef.current = () => {
            ta.insertText(txt)
            handleContentChange()
          }
        }
        return true
      }
      if (key.name === "p" && key.shift) {
        vimCountRef.current = ""
        if (vimYankRef.current) {
          const txt = vimYankRef.current
          ta.moveCursorLeft()
          ta.insertText(txt)
          handleContentChange()
          vimRepeatRef.current = () => {
            ta.moveCursorLeft()
            ta.insertText(txt)
            handleContentChange()
          }
        }
        return true
      }
      // ── Join line (J): merge next line into current with a space ──
      if (key.name === "j" && key.shift) {
        vimCountRef.current = ""
        const curLine = ta.logicalCursor.row
        if (curLine + 1 < ta.lineCount) {
          ta.gotoLineEnd()
          ta.deleteChar() // removes newline, next line text joins
          // Remove leading whitespace from joined content, then add single space
          const joinPos = ta.cursorOffset
          const text = ta.plainText
          let spaceCount = 0
          while (joinPos + spaceCount < text.length && text[joinPos + spaceCount] === " ") {
            spaceCount++
          }
          for (let i = 0; i < spaceCount; i++) {
            ta.deleteChar()
          }
          ta.insertText(" ")
          handleContentChange()
        }
        return true
      }

      if (key.name === "u") {
        vimCountRef.current = ""
        ta.undo()
        handleContentChange()
        return true
      }

      // ── Repeat last edit (.) ──
      if (key.name === ".") {
        vimRepeatRef.current?.()
        return true
      }

      // Swallow all other printable keys
      return true
    },
    [textareaRef, executePendingOp, resetVimRefs, handleContentChange],
  )

  // Handle visual-mode vim keys
  const handleVimVisualKey = useCallback(
    (key: any): boolean => {
      const ta = textareaRef.current
      if (!ta) return true

      if (key.name === "escape" || (key.ctrl && key.name === "c")) {
        ta.clearSelection()
        setVimMode("normal")
        return true
      }

      if (key.ctrl || key.meta || key.option) return false

      const countStr = vimCountRef.current
      const count = countStr ? Math.max(1, parseInt(countStr) || 1) : 1

      // Number prefix
      if (/^[0-9]$/.test(key.name)) {
        vimCountRef.current += key.name
        return true
      }

      // Movement with selection (reset count after use)
      if (key.name === "h") {
        vimCountRef.current = ""
        for (let i = 0; i < count; i++) ta.moveCursorLeft({ select: true })
        return true
      }
      if (key.name === "j") {
        vimCountRef.current = ""
        for (let i = 0; i < count; i++) ta.moveCursorDown({ select: true })
        return true
      }
      if (key.name === "k") {
        vimCountRef.current = ""
        for (let i = 0; i < count; i++) ta.moveCursorUp({ select: true })
        return true
      }
      if (key.name === "l") {
        vimCountRef.current = ""
        for (let i = 0; i < count; i++) ta.moveCursorRight({ select: true })
        return true
      }
      if (key.name === "w") {
        vimCountRef.current = ""
        ta.moveWordForward({ select: true })
        return true
      }
      if (key.name === "b") {
        vimCountRef.current = ""
        ta.moveWordBackward({ select: true })
        return true
      }
      if (key.name === "e") {
        vimCountRef.current = ""
        ta.moveWordForward({ select: true })
        return true
      }
      if (key.name === "0") {
        vimCountRef.current = ""
        ta.gotoLineHome({ select: true })
        return true
      }
      if (key.name === "$") {
        vimCountRef.current = ""
        ta.gotoLineEnd({ select: true })
        return true
      }
      if (key.name === "g" && key.shift) {
        vimCountRef.current = ""
        ta.gotoBufferEnd({ select: true })
        return true
      }

      // Delete selection
      if (key.name === "d" || key.name === "x") {
        vimCountRef.current = ""
        const text = ta.getSelectedText()
        if (text) vimYankRef.current = text
        ta.deleteSelection()
        handleContentChange()
        setVimMode("normal")
        return true
      }

      // Yank selection
      if (key.name === "y") {
        vimCountRef.current = ""
        const text = ta.getSelectedText()
        if (text) vimYankRef.current = text
        ta.clearSelection()
        setVimMode("normal")
        return true
      }

      // Change selection (delete + insert mode)
      if (key.name === "c") {
        vimCountRef.current = ""
        const text = ta.getSelectedText()
        if (text) vimYankRef.current = text
        ta.deleteSelection()
        handleContentChange()
        ta.focus()
        setVimMode("insert")
        return true
      }

      // Indent selection (add 2 spaces to start of each selected line)
      if (key.name === ">") {
        vimCountRef.current = ""
        const sel = ta.getSelection()
        if (sel) {
          const text = ta.plainText
          const startLine = text.slice(0, sel.start).split("\n").length - 1
          const endLine = text.slice(0, sel.end).split("\n").length - 1
          indentLines(startLine, endLine - startLine + 1)
        }
        ta.clearSelection()
        setVimMode("normal")
        return true
      }

      // Deindent selection
      if (key.name === "<") {
        vimCountRef.current = ""
        const sel = ta.getSelection()
        if (sel) {
          const text = ta.plainText
          const startLine = text.slice(0, sel.start).split("\n").length - 1
          const endLine = text.slice(0, sel.end).split("\n").length - 1
          deindentLines(startLine, endLine - startLine + 1)
        }
        ta.clearSelection()
        setVimMode("normal")
        return true
      }

      // Swallow all other keys
      return true
    },
    [textareaRef, handleContentChange],
  )

  // ─── Vim search highlight helpers ───────────────────────────

  // Ensure the search highlight style is registered on the textarea's SyntaxStyle
  const ensureSearchHighlightStyle = useCallback((ta: TextareaRenderable): number | null => {
    if (vimSearchHlStyleIdRef.current !== null) {
      return vimSearchHlStyleIdRef.current
    }

    let syntaxStyle = ta.syntaxStyle
    if (!syntaxStyle) {
      // Create a new SyntaxStyle with just the search highlight
      syntaxStyle = SyntaxStyle.fromStyles({
        searchHighlight: { bg: "#534d1a" },
      })
      ta.syntaxStyle = syntaxStyle
    } else {
      syntaxStyle.registerStyle("searchHighlight", { bg: "#534d1a" })
    }

    const styleId = syntaxStyle.resolveStyleId("searchHighlight")
    if (styleId !== null) {
      vimSearchHlStyleIdRef.current = styleId
    }
    return styleId
  }, [])

  // Apply highlights for all vim search matches
  const applyVimSearchHighlights = useCallback(
    (ta: TextareaRenderable, matches: { start: number; end: number }[]): void => {
      ta.clearAllHighlights()
      if (matches.length === 0) return

      const styleId = ensureSearchHighlightStyle(ta)
      if (styleId === null) return

      for (const m of matches) {
        ta.addHighlightByCharRange({ start: m.start, end: m.end, styleId })
      }
    },
    [ensureSearchHighlightStyle],
  )

  // Find all substring match offsets (case-insensitive)
  const findAllMatches = useCallback(
    (query: string, text: string): { start: number; end: number }[] => {
      if (!query) return []
      const matches: { start: number; end: number }[] = []
      const lowerText = text.toLowerCase()
      const lowerQuery = query.toLowerCase()
      let startIndex = 0
      while (startIndex < lowerText.length) {
        const idx = lowerText.indexOf(lowerQuery, startIndex)
        if (idx === -1) break
        matches.push({ start: idx, end: idx + query.length })
        startIndex = idx + 1
      }
      return matches
    },
    [],
  )

  // Parse and execute a :s substitute command
  // Supports: :s/pattern/replacement/flags, :%s/pattern/replacement/flags
  const executeSubstitute = useCallback(
    (cmd: string): void => {
      const ta = textareaRef.current
      if (!ta) return

      // Determine if it starts with s or %s
      const fileWide = cmd.startsWith("%s") || cmd.startsWith("%S")
      const cmdBody = fileWide ? cmd.slice(2) : cmd.startsWith("s") || cmd.startsWith("S") ? cmd.slice(1) : cmd

      if (cmdBody.length < 2) {
        setStatusMessage({ text: "❌ Invalid :s syntax", type: "error" })
        return
      }

      const delimiter = cmdBody[0]!
      // Find the closing delimiter (skip escaped chars)
      let delimIdx = -1
      for (let i = 1; i < cmdBody.length; i++) {
        if (cmdBody[i] === "\\") {
          i++ // skip next char
          continue
        }
        if (cmdBody[i] === delimiter) {
          delimIdx = i
          break
        }
      }
      if (delimIdx === -1) {
        setStatusMessage({ text: "❌ Missing delimiter in :s", type: "error" })
        return
      }

      const rawPattern = cmdBody.slice(1, delimIdx)
      if (!rawPattern) {
        setStatusMessage({ text: "❌ Empty pattern in :s", type: "error" })
        return
      }

      // Find the replacement (between first and second delimiter)
      let replaceEnd = -1
      for (let i = delimIdx + 1; i < cmdBody.length; i++) {
        if (cmdBody[i] === "\\") {
          i++
          continue
        }
        if (cmdBody[i] === delimiter) {
          replaceEnd = i
          break
        }
      }

      let replacement = ""
      let flags = ""
      if (replaceEnd === -1) {
        // No closing delimiter - rest is the replacement
        replacement = cmdBody.slice(delimIdx + 1)
      } else {
        replacement = cmdBody.slice(delimIdx + 1, replaceEnd)
        flags = cmdBody.slice(replaceEnd + 1)
      }

      // Handle escape sequences in replacement
      replacement = replacement.replace(/\\\//g, "/").replace(/\\n/g, "\n").replace(/\\&/g, "$&")

      // Build regex flags
      const globalFlag = flags.includes("g")
      const caseInsensitive = flags.includes("i")
      const regexFlags = `${globalFlag ? "g" : ""}${caseInsensitive ? "i" : ""}`

      // Escape regex special chars in the pattern (use literal matching like vim's very magic mode)
      // Vim :s does use regex by default, but for simplicity we escape special chars
      // and do literal matching. Users can use the existing Ctrl+F for regex-level replace.
      const escapedPattern = rawPattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

      try {
        const regex = new RegExp(escapedPattern, regexFlags)
        const text = ta.plainText
        let matchCount = 0
        let newText: string

        if (fileWide || globalFlag) {
          newText = text.replace(regex, (match) => {
            matchCount++
            // Support $& in replacement (backreference to whole match)
            return replacement.replace(/\$&/g, match)
          })
        } else {
          // Without fileWide or g, replace first occurrence only
          newText = text.replace(regex, (match) => {
            matchCount++
            return replacement.replace(/\$&/g, match)
          })
        }

        if (matchCount === 0) {
          setStatusMessage({ text: `❌ Pattern not found: ${rawPattern}`, type: "error" })
          return
        }

        ta.replaceText(newText)
        handleContentChange()

        // Clear stale highlights from previous / search
        ta.clearSelection()
        ta.clearAllHighlights()

        // Update search state so n/N can navigate matches of the new text
        const matches = findAllMatches(replacement, newText)
        if (matches.length > 0) {
          const idx = Math.min(matches.length - 1, 0)
          vimSearchRef.current = { query: replacement, matches, currentIndex: idx }
        }

        setStatusMessage({
          text: `✅ Replaced ${matchCount} occurrence${matchCount > 1 ? "s" : ""}`,
          type: "success",
        })
      } catch {
        setStatusMessage({ text: "❌ Invalid pattern in :s", type: "error" })
      }
    },
    [textareaRef, findAllMatches, handleContentChange, setStatusMessage],
  )

  // Execute a vim command (:w, :q, :wq, :q!, :s)
  const executeVimCommand = useCallback(
    (cmd: string): void => {
      const trimmed = cmd.trim()

      // Check for :s substitute command
      if (trimmed.startsWith("s/") || trimmed.startsWith("S/") || trimmed.startsWith("%s/") || trimmed.startsWith("%S/")) {
        executeSubstitute(trimmed)
        return
      }

      if (trimmed === "w" || trimmed === "write") {
        if (currentFilePath) {
          saveFile(currentFilePath)
        } else {
          setDialogPath("")
          setDialogMode("save")
        }
      } else if (trimmed === "q") {
        if (isModified) {
          setStatusMessage({ text: "⚠️ No write since last change (add ! to force)", type: "error" })
        } else {
          process.exit(0)
        }
      } else if (trimmed === "wq") {
        if (currentFilePath) {
          saveFile(currentFilePath).then(() => process.exit(0)).catch(() => process.exit(1))
        } else {
          setStatusMessage({ text: "⚠️ No file name", type: "error" })
        }
      } else if (trimmed === "q!") {
        process.exit(0)
      } else if (trimmed === "wq!") {
        if (currentFilePath) {
          saveFile(currentFilePath).then(() => process.exit(0)).catch(() => process.exit(1))
        } else {
          process.exit(0)
        }
      } else if (trimmed === "help" || trimmed === "h" || trimmed === "?") {
        setShowHelp(true)
        setStatusMessage({ text: "🔍 Opening help...", type: "info" })
      } else {
        setStatusMessage({ text: `❌ Unknown command: ${trimmed}`, type: "error" })
      }
    },
    [currentFilePath, isModified, saveFile, setStatusMessage, setDialogMode, setDialogPath, executeSubstitute],
  )

  // Handle vim command/search bar key input
  const handleVimCmdKey = useCallback(
    (key: any, state: { mode: "search" | "command"; input: string }): void => {
      const ta = textareaRef.current

      if (key.name === "escape") {
        vimSearchRef.current.matches = []
        vimSearchRef.current.currentIndex = 0
        vimCmdStateRef.current = null
        setVimCmdState(null)
        if (ta) {
          ta.clearSelection()
          ta.clearAllHighlights()
        }
        return
      }

      if (key.name === "enter" || key.name === "return") {
        if (state.mode === "search") {
          const matches = findAllMatches(state.input, markdown)
          vimSearchRef.current = { query: state.input, matches, currentIndex: 0 }
          if (matches.length > 0 && ta) {
            ta.setSelection(matches[0]!.start, matches[0]!.end)
          }
          // Apply highlights for all matches
          if (ta) {
            applyVimSearchHighlights(ta, matches)
          }
          vimCmdStateRef.current = null
          setVimCmdState(null)
        } else {
          executeVimCommand(state.input)
          vimCmdStateRef.current = null
          setVimCmdState(null)
        }
        return
      }

      if (key.name === "backspace") {
        const newInput = state.input.slice(0, -1)
        const newState = { mode: state.mode, input: newInput }
        vimCmdStateRef.current = newState
        setVimCmdState(newState)
        // Live update highlights as user deletes characters
        if (state.mode === "search" && ta) {
          const matches = findAllMatches(newInput, ta.plainText)
          applyVimSearchHighlights(ta, matches)
        }
        return
      }

      if (key.name.length === 1 && !key.ctrl && !key.meta && !key.option) {
        const newInput = state.input + key.name
        const newState = { mode: state.mode, input: newInput }
        vimCmdStateRef.current = newState
        setVimCmdState(newState)
        // Live update highlights as user types
        if (state.mode === "search" && ta) {
          const matches = findAllMatches(newInput, ta.plainText)
          applyVimSearchHighlights(ta, matches)
        }
        return
      }

      if (key.name === "space") {
        const newInput = state.input + " "
        const newState = { mode: state.mode, input: newInput }
        vimCmdStateRef.current = newState
        setVimCmdState(newState)
        // Live update highlights as user types
        if (state.mode === "search" && ta) {
          const matches = findAllMatches(newInput, ta.plainText)
          applyVimSearchHighlights(ta, matches)
        }
        return
      }
    },
    [markdown, textareaRef, findAllMatches, executeVimCommand, applyVimSearchHighlights],
  )

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

    // Scan for fenced code blocks and find the one containing the cursor
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

    // Handle unclosed block at end of file
    if (inBlock && cursorLine0 >= contentStart && cursorLine0 < lines.length) {
      writeClipboard(lines.slice(contentStart).join("\n"))
      return
    }

    setStatusMessage({ text: "❌ No code block at cursor", type: "error" })
  }, [markdown, cursorLine])

  // Copy ALL fenced code block content
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
  }, [markdown])

  // Handle image rendering status updates from MarkdownPreview
  const handleImageStatus = useCallback((status: ImageStatusInfo) => {
    if (status) {
      setStatusMessage({ text: status.text, type: status.type })
    }
  }, [])

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

  // Extract all fenced code blocks with their language tags
  const extractCodeBlocksWithLang = useCallback(
    (text: string): { content: string; lang: string }[] => {
      const blocks: { content: string; lang: string }[] = []
      const lines = text.split("\n")
      let i = 0

      while (i < lines.length) {
        const line = lines[i]
        if (line?.trimStart().startsWith("```")) {
          // Extract language from the opening fence (text after ```)
          const infoStr = line.trimStart().slice(3).trim()
          const lang = infoStr.split(/[\s)]/)[0] ?? ""
          const contentStart = i + 1
          let j = i + 1
          while (j < lines.length) {
            const fenceLine = lines[j]
            if (fenceLine?.trimStart().startsWith("```")) break
            j++
          }
          if (j < lines.length) {
            blocks.push({
              content: lines.slice(contentStart, j).join("\n"),
              lang,
            })
          }
          i = j + 1
        } else {
          i++
        }
      }
      return blocks
    },
    [],
  )

  // Export all code blocks to separate files in a target directory
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

    // Build a filename for each block with a counter prefix
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
  }, [dialogPath, markdown, extractCodeBlocksWithLang])

  // Export all code blocks as a single concatenated file with language headers
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

    // Build concatenated content with headers
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
  }, [dialogPath, markdown, extractCodeBlocksWithLang])

  // Perform search, select current match, update state
  const runSearch = useCallback(
    (query: string, markdownText: string) => {
      if (!query) {
        return { matches: [] as { start: number; end: number }[], currentIndex: 0 }
      }
      const matches = findAllMatches(query, markdownText)
      const currentIndex = matches.length > 0 ? 0 : 0
      if (matches.length > 0) {
        const firstMatch = matches[0]
        if (firstMatch) {
          textareaRef.current?.setSelection(firstMatch.start, firstMatch.end)
        }
      }
      return { matches, currentIndex }
    },
    [findAllMatches, textareaRef],
  )

  // Global keyboard shortcuts
  useKeyboard((key) => {
    // ── 1. Find/Replace bar (always highest priority) ──
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
                focus:
                  prev.mode === "replace"
                    ? prev.focus === "query"
                      ? "replacement"
                      : "query"
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
            if (match) {
              textareaRef.current?.setSelection(match.start, match.end)
            }
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
              prev
                ? { ...prev, matches, currentIndex: matches.length > 0 ? 0 : 0 }
                : prev,
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
                    ...prev,
                    matches,
                    currentIndex:
                      matches.length > 0
                        ? Math.min(prev.currentIndex, matches.length - 1)
                        : 0,
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
          const target =
            prev.focus === "query" ? prev.query : prev.replacement
          if (target.length === 0) return prev
          const newTarget = target.slice(0, -1)
          const updated =
            prev.focus === "query"
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
          const updated =
            prev.focus === "query"
              ? { ...prev, query: prev.query + ch }
              : { ...prev, replacement: prev.replacement + ch }
          if (prev.focus === "query") {
            const newQuery = prev.query + ch
            const { matches, currentIndex } = runSearch(newQuery, markdown)
            return { ...updated, matches, currentIndex }
          }
          return updated
        })
        return
      }

      if (key.name === "space") {
        setFindState((prev) => {
          if (!prev) return prev
          const updated =
            prev.focus === "query"
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
        enableTextareaInput()
        setVimMode("insert")
        vimCmdStateRef.current = null
        setVimCmdState(null)
        setShowHelp(false)
      }
      setStatusMessage({
        text: wasEnabled ? "🔴 Vim: OFF" : "🟢 Vim: ON",
        type: "info",
      })
      return
    }

    // ── 4. Global Ctrl/Option shortcuts (work regardless of vim) ──
    if (key.ctrl && key.name === "s") {
      if (currentFilePath) {
        saveFile(currentFilePath)
      } else {
        setDialogPath("")
        setDialogMode("save")
      }
      return
    }
    if (key.ctrl && key.name === "o") {
      setDialogPath("")
      setDialogMode("open")
      return
    }
    if (key.ctrl && key.name === "k") {
      if (key.shift) {
        copyAllCodeBlocks()
      } else {
        copyActiveCodeBlock()
      }
      return
    }
    if (key.ctrl && key.name === "e") {
      if (key.shift) {
        setDialogPath("")
        setDialogMode("export-single")
      } else {
        setDialogPath("")
        setDialogMode("export")
      }
      return
    }
    if (key.ctrl && key.name === "f") {
      setFindState({
        query: "",
        replacement: "",
        matches: [],
        currentIndex: 0,
        mode: "find",
        focus: "query",
      })
      return
    }
    if (key.option && key.name === "w") {
      setCodeWrap((prev) => !prev)
      key.preventDefault()
      setStatusMessage({
        text: codeWrap ? "📜 Scroll mode" : "📐 Wrap mode",
        type: "info",
      })
      return
    }

    // ── 5. Help overlay closes with Esc ──
    if (showHelp) {
      if (key.name === "escape") {
        setShowHelp(false)
        textareaRef.current?.focus()
        return
      }
      // Swallow all keys when help is open
      return
    }

    // ── 6. Escape (context dependent) ──
    if (key.name === "escape") {
      // In insert mode with vim on: go to normal mode
      if (vimEnabled && vimMode === "insert") {
        disableTextareaInput()
        setVimMode("normal")
        return
      }
      // In visual mode: cancel selection
      if (vimEnabled && vimMode === "visual") {
        disableTextareaInput()
        textareaRef.current?.clearSelection()
        setVimMode("normal")
        return
      }
      // In normal mode with vim on: no-op (like real Vim)
      if (vimEnabled && vimMode === "normal") {
        return
      }
      // Otherwise (vim disabled): exit
      process.exit(0)
      return
    }

    // ── 6. Vim command/search bar (only when enabled) ──
    // Use vimCmdStateRef.current instead of vimCmdState to avoid race conditions
    // where characters arrive before React re-renders after pressing : or /
    const currentCmdState = vimCmdStateRef.current
    if (vimEnabled && currentCmdState) {
      handleVimCmdKey(key, currentCmdState)
      return
    }

    // ── 7. Insert mode — let all keys through to textarea ──
    if (vimMode === "insert") {
      enableTextareaInput()
      return
    }

    // ── 8. Visual mode (only when enabled) ──
    if (vimEnabled && vimMode === "visual") {
      disableTextareaInput()
      if (handleVimVisualKey(key)) return
    }

    // ── 9. Normal mode (only when enabled) ──
    if (vimEnabled && vimMode === "normal") {
      disableTextareaInput()
      handleVimNormalKey(key)
      return // Swallow all keys
    }

    // When vim is disabled or in insert mode, keys fall through to textarea
  })

  const handleCancelDialog = useCallback(() => {
    setDialogMode(null)
    setDialogPath("")
    textareaRef.current?.focus()
  }, [setDialogMode, setDialogPath, textareaRef])

  // Compute search matches for VimCmdBar (avoid IIFE in JSX)
  const vimMatches = vimCmdState?.mode === "search"
    ? findAllMatches(vimCmdState.input, markdown)
    : undefined

  return (
    <box flexDirection="column" width={width} height={height}>
      {showHelp ? (
        <HelpOverlay width={width} height={height} />
      ) : (
        <>
          {/* Main content area */}
          <box flexDirection="row" width={width} height={mainHeight}>
            {/* Left pane - Editor */}
            <box
              flexDirection="column"
              width={halfWidth}
              height={mainHeight}
              borderStyle="rounded"
              borderColor="#30363d"
              title=" ✏️ Editor "
              titleAlignment="center"
              backgroundColor="#161b22"
            >
              <textarea
                ref={textareaRef}
                initialValue={DEFAULT_MARKDOWN}
                onContentChange={handleContentChange}
                onCursorChange={handleCursorChange}
                focused={dialogMode === null && findState === null && vimCmdState === null && (!vimEnabled || vimMode === "insert")}
                cursorStyle={{
                  style: !vimEnabled || vimMode === "insert" ? "line" as const : "block" as const,
                  blinking: !vimEnabled || vimMode === "insert",
                }}
                showCursor={true}
                style={{
                  flexGrow: 1,
                  backgroundColor: "#0d1117",
                  textColor: "#c9d1d9",
                  cursorColor: "#58a6ff",
                }}
                placeholder="Type your markdown here..."
              />
            </box>

            {/* Divider */}
            <box width={1} height={mainHeight} backgroundColor="#21262d">
              <text fg="#30363d">│</text>
            </box>

            {/* Right pane - Preview */}
            <box
              flexDirection="column"
              width={halfWidth}
              height={mainHeight}
              borderStyle="rounded"
              borderColor="#30363d"
              title=" 👁️ Preview "
              titleAlignment="center"
              backgroundColor="#0d1117"
            >
              <box paddingTop={1} paddingLeft={1} flexDirection="row">
                <text fg="#8b949e">Markdown Preview</text>
                <text>   </text>
                <box onMouseDown={copyAllCodeBlocks}>
                  <text fg="#58a6ff" attributes={1}>
                    [Copy All Code]
                  </text>
                </box>
                <text> </text>
                <box onMouseDown={() => { setDialogPath(""); setDialogMode("export") }}>
                  <text fg="#d2a8ff" attributes={1}>
                    [Export Code]
                  </text>
                </box>
                <text> </text>
                <box onMouseDown={() => { setDialogPath(""); setDialogMode("export-single") }}>
                  <text fg="#7ee787" attributes={1}>
                    [Export as One]
                  </text>
                </box>
              </box>
              <MarkdownPreview
                markdown={markdown}
                activeEditorLine={cursorLine - 1}
                codeWrap={codeWrap}
                baseDir={baseDir}
                onImageStatus={handleImageStatus}
                onCopyAllCodeBlocks={copyAllCodeBlocks}
                onCopyCodeBlock={(content) => {
                  if (copyToClipboard(content)) {
                    setStatusMessage({ text: "📋 Copied!", type: "success" })
                  } else {
                    setStatusMessage({ text: "❌ Copy failed", type: "error" })
                  }
                }}
              />
            </box>
          </box>

          {/* Find bar, Dialog bar, or Status bar */}
          {dialogMode !== null ? (
            <FileDialog
              width={width}
              mode={dialogMode}
              path={dialogPath}
              onPathChange={setDialogPath}
              onSubmit={dialogMode === "export" ? handleExportSubmit : dialogMode === "export-single" ? handleExportSingleSubmit : handleDialogSubmit}
              onCancel={handleCancelDialog}
            />
          ) : findState !== null ? (
            <FindReplaceBar
              width={width}
              query={findState.query}
              replacement={findState.replacement}
              matchIndex={findState.currentIndex}
              matchCount={findState.matches.length}
              mode={findState.mode}
              focus={findState.focus}
            />
          ) : vimCmdState !== null ? (
            <VimCmdBar
              width={width}
              mode={vimCmdState.mode}
              input={vimCmdState.input}
              matchIndex={vimMatches && vimMatches.length > 0 ? 1 : 0}
              matchCount={vimMatches?.length ?? 0}
            />
          ) : (
            <StatusBar
              width={width}
              currentFilePath={currentFilePath}
              statusMessage={statusMessage}
              isModified={isModified}
              cursorLine={cursorLine}
              cursorCol={cursorCol}
              wordCount={wordCount}
              vimMode={vimMode}
              vimEnabled={vimEnabled}
            />
          )}
        </>
      )}
    </box>
  )
}
