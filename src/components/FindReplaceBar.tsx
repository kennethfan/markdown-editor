interface FindReplaceBarProps {
  width: number
  query: string
  replacement: string
  matchIndex: number
  matchCount: number
  mode: "find" | "replace"
  focus: "query" | "replacement"
}

export function FindReplaceBar({
  width,
  query,
  replacement,
  matchIndex,
  matchCount,
  mode,
  focus,
}: FindReplaceBarProps) {
  const queryDisplay = query.length > 0 ? query : "type to search"
  const replDisplay = replacement.length > 0 ? replacement : "replace with"

  return (
    <box
      width={width}
      height={mode === "replace" ? 2 : 1}
      backgroundColor="#1a1b26"
      flexDirection="column"
    >
      {/* Search row */}
      <box height={1} flexDirection="row" paddingLeft={1}>
        <text fg="#58a6ff" attributes={1}>
          🔍{" "}
        </text>
        <text
          fg={focus === "query" ? "#c9d1d9" : "#484f58"}
          attributes={focus === "query" ? 1 : 0}
        >
          {queryDisplay}
        </text>
        <text fg="#484f58">
          {" "}
          {matchCount > 0
            ? `${matchIndex + 1}/${matchCount}`
            : query.length > 0
              ? "0/0"
              : ""}{" "}
        </text>
        <text fg="#8b949e">
          {query.length > 0
            ? "Enter=next · ↑ prev · "
            : ""}
        </text>
        <text
          fg={mode === "replace" ? "#d2a8ff" : "#484f58"}
          attributes={mode === "replace" ? 1 : 0}
        >
          R=replace{" "}
        </text>
        <text fg="#484f58">Esc=close</text>
      </box>

      {/* Replace row (visible in replace mode) */}
      {mode === "replace" && (
        <box height={1} flexDirection="row" paddingLeft={1}>
          <text fg="#d2a8ff" attributes={1}>
            📝{" "}
          </text>
          <text
            fg={focus === "replacement" ? "#c9d1d9" : "#484f58"}
            attributes={focus === "replacement" ? 1 : 0}
          >
            {replDisplay}
          </text>          <text fg="#8b949e">
            {" "}Enter=replace · Shift+Enter=all{" "}
          </text>
        </box>
      )}
    </box>
  )
}
