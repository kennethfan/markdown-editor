import { useCallback } from "react"
import { SyntaxStyle, type TextareaRenderable } from "@opentui/core"
import type { StatusMessage, DialogMode } from "./useFileOperations"
import type { UseVimStateReturn, VimPendingOp, VimCmdState } from "./useVimState"
import {
  findBracketMatch,
  findWordBoundaries,
  findNumberAtCursor,
  findAllMatches,
  resolveTextObjectRange,
  findPrevParagraphStart,
  findNextParagraphStart,
} from "../vim-helpers"

export interface UseVimKeyHandlersParams {
  vimState: UseVimStateReturn
  textareaRef: React.RefObject<TextareaRenderable | null>
  handleContentChange: () => void
  setStatusMessage: React.Dispatch<React.SetStateAction<StatusMessage | null>>
  setDialogMode: React.Dispatch<React.SetStateAction<DialogMode>>
  setDialogPath: React.Dispatch<React.SetStateAction<string>>
  currentFilePath: string | null
  isModified: boolean
  saveFile: (filePath: string) => Promise<void>
  markdown: string
  setShowLineNumbers: React.Dispatch<React.SetStateAction<boolean>>
  setRelativeLineNumbers: React.Dispatch<React.SetStateAction<boolean>>
}

export interface UseVimKeyHandlersReturn {
  handleVimNormalKey: (key: any) => boolean
  handleVimVisualKey: (key: any) => boolean
  handleVimCmdKey: (key: any, state: VimCmdState) => void
  executeVimCommand: (cmd: string) => void
  applyVimSearchHighlights: (ta: TextareaRenderable, matches: { start: number; end: number }[]) => void
  runSearch: (query: string, markdownText: string) => { matches: { start: number; end: number }[]; currentIndex: number }
}

