import { SyntaxStyle, RGBA, infoStringToFiletype } from "@opentui/core"
import { useState, useMemo, useEffect } from "react"
import { marked } from "marked"
import type { ReactNode } from "react"
import type { Token as MarkedToken, Tokens } from "marked"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"

// ─── iTerm2 inline image protocol ──────────────────────────

// Check if the terminal supports inline images (iTerm2)
function isITerm2(): boolean {
  return process.env.TERM_PROGRAM === "iTerm.app"
}

// Maximum file size to render inline (2 MB)
const MAX_INLINE_IMAGE_BYTES = 2 * 1024 * 1024

/**
 * Display an image directly in the terminal using iTerm2's inline image protocol.
 * Writes to /dev/tty to bypass OpenTUI's stdout pipeline.
 * Returns true if the image was displayed successfully.
 */
function displayITermImage(filePath: string): boolean {
  try {
    if (!isITerm2()) return false
    const bytes = fs.readFileSync(filePath)
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_INLINE_IMAGE_BYTES) return false
    const base64 = bytes.toString("base64")
    const filename = filePath.split("/").pop() || "image"
    const escapedName = filename.replace(/[;:\\]/g, "_")
    // iTerm2 inline image protocol: OSC 1337 ; File = params : base64 ST
    const osc = `\x1b]1337;File=inline=1;size=${bytes.byteLength};name=${escapedName}:${base64}\x07`
    const fd = fs.openSync("/dev/tty", "w")
    fs.writeSync(fd, osc)
    fs.closeSync(fd)
    return true
  } catch {
    return false
  }
}

/**
 * Resolve an image URL to an absolute file path.
 * Handles ~/path, /absolute/path, and relative paths.
 * For relative paths, resolves against baseDir (or process.cwd() as fallback).
 */
function resolveImagePath(url: string, baseDir?: string): string | null {
  // Skip remote URLs
  if (url.includes("://")) return null
  try {
    if (url.startsWith("~")) {
      return os.homedir() + url.slice(1)
    } else if (url.startsWith("/")) {
      return url
    } else {
      return path.resolve(baseDir ?? process.cwd(), url)
    }
  } catch {
    return null
  }
}

interface CodeBlockRange {
  startLine: number // 0-based, first content line
  endLine: number   // 0-based, last content line
}

// Material-inspired syntax theme for code blocks
function createCodeStyle(): SyntaxStyle {
  return SyntaxStyle.fromStyles({
    keyword: { fg: RGBA.fromHex("#c792ea"), bold: true },
    string: { fg: RGBA.fromHex("#c3e88d") },
    comment: { fg: RGBA.fromHex("#546e7a"), italic: true },
    number: { fg: RGBA.fromHex("#f78c6c") },
    function: { fg: RGBA.fromHex("#82aaff") },
    operator: { fg: RGBA.fromHex("#89ddff") },
    type: { fg: RGBA.fromHex("#ffcb6b") },
    "type.builtin": { fg: RGBA.fromHex("#ffcb6b") },
    property: { fg: RGBA.fromHex("#f07178") },
    parameter: { fg: RGBA.fromHex("#ffcb6b") },
    "punctuation.delimiter": { fg: RGBA.fromHex("#89ddff") },
    "punctuation.bracket": { fg: RGBA.fromHex("#bbc2cf") },
    tag: { fg: RGBA.fromHex("#f07178") },
    "attribute.name": { fg: RGBA.fromHex("#ffcb6b") },
    "attribute.value": { fg: RGBA.fromHex("#c3e88d") },
    "string.special": { fg: RGBA.fromHex("#ffa94d") },
    "constant.builtin": { fg: RGBA.fromHex("#f78c6c") },
    "variable.special": { fg: RGBA.fromHex("#ff6b6b") },
    default: { fg: RGBA.fromHex("#bbc2cf") },
  })
}

