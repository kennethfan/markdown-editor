import { useTerminalDimensions } from "@opentui/react"
import { useState, useRef, useCallback, useMemo, useEffect } from "react"
import { SyntaxStyle, type TextareaRenderable } from "@opentui/core"
import { MarkdownPreview } from "./MarkdownPreview"
import path from "node:path"
import { useFileOperations } from "./hooks/useFileOperations"
import { useVimState } from "./hooks/useVimState"
import { useVimKeyHandlers } from "./hooks/useVimKeyHandlers"
import { useKeyboardHandlers } from "./hooks/useKeyboardHandlers"
import { useClipboard } from "./hooks/useClipboard"
import { useExport } from "./hooks/useExport"
import { useAppUI } from "./hooks/useAppUI"
import { StatusBar} from "./components/StatusBar"
import { FileDialog } from "./components/FileDialog"
import { FindReplaceBar } from "./components/FindReplaceBar"
import { VimCmdBar } from "./components/VimCmdBar"
import { HelpOverlay } from "./components/HelpOverlay"
import { LineNumbers } from "./components/LineNumbers"
import {
  findAllMatches,
} from "./vim-helpers"

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

  // ── Vim state ──
  const vimState = useVimState()
  const {
    vimMode, setVimMode, vimEnabled, setVimEnabled,
    showHelp, setShowHelp,
    vimCmdState, setVimCmdState, vimCmdStateRef,
    pageSizeRef, mainHeightRef,
    disableTextareaInput, enableTextareaInput,
    vimSearchRef,
  } = vimState

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

  // Initialize page size for Ctrl+f/b/d/u scrolling (after mainHeight is available)
  pageSizeRef.current = Math.max(10, Math.floor(mainHeight * 0.8))
  mainHeightRef.current = mainHeight

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

  // Scroll offset for line numbers
  const [scrollOffset, setScrollOffset] = useState(0)
  const [showLineNumbers, setShowLineNumbers] = useState(true)
  const [relativeLineNumbers, setRelativeLineNumbers] = useState(false)

  // Current line highlight
  const currentLineHlStyleIdRef = useRef<number | null>(null)

  const handleContentChange = useCallback(() => {
    if (textareaRef.current) {
      setMarkdown(textareaRef.current.plainText)
      setScrollOffset(textareaRef.current.scrollY ?? 0)
    }
  }, [textareaRef, setMarkdown])

  const handleCursorChange = useCallback(
    (event: { line: number; visualColumn: number }) => {
      setCursorLine(event.line + 1)
      setCursorCol(event.visualColumn + 1)
      setScrollOffset(textareaRef.current?.scrollY ?? 0)
    },
    [],
  )

  // ── Vim key handlers ──
  const vimHandlers = useVimKeyHandlers({
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
  })

  const {
    handleVimNormalKey,
    handleVimVisualKey,
    handleVimCmdKey,
    runSearch,
    applyVimSearchHighlights,
  } = vimHandlers

  // ─── Current line highlight ───
  const applyCurrentLineHighlight = useCallback(() => {
    const ta = textareaRef.current
    if (!ta) return

    // Register current line style once
    if (currentLineHlStyleIdRef.current === null) {
      let syntaxStyle = ta.syntaxStyle
      if (!syntaxStyle) {
        syntaxStyle = SyntaxStyle.fromStyles({
          currentLine: { bg: "#1c2333" },
        })
        ta.syntaxStyle = syntaxStyle
      } else {
        syntaxStyle.registerStyle("currentLine", { bg: "#1c2333" })
      }
      currentLineHlStyleIdRef.current = syntaxStyle.resolveStyleId("currentLine")
    }

    const hlStyleId = currentLineHlStyleIdRef.current
    if (hlStyleId === null) return

    // Compute current line character range
    const text = ta.plainText
    const cursorOffset = ta.cursorOffset
    let lineStart = 0
    for (let i = cursorOffset - 1; i >= 0; i--) {
      if (text[i] === '\n') { lineStart = i + 1; break }
    }
    let lineEnd = text.length
    for (let i = cursorOffset; i < text.length; i++) {
      if (text[i] === '\n') { lineEnd = i; break }
    }

    // Clear all highlights, re-apply search, then current line
    ta.clearAllHighlights()
    applyVimSearchHighlights(ta, vimSearchRef.current.matches)
    ta.addHighlightByCharRange({ start: lineStart, end: lineEnd, styleId: hlStyleId })
  }, [textareaRef, applyVimSearchHighlights, vimSearchRef])

  useEffect(() => {
    applyCurrentLineHighlight()
  }, [cursorLine, markdown, applyCurrentLineHighlight])

  // ─── Clipboard ───
  const { copyToClipboard, copyActiveCodeBlock, copyAllCodeBlocks } = useClipboard(
    markdown, cursorLine, setStatusMessage,
  )

  // ─── Export ───
  const { handleExportSubmit, handleExportSingleSubmit } = useExport(
    dialogPath, markdown, setStatusMessage, setDialogMode, textareaRef,
  )

  // ─── App UI callbacks ──
  const { handleImageStatus, handleCancelDialog } = useAppUI(
    setStatusMessage, setDialogMode, setDialogPath, textareaRef,
  )

  // ─── Global keyboard shortcuts ────────────────────────────
  useKeyboardHandlers({
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
  })

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
              flexDirection="row"
              width={halfWidth}
              height={mainHeight}
              borderStyle="rounded"
              borderColor="#30363d"
              title=" ✏️ Editor "
              titleAlignment="center"
              backgroundColor="#161b22"
            >
              {showLineNumbers && (
                <>
                  <LineNumbers
                    totalLines={markdown.split('\n').length}
                    scrollOffset={scrollOffset}
                    visibleLines={mainHeight - 3}
                    activeLine={cursorLine}
                    width={5}
                    relative={relativeLineNumbers}
                  />
                  {/* Separator between line numbers and textarea */}
                  <box width={1} backgroundColor="#21262d">
                    <text fg="#30363d">│</text>
                  </box>
                </>
              )}
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

          {/* Status bar or overlays */}
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
