import { useRef } from "react"
import type { InputRenderable } from "@opentui/core"
import type { DialogMode } from "../hooks/useFileOperations"

interface FileDialogProps {
  width: number
  mode: NonNullable<DialogMode>
  path: string
  onPathChange: (path: string) => void
  onSubmit: () => void
  onCancel: () => void
}

export function FileDialog({
  width,
  mode,
  path,
  onPathChange,
  onSubmit,
  onCancel,
}: FileDialogProps) {
  const inputRef = useRef<InputRenderable>(null)
  const label = mode === "save" ? " 💾 Save as:"
    : mode === "export" ? " 📦 Export to:"
    : mode === "export-single" ? " 📄 Export as:"
    : " 📂 Open file:"
  const placeholder = mode === "export" ? "path/to/directory" : "path/to/file.md"

  return (
    <box width={width} height={1} backgroundColor="#1a1b26" flexDirection="row">
      <text fg="#58a6ff" attributes={1}>
        {label}{" "}
      </text>
      <input
        ref={inputRef}
        value={path}
        onInput={(value) => onPathChange(value ?? "")}
        onSubmit={onSubmit}
        focused={true}
        placeholder={placeholder}
        style={{
          flexGrow: 1,
          backgroundColor: "#0d1117",
          textColor: "#c9d1d9",
          cursorColor: "#58a6ff",
        }}
      />
      <text fg="#484f58"> Esc=cancel </text>
    </box>
  )
}