function renderInlineTokens(tokens: MarkedToken[] | undefined): ReactNode[] {
  if (!tokens) return []
  return tokens.map((token, i) => {
    switch (token.type) {
      case "text": {
        const t = token as Tokens.Text
        return t.text
      }
      case "strong": {
        const t = token as Tokens.Strong
        return <strong key={i}>{renderInlineTokens(t.tokens)}</strong>
      }
      case "em": {
        const t = token as Tokens.Em
        return <em key={i}>{renderInlineTokens(t.tokens)}</em>
      }
      case "codespan": {
        const t = token as Tokens.Codespan
        return (
          <span key={i} fg="#e6db74">
            {t.text}
          </span>
        )
      }
      case "link": {
        const t = token as Tokens.Link
        return (
          <u><span key={i} fg="#66d9ef">{t.text}</span></u>
        )
      }
      case "del": {
        const t = token as Tokens.Del
        return (
          <span key={i} attributes={64}>
            {renderInlineTokens(t.tokens)}
          </span>
        )
      }
      case "br": {
        return <text key={i}> </text>
      }
      case "image": {
        const t = token as Tokens.Image
        const url = t.href || ""
        const alt = t.text || url
        return (
          <span key={i}>
            <text fg="#bb9af7">🖼️ </text>
            <text fg="#e0af68">{alt}</text>
            <text fg="#565f89"> ({url})</text>
          </span>
        )
      }
      case "escape": {
        const t = token as Tokens.Escape
        return t.text
      }
      default: {
        return (token as Tokens.Generic).raw ?? ""
      }
    }
  })
}

function headingColor(depth: number): string {
  const colors = ["#ff6b6b", "#ffa94d", "#ffd43b", "#69db7c", "#74c0fc", "#b197fc"]
  return colors[Math.min(depth - 1, colors.length - 1)] ?? "#ffffff"
}

function renderToken(
  token: MarkedToken,
  key: number,
  syntaxStyle: SyntaxStyle,
  codeBlockLineColors: Map<number, string> | undefined,
  onCopyCodeBlock?: (content: string) => void,
  codeWrap?: boolean,
): ReactNode {
  switch (token.type) {
    case "heading": {
      const t = token as Tokens.Heading
      return (
        <box key={key} paddingTop={t.depth <= 2 ? 1 : 0} paddingBottom={t.depth <= 2 ? 1 : 0}>
          <text fg={headingColor(t.depth)} attributes={1}>
            {"#".repeat(t.depth)} {renderInlineTokens(t.tokens)}
          </text>
        </box>
      )
    }

    case "paragraph": {
      const t = token as Tokens.Paragraph
      return (
        <box paddingY={1}>
          <text>{renderInlineTokens(t.tokens)}</text>
        </box>
      )
    }

    case "code": {
      const t = token as Tokens.Code
      const lang = t.lang ?? ""
      const isActive = codeBlockLineColors !== undefined
      const hasLang = lang.length > 0
      const wrapLabel = codeWrap !== false ? "W" : "S"
      const title = isActive
        ? hasLang ? ` ${lang}  [Copy] [${wrapLabel}] ` : ` [Copy] [${wrapLabel}] `
        : hasLang ? ` ${lang}  [${wrapLabel}] ` : ` [${wrapLabel}] `
      const lineCount = t.text.split("\n").length
      const gutterWidth = String(lineCount).length

      const wrapMode = codeWrap !== false ? "word" as const : "none" as const
      const codeInner = (
        <line-number
          fg="#484f58"
          bg="#1a1b26"
          minWidth={gutterWidth}
          paddingRight={1}
          lineColors={codeBlockLineColors}
        >
          <code
            content={t.text}
            filetype={infoStringToFiletype(lang) || lang || undefined}
            syntaxStyle={syntaxStyle}
            drawUnstyledText
            wrapMode={wrapMode}
            style={{
              flexGrow: 1,
              fg: "#bbc2cf",
              bg: "#1a1b26",
            }}
          />
        </line-number>
      )

      return (
        <box
          marginY={1}
          borderStyle="single"
          borderColor="#414868"
          backgroundColor="#1a1b26"
          title={title}
          titleAlignment="right"
          onMouseDown={() => onCopyCodeBlock?.(t.text)}
        >
          {codeWrap !== false ? (
            codeInner
          ) : (
            <scrollbox
              style={{
                flexGrow: 1,
                contentOptions: { backgroundColor: "#1a1b26" },
                scrollbarOptions: {
                  showArrows: false,
                  trackOptions: {
                    foregroundColor: "#30363d",
                    backgroundColor: "#1a1b26",
                  },
                },
              }}
            >
              {codeInner}
            </scrollbox>
          )}
        </box>
      )
    }

    case "blockquote": {
      const t = token as Tokens.Blockquote
      return (
        <box paddingLeft={2} marginY={1} backgroundColor="#161b22">
          <box flexDirection="column" paddingLeft={1} border={["left"]} borderColor="#58a6ff">
            {t.tokens.length > 0 ? (
              t.tokens.map((child, i) => renderToken(child, i, syntaxStyle, codeBlockLineColors, onCopyCodeBlock, codeWrap))
            ) : (
              <text fg="#8b949e">{t.text}</text>
            )}
          </box>
        </box>
      )
    }

    case "list": {
      const t = token as Tokens.List
      return (
        <box flexDirection="column" paddingY={1} paddingLeft={2}>
          {t.items.map((item, i) => (
            <box key={i} flexDirection="row">
              <text fg="#ffa94d">
                {t.ordered ? `${(Number(t.start) || 1) + i}.` : "•"}{" "}
              </text>
              <text>
                {renderInlineTokens((item as Tokens.ListItem).tokens)}
              </text>
            </box>
          ))}
        </box>
      )
    }

    case "hr": {
      return (
        <box paddingY={1}>
          <text fg="#414868">{"─".repeat(40)}</text>
        </box>
      )
    }

    case "space": {
      return <box paddingY={1} />
    }

    case "html": {
      const t = token as Tokens.HTML
      return (
        <box paddingY={1}>
          <text fg="#888888">{t.text}</text>
        </box>
      )
    }

    default: {
      const t = token as Tokens.Generic
      return (
        <box paddingY={1}>
          <text>{t.text ?? t.raw}</text>
        </box>
      )
    }
  }
}

