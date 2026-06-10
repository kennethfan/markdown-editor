interface HelpOverlayProps {
  width: number
  height: number
}

export function HelpOverlay({ width, height }: HelpOverlayProps) {
  const sections = [
    {
      title: "Vim Modes",
      items: [
        { keys: "Esc", desc: "NORMAL ← INSERT/VISUAL" },
        { keys: "i / a / I / A", desc: "Insert (before/after/line start/line end)" },
        { keys: "o / O", desc: "New line below / above" },
        { keys: "v", desc: "VISUAL mode (selection)" },
        { keys: "Ctrl+Z", desc: "Toggle vim ON/OFF" },
      ],
    },
    {
      title: "Navigation",
      items: [
        { keys: "h j k l", desc: "← ↓ ↑ →" },
        { keys: "w / b / e", desc: "Word forward/backward/end" },
        { keys: "0 / $ / ^", desc: "Line start / end / text start" },
        { keys: "gg / G / 5gg", desc: "File start / end / go to line 5" },
        { keys: "Ctrl+f / Ctrl+b", desc: "Page down / Page up" },
        { keys: "Ctrl+d / Ctrl+u", desc: "Half page down / up" },
        { keys: "%", desc: "Jump to matching bracket" },
        { keys: "{ / }", desc: "Paragraph backward / forward" },
        { keys: "H / M / L", desc: "Screen top / middle / bottom" },
      ],
    },
    {
      title: "Editing",
      items: [
        { keys: "x / X", desc: "Delete char / delete char before" },
        { keys: "s / S", desc: "Delete char+insert / delete line+insert" },
        { keys: "D / C", desc: "Delete to line end / Change to line end" },
        { keys: "r", desc: "Replace char under cursor" },
        { keys: "Ctrl+a / Ctrl+x", desc: "Increment / decrement number" },
        { keys: "* / #", desc: "Search word forward / backward" },
        { keys: "\"a-\"z", desc: "Named registers (\"ayw, \"ap)" },
        { keys: ".", desc: "Repeat last edit" },
        { keys: "u / Ctrl+r", desc: "Undo / Redo" },
        { keys: "dd / yy / cc", desc: "Delete / Yank / Change line" },
        { keys: ">> / <<", desc: "Indent / Deindent line" },
        { keys: "dw / ciw / da\"", desc: "Operator + motion / text objects" },
      ],
    },
    {
      title: "Search",
      items: [
        { keys: "/pattern ⏎", desc: "Search (highlights all matches)" },
        { keys: "n / N", desc: "Next / Previous match" },
        { keys: "* / #", desc: "Search word under cursor" },
      ],
    },
    {
      title: "Text Objects",
      items: [
        { keys: "iw / aw", desc: "Inner / A word (diw, ciw, yaw)" },
        { keys: "i( / a(", desc: "Inner / A parentheses block" },
        { keys: "i{ / a{", desc: "Inner / A curly brace block" },
        { keys: "i[ / a[", desc: "Inner / A square bracket block" },
        { keys: 'i" / a"', desc: "Inner / A quoted string" },
        { keys: "i' / a'", desc: "Inner / A single-quoted string" },
      ],
    },
    {
      title: "Commands (:)",
      items: [
        { keys: ":w", desc: "Save file" },
        { keys: ":q / :q!", desc: "Quit / Force quit" },
        { keys: ":wq / :wq!", desc: "Save & quit / Force save & quit" },
        { keys: ":s/old/new/g", desc: "Substitute all matches" },
        { keys: ":help", desc: "Show this help" },
      ],
    },
    {
      title: "Global Shortcuts",
      items: [
        { keys: "Ctrl+S", desc: "Save" },
        { keys: "Ctrl+O", desc: "Open file" },
        { keys: "Ctrl+F", desc: "Find / Replace" },
        { keys: "Ctrl+K", desc: "Copy active code block" },
        { keys: "Ctrl+Shift+K", desc: "Copy all code blocks" },
        { keys: "Ctrl+E", desc: "Export code blocks" },
        { keys: "Alt+W", desc: "Toggle code wrap" },
        { keys: "Esc", desc: "Exit app (not in insert mode)" },
      ],
    },
  ]

  const columnWidth = Math.floor((width - 4) / 2)
  const leftCol = sections.slice(0, 3)
  const rightCol = sections.slice(3)

  return (
    <box
      width={width}
      height={height - 1}
      flexDirection="column"
      backgroundColor="#0d1117"
    >
      {/* Title bar */}
      <box
        width={width}
        height={1}
        backgroundColor="#161b22"
        flexDirection="row"
        justifyContent="center"
      >
        <text fg="#58a6ff" attributes={1}>
          ⌨️  Keyboard Shortcuts  —  Press Esc to close
        </text>
      </box>

      {/* Two-column layout */}
      <box width={width} height={height - 2} flexDirection="row">
        {/* Left column */}
        <box
          width={columnWidth}
          height={height - 2}
          flexDirection="column"
          paddingLeft={1}
          paddingTop={1}
        >
          {leftCol.map((section, si) => (
            <box key={si} flexDirection="column" height={section.items.length * 1 + 2}>
              <text fg="#d2a8ff" attributes={1}>
                {section.title}
              </text>
              <text> </text>
              {section.items.map((item, ii) => (
                <box key={ii} flexDirection="row" height={1} paddingLeft={1}>
                  <box width={20}>
                    <text fg="#7ee787">{item.keys}</text>
                  </box>
                  <text fg="#8b949e">{item.desc}</text>
                </box>
              ))}
              {si < leftCol.length - 1 && <text> </text>}
            </box>
          ))}
        </box>

        {/* Vertical divider */}
        <box width={1} height={height - 2} backgroundColor="#21262d">
          <text fg="#30363d">│</text>
        </box>

        {/* Right column */}
        <box
          width={columnWidth}
          height={height - 2}
          flexDirection="column"
          paddingLeft={1}
          paddingTop={1}
        >
          {rightCol.map((section, si) => (
            <box key={si} flexDirection="column" height={section.items.length * 1 + 2}>
              <text fg="#d2a8ff" attributes={1}>
                {section.title}
              </text>
              <text> </text>
              {section.items.map((item, ii) => (
                <box key={ii} flexDirection="row" height={1} paddingLeft={1}>
                  <box width={22}>
                    <text fg="#7ee787">{item.keys}</text>
                  </box>
                  <text fg="#8b949e">{item.desc}</text>
                </box>
              ))}
              {si < rightCol.length - 1 && <text> </text>}
            </box>
          ))}
        </box>
      </box>
    </box>
  )
}