export function useVimKeyHandlers(params: UseVimKeyHandlersParams): UseVimKeyHandlersReturn {
  const {
    vimState,
    textareaRef,
    handleContentChange,
    setStatusMessage,
    setDialogMode,
    setDialogPath,
    currentFilePath,
    isModified,
    saveFile,
    markdown,
    setShowLineNumbers,
    setRelativeLineNumbers,
  } = params

  const {
    setVimMode, setVimCmdState, vimCmdStateRef, setShowHelp,
    vimYankRef, vimCountRef, vimPendingOpRef,
    vimGCountRef, vimRepeatRef,
    pageSizeRef, vimTextObjectRef, vimReplacePendingRef,
    mainHeightRef, namedRegistersRef,
    vimRegisterPendingRef, vimActiveRegisterRef,
    vimSearchRef, vimSearchHlStyleIdRef,
    resetVimRefs,
  } = vimState

  // ─── applyVimMotion ──────────────────────────────────────────

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

  // ─── executePendingOp ────────────────────────────────────────

  const executePendingOp = useCallback(
    (op: "d" | "y" | "c", count: number, motionKey: string): boolean => {
      const ta = textareaRef.current
      if (!ta) return false

      if (!applyVimMotion(motionKey, count, true)) return false

      const selected = ta.getSelectedText()
      if (!selected) return false

      vimYankRef.current = selected
      if (vimActiveRegisterRef.current) {
        namedRegistersRef.current[vimActiveRegisterRef.current] = selected
        vimActiveRegisterRef.current = null
      }

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
    [textareaRef, applyVimMotion, resetVimRefs, setVimMode],
  )

  // ─── indentLines / deindentLines ─────────────────────────────

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

  // ─── applyOperatorToRange ────────────────────────────────────

  const applyOperatorToRange = useCallback(
    (op: "d" | "y" | "c", range: { start: number; end: number }): boolean => {
      const ta = textareaRef.current
      if (!ta) return false

      ta.setSelection(range.start, range.end)
      const selected = ta.getSelectedText()
      if (!selected) return false

      vimYankRef.current = selected
      if (vimActiveRegisterRef.current) {
        namedRegistersRef.current[vimActiveRegisterRef.current] = selected
        vimActiveRegisterRef.current = null
      }

      if (op === "d" || op === "c") {
        ta.deleteSelection()
        handleContentChange()
        if (op === "c") {
          ta.focus()
          setVimMode("insert")
        }
        vimRepeatRef.current = () => {
          ta.setCursor(ta.logicalCursor.row, ta.logicalCursor.col)
          ta.setSelection(range.start, range.end)
          ta.deleteSelection()
          if (op === "c") {
            ta.focus()
            setVimMode("insert")
          }
        }
      } else {
        ta.clearSelection()
        vimRepeatRef.current = null
      }

      return true
    },
    [textareaRef, handleContentChange, setVimMode],
  )

  // ─── Vim search highlight helpers ────────────────────────────

  const ensureSearchHighlightStyle = useCallback((ta: TextareaRenderable): number | null => {
    if (vimSearchHlStyleIdRef.current !== null) {
      return vimSearchHlStyleIdRef.current
    }

    let syntaxStyle = ta.syntaxStyle
    if (!syntaxStyle) {
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

  // ─── Execute substitute ──────────────────────────────────────

  const executeSubstitute = useCallback(
    (cmd: string): void => {
      const ta = textareaRef.current
      if (!ta) return

      const fileWide = cmd.startsWith("%s") || cmd.startsWith("%S")
      const cmdBody = fileWide ? cmd.slice(2) : cmd.startsWith("s") || cmd.startsWith("S") ? cmd.slice(1) : cmd

      if (cmdBody.length < 2) {
        setStatusMessage({ text: "❌ Invalid :s syntax", type: "error" })
        return
      }

      const delimiter = cmdBody[0]!
      let delimIdx = -1
      for (let i = 1; i < cmdBody.length; i++) {
        if (cmdBody[i] === "\\") { i++; continue }
        if (cmdBody[i] === delimiter) { delimIdx = i; break }
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

      let replaceEnd = -1
      for (let i = delimIdx + 1; i < cmdBody.length; i++) {
        if (cmdBody[i] === "\\") { i++; continue }
        if (cmdBody[i] === delimiter) { replaceEnd = i; break }
      }

      let replacement = ""
      let flags = ""
      if (replaceEnd === -1) {
        replacement = cmdBody.slice(delimIdx + 1)
      } else {
        replacement = cmdBody.slice(delimIdx + 1, replaceEnd)
        flags = cmdBody.slice(replaceEnd + 1)
      }

      replacement = replacement.replace(/\\\//g, "/").replace(/\\n/g, "\n").replace(/\\&/g, "$&")

      const globalFlag = flags.includes("g")
      const caseInsensitive = flags.includes("i")
      const regexFlags = `${globalFlag ? "g" : ""}${caseInsensitive ? "i" : ""}`
      const escapedPattern = rawPattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

      try {
        const regex = new RegExp(escapedPattern, regexFlags)
        const text = ta.plainText
        let matchCount = 0
        let newText: string

        if (fileWide || globalFlag) {
          newText = text.replace(regex, (match) => {
            matchCount++
            return replacement.replace(/\$&/g, match)
          })
        } else {
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

        ta.clearSelection()
        ta.clearAllHighlights()

        const matches = findAllMatches(replacement, newText)
        if (matches.length > 0) {
          vimSearchRef.current = { query: replacement, matches, currentIndex: 0 }
        }

        setStatusMessage({
          text: `✅ Replaced ${matchCount} occurrence${matchCount > 1 ? "s" : ""}`,
          type: "success",
        })
      } catch {
        setStatusMessage({ text: "❌ Invalid pattern in :s", type: "error" })
      }
    },
    [textareaRef, handleContentChange, setStatusMessage, vimSearchRef],
  )

  // ─── executeVimCommand ───────────────────────────────────────

  const executeVimCommand = useCallback(
    (cmd: string): void => {
      const trimmed = cmd.trim()

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
      } else if (trimmed === "set number" || trimmed === "set nu") {
        setShowLineNumbers(true)
        setStatusMessage({ text: "📏 Line numbers: ON", type: "info" })
      } else if (trimmed === "set nonumber" || trimmed === "set nonu") {
        setShowLineNumbers(false)
        setStatusMessage({ text: "📏 Line numbers: OFF", type: "info" })
      } else if (trimmed === "set invnumber" || trimmed === "set number!") {
        setShowLineNumbers((prev) => {
          setStatusMessage({ text: prev ? "📏 Line numbers: OFF" : "📏 Line numbers: ON", type: "info" })
          return !prev
        })
      } else if (trimmed === "set relativenumber" || trimmed === "set rnu") {
        setRelativeLineNumbers(true)
        setShowLineNumbers(true)
        setStatusMessage({ text: "📏 Relative line numbers: ON", type: "info" })
      } else if (trimmed === "set norelativenumber" || trimmed === "set nornu" || trimmed === "set noru") {
        setRelativeLineNumbers(false)
        setStatusMessage({ text: "📏 Relative line numbers: OFF", type: "info" })
      } else if (trimmed === "set invrelativenumber" || trimmed === "set invrnu" || trimmed === "set relativenumber!") {
        setRelativeLineNumbers((prev) => {
          const next = !prev
          setShowLineNumbers(next)
          setStatusMessage({ text: next ? "📏 Relative line numbers: ON" : "📏 Line numbers: OFF", type: "info" })
          return next
        })
      } else {
        setStatusMessage({ text: `❌ Unknown command: ${trimmed}`, type: "error" })
      }
    },
    [currentFilePath, isModified, saveFile, setStatusMessage, setDialogMode, setDialogPath, executeSubstitute, setShowHelp, setShowLineNumbers, setRelativeLineNumbers],
  )

  // ─── handleVimNormalKey ──────────────────────────────────────

  const handleVimNormalKey = useCallback(
    (key: any): boolean => {
      const ta = textareaRef.current
      if (!ta) return true

      const countStr = vimCountRef.current
      const count = countStr ? Math.max(1, parseInt(countStr) || 1) : 1

      // ── Ctrl shortcuts ──
      if (key.ctrl) {
        if (key.name === "r") {
          ta.redo(); handleContentChange(); return true
        }
        if (key.name === "f") {
          for (let i = 0; i < pageSizeRef.current; i++) ta.moveCursorDown()
          return true
        }
        if (key.name === "b") {
          for (let i = 0; i < pageSizeRef.current; i++) ta.moveCursorUp()
          return true
        }
        if (key.name === "d") {
          const half = Math.max(1, Math.floor(pageSizeRef.current / 2))
          for (let i = 0; i < half; i++) ta.moveCursorDown()
          return true
        }
        if (key.name === "u") {
          const half = Math.max(1, Math.floor(pageSizeRef.current / 2))
          for (let i = 0; i < half; i++) ta.moveCursorUp()
          return true
        }
        if (key.name === "a") {
          const text = ta.plainText; const cursor = ta.cursorOffset
          const numInfo = findNumberAtCursor(text, cursor)
          if (numInfo) {
            const newValue = numInfo.value + count
            ta.replaceText(text.slice(0, numInfo.start) + String(newValue) + text.slice(numInfo.end))
            ta.cursorOffset = numInfo.start + String(newValue).length
            handleContentChange()
            vimRepeatRef.current = () => {
              const ct = ta.plainText; const ni = findNumberAtCursor(ct, ta.cursorOffset)
              if (ni) {
                const nv = ni.value + count
                ta.replaceText(ct.slice(0, ni.start) + String(nv) + ct.slice(ni.end))
                ta.cursorOffset = ni.start + String(nv).length
                handleContentChange()
              }
            }
          }
          return true
        }
        if (key.name === "x") {
          const text = ta.plainText; const cursor = ta.cursorOffset
          const numInfo = findNumberAtCursor(text, cursor)
          if (numInfo) {
            const newValue = numInfo.value - count
            ta.replaceText(text.slice(0, numInfo.start) + String(newValue) + text.slice(numInfo.end))
            ta.cursorOffset = numInfo.start + String(newValue).length
            handleContentChange()
            vimRepeatRef.current = () => {
              const ct = ta.plainText; const ni = findNumberAtCursor(ct, ta.cursorOffset)
              if (ni) {
                const nv = ni.value - count
                ta.replaceText(ct.slice(0, ni.start) + String(nv) + ct.slice(ni.end))
                ta.cursorOffset = ni.start + String(nv).length
                handleContentChange()
              }
            }
          }
          return true
        }
        return true // swallow other ctrl
      }
      if (key.meta || key.option) return true

      // ── Quit: q in normal mode ──
      if (key.name === "q" && !key.shift) {
        if (isModified) {
          setStatusMessage({ text: "⚠️ No write since last change (add ! to force)", type: "error" })
        } else {
          process.exit(0)
        }
        return true
      }

      const pendingOp = vimPendingOpRef.current

      // ── Replace char pending ──
      if (vimReplacePendingRef.current) {
        vimReplacePendingRef.current = false
        if (key.name.length === 1 && !key.shift && !key.ctrl && !key.meta && !key.option) {
          const replaceChar = key.name
          for (let i = 0; i < count; i++) ta.deleteChar()
          for (let i = 0; i < count; i++) ta.insertText(replaceChar)
          handleContentChange()
          vimRepeatRef.current = () => {
            for (let i = 0; i < count; i++) ta.deleteChar()
            for (let i = 0; i < count; i++) ta.insertText(replaceChar)
            handleContentChange()
          }
        }
        resetVimRefs()
        return true
      }

      // ── Register prefix pending ──
      if (vimRegisterPendingRef.current !== null) {
        if (vimRegisterPendingRef.current === "") {
          if (/^[a-z]$/.test(key.name) || key.name === "+" || key.name === "*") {
            vimRegisterPendingRef.current = key.name
            return true
          }
          vimRegisterPendingRef.current = null
        } else {
          const reg = vimRegisterPendingRef.current
          vimRegisterPendingRef.current = null
          if (key.name === "d" || key.name === "y" || key.name === "c") {
            vimActiveRegisterRef.current = reg
            vimPendingOpRef.current = key.name as VimPendingOp
            return true
          }
          if (key.name === "p" && !key.shift) {
            const txt = namedRegistersRef.current[reg]
            if (txt) { ta.insertText(txt); handleContentChange() }
            return true
          }
          if (key.name === "p" && key.shift) {
            const txt = namedRegistersRef.current[reg]
            if (txt) { ta.moveCursorLeft(); ta.insertText(txt); handleContentChange() }
            return true
          }
          return true
        }
      }

      if (key.name === "tab") return true
      if (key.name === "enter" || key.name === "return") { ta.newLine(); vimCountRef.current = ""; return true }
      if (key.name === "backspace") { ta.moveCursorLeft(); vimCountRef.current = ""; return true }

      // ── Pending operator ──
      if (pendingOp && pendingOp !== "g") {
        if (key.name === pendingOp) {
          const lineIdx = ta.logicalCursor.row
          vimCountRef.current = ""

          if (pendingOp === "d") {
            const yankedLines: string[] = []
            for (let i = 0; i < Math.min(count, ta.lineCount - lineIdx); i++) {
              yankedLines.push(ta.plainText.split("\n")[lineIdx + i] ?? "")
            }
            const yankedText = yankedLines.join("\n") + "\n"
            vimYankRef.current = yankedText
            if (vimActiveRegisterRef.current) {
              namedRegistersRef.current[vimActiveRegisterRef.current] = yankedText
              vimActiveRegisterRef.current = null
            }
            for (let i = 0; i < Math.min(count, ta.lineCount - lineIdx); i++) { ta.deleteLine() }
            handleContentChange()
            vimRepeatRef.current = () => {
              const curLine = ta.logicalCursor.row; vimYankRef.current = yankedLines.join("\n") + "\n"
              for (let i = 0; i < Math.min(count, ta.lineCount - curLine); i++) { ta.deleteLine() }
              handleContentChange()
            }
          } else if (pendingOp === "y") {
            const yankedLines: string[] = []
            for (let i = 0; i < Math.min(count, ta.lineCount - lineIdx); i++) {
              yankedLines.push(ta.plainText.split("\n")[lineIdx + i] ?? "")
            }
            const yankedText = yankedLines.join("\n") + "\n"
            vimYankRef.current = yankedText
            if (vimActiveRegisterRef.current) {
              namedRegistersRef.current[vimActiveRegisterRef.current] = yankedText
              vimActiveRegisterRef.current = null
            }
          } else if (pendingOp === "c") {
            const yankedLines: string[] = []
            for (let i = 0; i < Math.min(count, ta.lineCount - lineIdx); i++) {
              yankedLines.push(ta.plainText.split("\n")[lineIdx + i] ?? "")
            }
            const yankedText = yankedLines.join("\n") + "\n"
            vimYankRef.current = yankedText
            if (vimActiveRegisterRef.current) {
              namedRegistersRef.current[vimActiveRegisterRef.current] = yankedText
              vimActiveRegisterRef.current = null
            }
            for (let i = 0; i < Math.min(count, ta.lineCount - lineIdx); i++) { ta.deleteLine() }
            handleContentChange()
            vimRepeatRef.current = () => {
              const curLine = ta.logicalCursor.row
              for (let i = 0; i < Math.min(count, ta.lineCount - curLine); i++) { ta.deleteLine() }
              handleContentChange(); ta.focus(); setVimMode("insert")
            }
            ta.focus(); setVimMode("insert")
          } else if (pendingOp === ">") {
            indentLines(lineIdx, Math.min(count, ta.lineCount - lineIdx))
            vimRepeatRef.current = () => { indentLines(ta.logicalCursor.row, Math.min(count, ta.lineCount - ta.logicalCursor.row)) }
          } else if (pendingOp === "<") {
            deindentLines(lineIdx, Math.min(count, ta.lineCount - lineIdx))
            vimRepeatRef.current = () => { deindentLines(ta.logicalCursor.row, Math.min(count, ta.lineCount - ta.logicalCursor.row)) }
          }

          resetVimRefs()
          return true
        }

        if (pendingOp === "c" || pendingOp === "d" || pendingOp === "y") {
          if (!vimTextObjectRef.current && executePendingOp(pendingOp as "d" | "y" | "c", count, key.name)) {
            handleContentChange()
            if (pendingOp === "c") {
              vimRepeatRef.current = () => {
                if (executePendingOp("d", count, key.name)) { handleContentChange(); setVimMode("insert") }
              }
            } else if (pendingOp === "d") {
              vimRepeatRef.current = () => {
                if (executePendingOp("d", count, key.name)) { handleContentChange() }
              }
            }
            resetVimRefs()
            return true
          }
        }

        if (!vimTextObjectRef.current) { resetVimRefs(); return true }
      }

      // ── Text object resolution ──
      if (vimTextObjectRef.current && (pendingOp === "d" || pendingOp === "y" || pendingOp === "c")) {
        const prefix = vimTextObjectRef.current
        vimTextObjectRef.current = null
        const op = pendingOp as "d" | "y" | "c"

        const range = resolveTextObjectRange(ta.plainText, ta.cursorOffset, prefix, key.name)
        if (range) { applyOperatorToRange(op, range); handleContentChange() }
        resetVimRefs()
        return true
      }
      if (vimTextObjectRef.current) { vimTextObjectRef.current = null; resetVimRefs() }

      // ── gg ──
      if (key.name === "g" && pendingOp === "g") {
        const ggCount = vimGCountRef.current || countStr
        vimGCountRef.current = ""
        const targetLine = ggCount ? Math.max(0, parseInt(ggCount) - 1) : 0
        if (targetLine === 0) { ta.gotoBufferHome() }
        else if (targetLine < ta.lineCount) { ta.setCursor(targetLine, 0) }
        else { ta.gotoBufferEnd() }
        resetVimRefs()
        return true
      }
      if (pendingOp === "g") { resetVimRefs() }

      // ── Number prefix ──
      if (/^[0-9]$/.test(key.name) && !pendingOp) { vimCountRef.current += key.name; return true }

      // ── Mode switching ──
      if (key.name === "i" && !key.shift) {
        if (pendingOp === "d" || pendingOp === "y" || pendingOp === "c") { vimTextObjectRef.current = "i"; return true }
        ta.focus(); setVimMode("insert"); return true
      }
      if (key.name === "a" && !key.shift) {
        if (pendingOp === "d" || pendingOp === "y" || pendingOp === "c") { vimTextObjectRef.current = "a"; return true }
        ta.moveCursorRight(); ta.focus(); setVimMode("insert"); return true
      }
      if (key.name === "i" && key.shift) { ta.gotoLineStart(); ta.focus(); setVimMode("insert"); return true }
      if (key.name === "a" && key.shift) { ta.gotoLineEnd(); ta.focus(); setVimMode("insert"); return true }
      if (key.name === "o" && !key.shift) { ta.gotoLineEnd(); ta.newLine(); handleContentChange(); ta.focus(); setVimMode("insert"); return true }
      if (key.name === "o" && key.shift) { ta.gotoLineStart(); ta.newLine(); ta.moveCursorUp(); handleContentChange(); ta.focus(); setVimMode("insert"); return true }
      if (key.name === "v") { setVimMode("visual"); return true }

      // ── Bracket matching ──
      if (key.name === "%") {
        const match = findBracketMatch(ta.plainText, ta.cursorOffset)
        if (match !== null) { ta.cursorOffset = match }
        vimCountRef.current = ""
        return true
      }

      // ── Register prefix ──
      if (key.name === '"') { vimRegisterPendingRef.current = ""; vimCountRef.current = ""; return true }

      // ── Replace char ──
      if (key.name === "r" && !key.shift) { vimReplacePendingRef.current = true; return true }

      // ── Search/command ──
      if (key.name === "/") {
        const newState: VimCmdState = { mode: "search", input: "" }
        setVimCmdState(newState)
        vimCmdStateRef.current = newState
        return true
      }
      if (key.name === ":") {
        const newState: VimCmdState = { mode: "command", input: "" }
        setVimCmdState(newState)
        vimCmdStateRef.current = newState
        return true
      }

      // n/N navigation
      if (key.name === "n" && !key.shift) {
        const search = vimSearchRef.current
        if (search.query && search.matches.length > 0) {
          const newIdx = (search.currentIndex + 1) % search.matches.length
          search.currentIndex = newIdx
          const match = search.matches[newIdx]
          if (match && ta) { ta.setSelection(match.start, match.end) }
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
          if (match && ta) { ta.setSelection(match.start, match.end) }
        }
        vimCountRef.current = ""
        return true
      }

      // ── Word search (* / #) ──
      if (key.name === "*") {
        const text = ta.plainText; const cursor = ta.cursorOffset
        const bounds = findWordBoundaries(text, cursor)
        if (bounds) {
          const word = text.slice(bounds.start, bounds.end)
          if (word) {
            const matches = findAllMatches(word, text)
            vimSearchRef.current = { query: word, matches, currentIndex: 0 }
            if (matches.length > 0) {
              let firstIdx = 0
              for (let i = 0; i < matches.length; i++) {
                if (matches[i]!.start >= cursor) { firstIdx = i; break }
              }
              vimSearchRef.current.currentIndex = firstIdx
              ta.setSelection(matches[firstIdx]!.start, matches[firstIdx]!.end)
              applyVimSearchHighlights(ta, matches)
            }
          }
        }
        vimCountRef.current = ""
        return true
      }
      if (key.name === "#") {
        const text = ta.plainText; const cursor = ta.cursorOffset
        const bounds = findWordBoundaries(text, cursor)
        if (bounds) {
          const word = text.slice(bounds.start, bounds.end)
          if (word) {
            const matches = findAllMatches(word, text)
            vimSearchRef.current = { query: word, matches, currentIndex: 0 }
            if (matches.length > 0) {
              let lastIdx = matches.length - 1
              for (let i = matches.length - 1; i >= 0; i--) {
                if (matches[i]!.start <= cursor) { lastIdx = i; break }
              }
              vimSearchRef.current.currentIndex = lastIdx
              ta.setSelection(matches[lastIdx]!.start, matches[lastIdx]!.end)
              applyVimSearchHighlights(ta, matches)
            }
          }
        }
        vimCountRef.current = ""
        return true
      }

      // ── Movement ──
      if (key.name === "h" && !key.shift) { vimCountRef.current = ""; for (let i = 0; i < count; i++) ta.moveCursorLeft(); return true }
      if (key.name === "h" && key.shift) {
        vimCountRef.current = ""
        const targetLine = Math.min(count > 1 ? ta.scrollY + count - 1 : ta.scrollY, ta.lineCount - 1)
        ta.setCursor(targetLine, 0)
        return true
      }
      if (key.name === "j" && !key.shift) { vimCountRef.current = ""; for (let i = 0; i < count; i++) ta.moveCursorDown(); return true }
      if (key.name === "k") { vimCountRef.current = ""; for (let i = 0; i < count; i++) ta.moveCursorUp(); return true }
      if (key.name === "l" && !key.shift) { vimCountRef.current = ""; for (let i = 0; i < count; i++) ta.moveCursorRight(); return true }
      if (key.name === "l" && key.shift) {
        vimCountRef.current = ""
        const visibleLines = mainHeightRef.current - 3
        const targetLine = count > 1
          ? Math.min(ta.scrollY + count - 1, ta.lineCount - 1)
          : Math.min(ta.scrollY + visibleLines - 1, ta.lineCount - 1)
        ta.setCursor(targetLine, 0)
        return true
      }
      if (key.name === "m" && key.shift) {
        vimCountRef.current = ""
        const visibleLines = mainHeightRef.current - 3
        const targetLine = ta.scrollY + Math.floor(visibleLines / 2)
        ta.setCursor(Math.min(targetLine, ta.lineCount - 1), 0)
        return true
      }
      if (key.name === "w") { vimCountRef.current = ""; for (let i = 0; i < count; i++) ta.moveWordForward(); return true }
      if (key.name === "b") { vimCountRef.current = ""; for (let i = 0; i < count; i++) ta.moveWordBackward(); return true }
      if (key.name === "e") { vimCountRef.current = ""; for (let i = 0; i < count; i++) ta.moveWordForward(); return true }
      if (key.name === "0") { vimCountRef.current = ""; ta.gotoLineStart(); return true }
      if (key.name === "$") { vimCountRef.current = ""; ta.gotoLineEnd(); return true }
      if (key.name === "^") { vimCountRef.current = ""; ta.gotoLineTextEnd(); return true }
      if (key.name === "{") {
        vimCountRef.current = ""
        const lines = ta.plainText.split("\n")
        ta.setCursor(findPrevParagraphStart(lines, ta.logicalCursor.row), 0)
        return true
      }
      if (key.name === "}") {
        vimCountRef.current = ""
        const lines = ta.plainText.split("\n")
        ta.setCursor(findNextParagraphStart(lines, ta.logicalCursor.row), 0)
        return true
      }
      if (key.name === "g" && !key.shift) { vimGCountRef.current = vimCountRef.current; vimCountRef.current = ""; vimPendingOpRef.current = "g"; return true }
      if (key.name === "g" && key.shift) { vimCountRef.current = ""; ta.gotoBufferEnd(); return true }

      // ── Editing ──
      if (key.name === "x" && !key.shift) {
        vimCountRef.current = ""; const xCount = count
        for (let i = 0; i < xCount; i++) ta.deleteChar()
        handleContentChange()
        vimRepeatRef.current = () => { for (let i = 0; i < xCount; i++) ta.deleteChar(); handleContentChange() }
        return true
      }
      if (key.name === "x" && key.shift) {
        vimCountRef.current = ""
        for (let i = 0; i < count; i++) ta.deleteCharBackward()
        handleContentChange()
        vimRepeatRef.current = () => { for (let i = 0; i < count; i++) ta.deleteCharBackward(); handleContentChange() }
        return true
      }
      if (key.name === "s" && !key.shift) {
        vimCountRef.current = ""
        for (let i = 0; i < count; i++) ta.deleteChar()
        handleContentChange(); ta.focus(); setVimMode("insert")
        return true
      }
      if (key.name === "s" && key.shift) {
        vimCountRef.current = ""
        for (let i = 0; i < Math.min(count, ta.lineCount - ta.logicalCursor.row); i++) { ta.deleteLine() }
        handleContentChange(); ta.focus(); setVimMode("insert")
        return true
      }
      if (key.name === "d" && key.shift) {
        vimCountRef.current = ""; ta.deleteToLineEnd(); handleContentChange()
        vimRepeatRef.current = () => { ta.deleteToLineEnd(); handleContentChange() }
        return true
      }
      if (key.name === "c" && key.shift) {
        vimCountRef.current = ""; ta.deleteToLineEnd(); handleContentChange(); ta.focus(); setVimMode("insert")
        vimRepeatRef.current = () => { ta.deleteToLineEnd(); handleContentChange(); ta.focus(); setVimMode("insert") }
        return true
      }
      if (key.name === "d") { vimPendingOpRef.current = "d"; return true }
      if (key.name === "y") { vimPendingOpRef.current = "y"; return true }
      if (key.name === "c") { vimPendingOpRef.current = "c"; return true }
      if (key.name === ">") { vimPendingOpRef.current = ">"; return true }
      if (key.name === "<") { vimPendingOpRef.current = "<"; return true }

      if (key.name === "p" && !key.shift) {
        vimCountRef.current = ""
        const activeReg = vimActiveRegisterRef.current; vimActiveRegisterRef.current = null
        const txt = activeReg ? namedRegistersRef.current[activeReg] : vimYankRef.current
        if (txt) {
          for (let i = 0; i < count; i++) ta.insertText(txt)
          handleContentChange()
          vimRepeatRef.current = () => { ta.insertText(txt); handleContentChange() }
        }
        return true
      }
      if (key.name === "p" && key.shift) {
        vimCountRef.current = ""
        const activeReg = vimActiveRegisterRef.current; vimActiveRegisterRef.current = null
        const txt = activeReg ? namedRegistersRef.current[activeReg] : vimYankRef.current
        if (txt) {
          ta.moveCursorLeft()
          for (let i = 0; i < count; i++) ta.insertText(txt)
          handleContentChange()
          vimRepeatRef.current = () => { ta.moveCursorLeft(); ta.insertText(txt); handleContentChange() }
        }
        return true
      }

      // J (join line)
      if (key.name === "j" && key.shift) {
        vimCountRef.current = ""
        const curLine = ta.logicalCursor.row
        if (curLine + 1 < ta.lineCount) {
          ta.gotoLineEnd(); ta.deleteChar()
          const joinPos = ta.cursorOffset; const text = ta.plainText
          let spaceCount = 0
          while (joinPos + spaceCount < text.length && text[joinPos + spaceCount] === " ") { spaceCount++ }
          for (let i = 0; i < spaceCount; i++) ta.deleteChar()
          ta.insertText(" "); handleContentChange()
        }
        return true
      }

      if (key.name === "u") { vimCountRef.current = ""; ta.undo(); handleContentChange(); return true }
      if (key.name === ".") { vimRepeatRef.current?.(); return true }

      return true
    },
    [
      textareaRef, vimCountRef, vimPendingOpRef, vimReplacePendingRef,
      vimRegisterPendingRef, vimActiveRegisterRef, vimGCountRef,
      vimTextObjectRef, vimRepeatRef, vimYankRef, namedRegistersRef,
      pageSizeRef, mainHeightRef, vimSearchRef,
      handleContentChange, setVimMode, resetVimRefs,
      applyVimMotion, executePendingOp, applyOperatorToRange,
      applyVimSearchHighlights, setVimCmdState, vimCmdStateRef,
      indentLines, deindentLines,
    ],
  )

  // ─── handleVimVisualKey ──────────────────────────────────────

  const handleVimVisualKey = useCallback(
    (key: any): boolean => {
      const ta = textareaRef.current
      if (!ta) return true

      if (key.name === "escape" || (key.ctrl && key.name === "c")) {
        ta.clearSelection(); setVimMode("normal"); return true
      }
      if (key.ctrl || key.meta || key.option) return false

      const countStr = vimCountRef.current
      const count = countStr ? Math.max(1, parseInt(countStr) || 1) : 1

      if (/^[0-9]$/.test(key.name)) { vimCountRef.current += key.name; return true }

      if (key.name === "h") { vimCountRef.current = ""; for (let i = 0; i < count; i++) ta.moveCursorLeft({ select: true }); return true }
      if (key.name === "j") { vimCountRef.current = ""; for (let i = 0; i < count; i++) ta.moveCursorDown({ select: true }); return true }
      if (key.name === "k") { vimCountRef.current = ""; for (let i = 0; i < count; i++) ta.moveCursorUp({ select: true }); return true }
      if (key.name === "l") { vimCountRef.current = ""; for (let i = 0; i < count; i++) ta.moveCursorRight({ select: true }); return true }
      if (key.name === "w") { vimCountRef.current = ""; ta.moveWordForward({ select: true }); return true }
      if (key.name === "b") { vimCountRef.current = ""; ta.moveWordBackward({ select: true }); return true }
      if (key.name === "e") { vimCountRef.current = ""; ta.moveWordForward({ select: true }); return true }
      if (key.name === "0") { vimCountRef.current = ""; ta.gotoLineHome({ select: true }); return true }
      if (key.name === "$") { vimCountRef.current = ""; ta.gotoLineEnd({ select: true }); return true }
      if (key.name === "g" && key.shift) { vimCountRef.current = ""; ta.gotoBufferEnd({ select: true }); return true }

      const saveToNamedRegister = (text: string) => {
        if (vimActiveRegisterRef.current) {
          namedRegistersRef.current[vimActiveRegisterRef.current] = text
          vimActiveRegisterRef.current = null
        }
      }

      if (key.name === "d" || key.name === "x") {
        vimCountRef.current = ""
        const text = ta.getSelectedText()
        if (text) { vimYankRef.current = text; saveToNamedRegister(text) }
        ta.deleteSelection(); handleContentChange(); setVimMode("normal")
        return true
      }
      if (key.name === "y") {
        vimCountRef.current = ""
        const text = ta.getSelectedText()
        if (text) { vimYankRef.current = text; saveToNamedRegister(text) }
        ta.clearSelection(); setVimMode("normal")
        return true
      }
      if (key.name === "c") {
        vimCountRef.current = ""
        const text = ta.getSelectedText()
        if (text) { vimYankRef.current = text; saveToNamedRegister(text) }
        ta.deleteSelection(); handleContentChange(); ta.focus(); setVimMode("insert")
        return true
      }
      if (key.name === ">") {
        vimCountRef.current = ""
        const sel = ta.getSelection()
        if (sel) {
          const text = ta.plainText
          const startLine = text.slice(0, sel.start).split("\n").length - 1
          const endLine = text.slice(0, sel.end).split("\n").length - 1
          indentLines(startLine, endLine - startLine + 1)
        }
        ta.clearSelection(); setVimMode("normal")
        return true
      }
      if (key.name === "<") {
        vimCountRef.current = ""
        const sel = ta.getSelection()
        if (sel) {
          const text = ta.plainText
          const startLine = text.slice(0, sel.start).split("\n").length - 1
          const endLine = text.slice(0, sel.end).split("\n").length - 1
          deindentLines(startLine, endLine - startLine + 1)
        }
        ta.clearSelection(); setVimMode("normal")
        return true
      }

      return true
    },
    [textareaRef, handleContentChange, setVimMode, indentLines, deindentLines],
  )

  // ─── handleVimCmdKey ─────────────────────────────────────────

  const handleVimCmdKey = useCallback(
    (key: any, state: VimCmdState): void => {
      const ta = textareaRef.current

      if (key.name === "escape") {
        vimSearchRef.current.matches = []
        vimSearchRef.current.currentIndex = 0
        vimCmdStateRef.current = null
        setVimCmdState(null)
        if (ta) { ta.clearSelection(); ta.clearAllHighlights() }
        return
      }

      if (key.name === "enter" || key.name === "return") {
        if (state.mode === "search") {
          const matches = findAllMatches(state.input, markdown)
          vimSearchRef.current = { query: state.input, matches, currentIndex: 0 }
          if (matches.length > 0 && ta) { ta.setSelection(matches[0]!.start, matches[0]!.end) }
          if (ta) { applyVimSearchHighlights(ta, matches) }
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
        const newState = { mode: state.mode, input: newInput } as VimCmdState
        vimCmdStateRef.current = newState
        setVimCmdState(newState)
        if (state.mode === "search" && ta) {
          applyVimSearchHighlights(ta, findAllMatches(newInput, ta.plainText))
        }
        return
      }

      if ((key.name.length === 1 && !key.ctrl && !key.meta && !key.option) || key.name === "space") {
        const ch = key.name === "space" ? " " : key.name
        const newInput = state.input + ch
        const newState = { mode: state.mode, input: newInput } as VimCmdState
        vimCmdStateRef.current = newState
        setVimCmdState(newState)
        if (state.mode === "search" && ta) {
          applyVimSearchHighlights(ta, findAllMatches(newInput, ta.plainText))
        }
        return
      }
    },
    [markdown, textareaRef, findAllMatches, executeVimCommand, applyVimSearchHighlights, vimSearchRef, vimCmdStateRef, setVimCmdState],
  )

  // ─── runSearch ───────────────────────────────────────────────

  const runSearch = useCallback(
    (query: string, markdownText: string) => {
      if (!query) { return { matches: [] as { start: number; end: number }[], currentIndex: 0 } }
      const matches = findAllMatches(query, markdownText)
      const currentIndex = matches.length > 0 ? 0 : 0
      if (matches.length > 0) {
        const firstMatch = matches[0]
        if (firstMatch) { textareaRef.current?.setSelection(firstMatch.start, firstMatch.end) }
      }
      return { matches, currentIndex }
    },
    [findAllMatches, textareaRef],
  )

  return {
    handleVimNormalKey,
    handleVimVisualKey,
    handleVimCmdKey,
    executeVimCommand,
    applyVimSearchHighlights,
    runSearch,
  }
}