/**
 * Parse the markdown line by line to find all fenced code block ranges.
 * Each range represents the 0-based content line range (excludes the fence lines themselves).
 */
function findCodeBlockRanges(markdown: string): CodeBlockRange[] {
  const ranges: CodeBlockRange[] = []
  const lines = markdown.split("\n")
  let i = 0

  while (i < lines.length) {
    const openingLine = lines[i]
    if (openingLine && openingLine.trimStart().startsWith("```")) {
      const contentStart = i + 1
      // Scan forward for the closing fence
      let j = i + 1
      while (j < lines.length) {
        const fenceLine = lines[j]
        if (fenceLine && fenceLine.trimStart().startsWith("```")) {
          break
        }
        j++
      }
      // If we found the closing fence, add the range
      if (j < lines.length) {
        ranges.push({ startLine: contentStart, endLine: j - 1 })
      }
      i = j + 1
    } else {
      i++
    }
  }

  return ranges
}

/**
 * Given the cursor line (0-based) and code block ranges, determine which line
 * within which code block should be highlighted. Returns undefined if the cursor
 * is not inside any code block.
 */
function findActiveCodeBlockLine(
  cursorLine: number,
  codeBlockRanges: CodeBlockRange[],
): { blockIndex: number; lineWithinBlock: number } | undefined {
  for (let i = 0; i < codeBlockRanges.length; i++) {
    const range = codeBlockRanges[i]
    if (range && cursorLine >= range.startLine && cursorLine <= range.endLine) {
      const lineWithinBlock = cursorLine - range.startLine + 1
      return { blockIndex: i, lineWithinBlock }
    }
  }
  return undefined
}

