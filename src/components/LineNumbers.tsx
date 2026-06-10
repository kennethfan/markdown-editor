interface LineNumbersProps {
  totalLines: number
  scrollOffset: number
  visibleLines: number
  activeLine: number
  width: number
  relative?: boolean
}

export function LineNumbers({
  totalLines,
  scrollOffset,
  visibleLines,
  activeLine,
  width,
  relative = false,
}: LineNumbersProps) {
  const startLine = Math.max(0, scrollOffset)
  const endLine = Math.min(startLine + visibleLines, totalLines)
  const gutterWidth = width

  const lineElements: React.ReactNode[] = []
  for (let line = startLine; line < endLine; line++) {
    const lineNum = line + 1
    const isActive = lineNum === activeLine

    let displayNum: number
    if (relative) {
      displayNum = isActive ? 0 : Math.abs(lineNum - activeLine)
    } else {
      displayNum = lineNum
    }

    const padded = String(displayNum).padStart(gutterWidth - 1)

    lineElements.push(
      <box key={line} height={1} flexDirection="row" width={gutterWidth}>
        <text
          fg={isActive ? "#58a6ff" : "#484f58"}
          attributes={isActive ? 1 : 0}
        >
          {padded}
        </text>
        <text> </text>
      </box>,
    )
  }

  return (
    <box
      width={gutterWidth}
      height={visibleLines}
      flexDirection="column"
      backgroundColor="#0d1117"
    >
      {lineElements}
    </box>
  )
}
