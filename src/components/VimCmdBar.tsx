interface VimCmdBarProps {
  width: number
  mode: "search" | "command"
  input: string
  matchIndex: number
  matchCount: number
}

export function VimCmdBar({ width, mode, input, matchIndex, matchCount }: VimCmdBarProps) {
  const prefix = mode === "search" ? "/" : ":"
  const color = mode === "search" ? "#58a6ff" : "#d2a8ff"
  const hint =
    mode === "search"
      ? matchCount > 0
        ? ` ${matchIndex + 1}/${matchCount}`
        : input.length > 0
          ? " 0/0"
          : ""
      : ""

  return (
    <box
      width={width}
      height={1}
      backgroundColor="#1a1b26"
      flexDirection="row"
    >
      <box flexDirection="row" paddingLeft={1}>
        <text fg={color} attributes={1}>
          {prefix}
        </text>
        <text fg="#c9d1d9">
          {input.length > 0 ? input : ""}
        </text>
        <text fg="#484f58">
          {hint}
        </text>
      </box>
      <box flexGrow={1} />
      <box paddingRight={1}>
        <text fg="#484f58">
          {mode === "search" ? "Enter=find · Esc=cancel" : "Enter=run · Esc=cancel"}
        </text>
      </box>
    </box>
  )
}