interface MarkdownPreviewProps {
  markdown: string
  activeEditorLine?: number // 0-based cursor line in the editor
  onCopyCodeBlock?: (content: string) => void
  onCopyAllCodeBlocks?: () => void
  codeWrap?: boolean // true = word-wrap, false = horizontal scroll
  baseDir?: string // directory of the current markdown file, for relative image path resolution
}

// Recursively extract all local image URLs from marked tokens
function extractLocalImageUrls(tokens: MarkedToken[]): string[] {
  const urls: string[] = []
  function walk(list: MarkedToken[]) {
    for (const token of list) {
      if (token.type === "image") {
        const t = token as Tokens.Image
        if (t.href && !t.href.includes("://")) {
          urls.push(t.href)
        }
      }
      if ("tokens" in token && Array.isArray((token as any).tokens)) {
        walk((token as any).tokens as MarkedToken[])
      }
      if ("items" in token && Array.isArray((token as any).items)) {
        for (const item of (token as any).items as any[]) {
          if (item.tokens && Array.isArray(item.tokens)) {
            walk(item.tokens as MarkedToken[])
          }
        }
      }
    }
  }
  walk(tokens)
  return urls
}

export function MarkdownPreview({ markdown, activeEditorLine, onCopyCodeBlock, onCopyAllCodeBlocks, codeWrap, baseDir }: MarkdownPreviewProps) {
  const [syntaxStyle] = useState(createCodeStyle)
  const tokens = marked.lexer(markdown)

  // Extract local image URLs and auto-render via iTerm2 protocol
  const localImageUrls = useMemo(() => extractLocalImageUrls(tokens), [tokens])

  useEffect(() => {
    if (localImageUrls.length === 0 || !isITerm2()) return

    const timer = setTimeout(() => {
      for (const url of localImageUrls) {
        const fullPath = resolveImagePath(url, baseDir)
        if (fullPath) {
          displayITermImage(fullPath)
        }
      }
    }, 80) // wait for OpenTUI to flush its frame

    return () => clearTimeout(timer)
  }, [localImageUrls])

  // Find all fenced code block ranges in the markdown
  const codeBlockRanges = useMemo(() => findCodeBlockRanges(markdown), [markdown])

  // Determine which code block line is "active" based on editor cursor position
  const activeLineInBlock = useMemo(
    () => (activeEditorLine !== undefined
      ? findActiveCodeBlockLine(activeEditorLine, codeBlockRanges)
      : undefined),
    [activeEditorLine, codeBlockRanges],
  )

  // Build a lookup map: code block index → lineColors map
  // Only the code block the cursor is inside gets a highlight color
  const codeBlockLineColorsMap = useMemo(() => {
    const map = new Map<number, Map<number, string>>()
    if (activeLineInBlock) {
      const { blockIndex, lineWithinBlock } = activeLineInBlock
      map.set(blockIndex, new Map([[lineWithinBlock, "#24283b"]]))
    }
    return map
  }, [activeLineInBlock])

  // Track sequential code block index during rendering
  let codeBlockIndex = 0

  return (
    <scrollbox
      style={{
        flexGrow: 1,
        rootOptions: { backgroundColor: "#0d1117" },
        wrapperOptions: { backgroundColor: "#0d1117" },
        viewportOptions: { backgroundColor: "#0d1117" },
        contentOptions: { backgroundColor: "#0d1117" },
        scrollbarOptions: {
          showArrows: false,
          trackOptions: {
            foregroundColor: "#30363d",
            backgroundColor: "#0d1117",
          },
        },
      }}
    >
      <box flexDirection="column" padding={1}>
        {tokens.length === 0 ? (
          <text fg="#484f58">
            Preview will appear here...
          </text>
        ) : (            tokens.map((token, i) => {
            const lineColors = token.type === "code"
              ? codeBlockLineColorsMap.get(codeBlockIndex++)
              : undefined
            return renderToken(token, i, syntaxStyle, lineColors, onCopyCodeBlock, codeWrap)
          })
        )}
      </box>
    </scrollbox>
  )
}
