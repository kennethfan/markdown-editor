import type { StatusMessage } from "../hooks/useFileOperations"

interface StatusBarProps {
  width: number
  currentFilePath: string | null
  statusMessage: StatusMessage | null
  isModified: boolean
  cursorLine: number
  cursorCol: number
  wordCount: number
  vimMode: "normal" | "insert" | "visual"
  vimEnabled: boolean
}

export function StatusBar({
  width,
  currentFilePath,
  statusMessage,
  isModified,
  cursorLine,
  cursorCol,
  wordCount,
  vimMode,
  vimEnabled,
}: StatusBarProps) {
  const statusColor = statusMessage
    ? statusMessage.type === "error"
      ? "#ff6b6b"
      : statusMessage.type === "success"
        ? "#3fb950"
        : "#8b949e"
    : "#484f58"

  // Vim mode indicator colors
  const modeConfig: Record<string, { label: string; color: string }> = {
    normal: { label: " NORMAL ", color: "#58a6ff" },
    insert: { label: " INSERT ", color: "#3fb950" },
    visual: { label: " VISUAL ", color: "#d2a8ff" },
  }
  const mode = vimEnabled ? modeConfig[vimMode]! : { label: " OFF  ", color: "#484f58" }

  // Left section: vim mode + file path + modified indicator
  const fileLabel = currentFilePath
    ? `${isModified ? "● " : ""}${currentFilePath}`
    : `${isModified ? "● " : ""}untitled`
  const fileColor = isModified ? "#ffa94d" : "#8b949e"

  // Right section: cursor position, word count, shortcuts
  const cursorLabel = `Ln ${cursorLine}, Col ${cursorCol}`
  const wordsLabel = `${wordCount} ${wordCount === 1 ? "word" : "words"}`

  return (
    <box
      width={width}
      height={1}
      backgroundColor="#161b22"
      flexDirection="row"
      justifyContent="space-between"
    >
      <box flexDirection="row" paddingLeft={1}>
        {/* Vim mode badge */}
        <text fg={mode.color} attributes={1}>
          {mode.label}
        </text>
        <text> </text>
        <text fg={fileColor}>{fileLabel}</text>
      </box>
      <box flexDirection="row" paddingRight={1}>
        {statusMessage ? (
          <text fg={statusColor}>{statusMessage.text}</text>
        ) : (
          <text fg="#484f58">
            {cursorLabel}  │  {wordsLabel}  │  Ctrl+S save · Ctrl+F find · Ctrl+O open
          </text>
        )}
      </box>
    </box>
  )
}
