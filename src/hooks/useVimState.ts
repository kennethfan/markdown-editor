import { useState, useRef, useCallback } from "react"
import type { TextareaRenderable } from "@opentui/core"

export type VimMode = "normal" | "insert" | "visual"
export type VimPendingOp = "d" | "y" | "c" | ">" | "<" | "g" | null

export interface VimCmdState {
  mode: "search" | "command"
  input: string
}

export interface UseVimStateReturn {
  // State
  vimMode: VimMode
  setVimMode: React.Dispatch<React.SetStateAction<VimMode>>
  vimEnabled: boolean
  setVimEnabled: React.Dispatch<React.SetStateAction<boolean>>
  showHelp: boolean
  setShowHelp: React.Dispatch<React.SetStateAction<boolean>>
  vimCmdState: VimCmdState | null
  setVimCmdState: React.Dispatch<React.SetStateAction<VimCmdState | null>>
  vimCmdStateRef: React.MutableRefObject<VimCmdState | null>

  // Refs
  vimYankRef: React.MutableRefObject<string>
  vimCountRef: React.MutableRefObject<string>
  vimPendingOpRef: React.MutableRefObject<VimPendingOp>
  vimGCountRef: React.MutableRefObject<string>
  vimRepeatRef: React.MutableRefObject<(() => void) | null>
  pageSizeRef: React.MutableRefObject<number>
  vimTextObjectRef: React.MutableRefObject<"i" | "a" | null>
  vimReplacePendingRef: React.MutableRefObject<boolean>
  mainHeightRef: React.MutableRefObject<number>
  namedRegistersRef: React.MutableRefObject<Record<string, string>>
  vimRegisterPendingRef: React.MutableRefObject<string | null>
  vimActiveRegisterRef: React.MutableRefObject<string | null>
  vimSearchRef: React.MutableRefObject<{
    query: string
    matches: { start: number; end: number }[]
    currentIndex: number
  }>
  vimSearchHlStyleIdRef: React.MutableRefObject<number | null>

  // Textarea input control
  disableTextareaInput: (textareaRef: React.RefObject<TextareaRenderable | null>) => void
  enableTextareaInput: (textareaRef: React.RefObject<TextareaRenderable | null>) => void

  // Helpers
  resetVimRefs: () => void
}

export function useVimState(): UseVimStateReturn {
  const [vimMode, setVimMode] = useState<VimMode>("insert")
  const [vimEnabled, setVimEnabled] = useState(true)
  const [showHelp, setShowHelp] = useState(false)
  const [vimCmdState, setVimCmdState] = useState<VimCmdState | null>(null)
  const vimCmdStateRef = useRef<VimCmdState | null>(null)

  const vimYankRef = useRef("")
  const vimCountRef = useRef("")
  const vimPendingOpRef = useRef<VimPendingOp>(null)
  const vimGCountRef = useRef("")
  const vimRepeatRef = useRef<(() => void) | null>(null)
  const pageSizeRef = useRef(10)
  const vimTextObjectRef = useRef<"i" | "a" | null>(null)
  const vimReplacePendingRef = useRef(false)
  const mainHeightRef = useRef(10)
  const namedRegistersRef = useRef<Record<string, string>>({})
  const vimRegisterPendingRef = useRef<string | null>(null)
  const vimActiveRegisterRef = useRef<string | null>(null)
  const vimSearchRef = useRef({
    query: "",
    matches: [] as { start: number; end: number }[],
    currentIndex: 0,
  })
  const vimSearchHlStyleIdRef = useRef<number | null>(null)

  // Textarea input control refs (stored with React refs)
  const savedHandleKeyPressRef = useRef<((key: any) => boolean) | null>(null)
  const textareaInputEnabledRef = useRef(true)

  const disableTextareaInput = useCallback(
    (textareaRef: React.RefObject<TextareaRenderable | null>) => {
      const ta = textareaRef.current
      if (!ta || !textareaInputEnabledRef.current) return
      savedHandleKeyPressRef.current = ta.handleKeyPress
      ta.handleKeyPress = () => false
      textareaInputEnabledRef.current = false
    },
    [],
  )

  const enableTextareaInput = useCallback(
    (textareaRef: React.RefObject<TextareaRenderable | null>) => {
      const ta = textareaRef.current
      if (!ta || textareaInputEnabledRef.current) return
      if (savedHandleKeyPressRef.current) {
        ta.handleKeyPress = savedHandleKeyPressRef.current
      }
      savedHandleKeyPressRef.current = null
      textareaInputEnabledRef.current = true
    },
    [],
  )

  const resetVimRefs = useCallback(() => {
    vimCountRef.current = ""
    vimPendingOpRef.current = null
  }, [])

  return {
    vimMode, setVimMode,
    vimEnabled, setVimEnabled,
    showHelp, setShowHelp,
    vimCmdState, setVimCmdState,
    vimCmdStateRef,
    vimYankRef, vimCountRef, vimPendingOpRef,
    vimGCountRef, vimRepeatRef,
    pageSizeRef, vimTextObjectRef, vimReplacePendingRef,
    mainHeightRef, namedRegistersRef,
    vimRegisterPendingRef, vimActiveRegisterRef,
    vimSearchRef, vimSearchHlStyleIdRef,
    disableTextareaInput, enableTextareaInput,
    resetVimRefs,
  }
}
