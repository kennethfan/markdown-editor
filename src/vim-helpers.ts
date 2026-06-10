// ─── Public types ──────────────────────────────────────────────

export interface CharRange {
  start: number
  end: number
}

export interface BracketPair {
  openPos: number
  closePos: number
}

export interface NumberInfo {
  start: number
  end: number
  value: number
}

// ─── Bracket matching helpers ──────────────────────────────────

/**
 * Find matching bracket forward/backward from position pos.
 * Supports () {} []. Returns the position of the matching bracket, or null.
 */
export function findBracketMatch(text: string, pos: number): number | null {
  if (pos < 0 || pos >= text.length) return null
  const ch = text[pos]!
  const pairs: Record<string, string> = {
    "(": ")",
    ")": "(",
    "{": "}",
    "}": "{",
    "[": "]",
    "]": "[",
  }
  const target = pairs[ch]
  if (!target) return null

  const isForward = ch === "(" || ch === "{" || ch === "["
  let depth = 1
  let i = pos + (isForward ? 1 : -1)
  const step = isForward ? 1 : -1
  const limit = isForward ? text.length : -1

  while (i !== limit) {
    if (isForward) {
      if (text[i]! === ch) depth++
      else if (text[i]! === target) depth--
    } else {
      if (text[i]! === ch) depth++
      else if (text[i]! === target) depth--
    }
    if (depth === 0) return i
    i += step
  }
  return null
}

/**
 * Find innermost bracket pair containing the cursor position.
 */
export function findInnermostBracketPair(
  text: string,
  cursor: number,
  open: string,
  close: string,
): BracketPair | null {
  let depth = 0
  for (let i = Math.min(cursor, text.length - 1); i >= 0; i--) {
    if (text[i]! === close) depth++
    else if (text[i]! === open) {
      if (depth === 0) {
        // Found candidate opening bracket at depth 0 — find its match
        let mDepth = 1
        for (let j = i + 1; j < text.length; j++) {
          if (text[j]! === open) mDepth++
          else if (text[j]! === close) {
            mDepth--
            if (mDepth === 0) {
              if (j >= cursor) return { openPos: i, closePos: j }
              break // Pair doesn't contain cursor
            }
          }
        }
      }
      if (depth > 0) depth--
    }
  }
  return null
}

// ─── Word/quote helpers ────────────────────────────────────────

/**
 * Find word boundaries around cursor for text objects (iw/aw).
 * A word is a sequence of alphanumeric/underscore characters, or non-whitespace.
 */
export function findWordBoundaries(text: string, cursor: number): CharRange | null {
  if (!text || cursor < 0 || cursor >= text.length) return null

  const isWordChar = (c: string) => /[a-zA-Z0-9_]/.test(c)
  const isNonSpace = (c: string) => /\S/.test(c)

  let ch = text[cursor]!
  let testFn = isWordChar(ch) ? isWordChar : (c: string) => isNonSpace(c)

  // Expand backward
  let start = cursor
  while (start > 0 && testFn(text[start - 1]!)) start--

  // Expand forward
  let end = cursor
  while (end < text.length && testFn(text[end]!)) end++

  // If on whitespace, find nearest non-whitespace
  if (start === end) {
    testFn = isNonSpace
    // Scan right for next word
    let i = cursor
    while (i < text.length && !isNonSpace(text[i]!)) i++
    if (i < text.length) {
      // Found a word to the right
      start = i
      end = i + 1
      ch = text[start]!
      testFn = isWordChar(ch) ? isWordChar : isNonSpace
      while (start > 0 && testFn(text[start - 1]!)) start--
      while (end < text.length && testFn(text[end]!)) end++
    }
  }

  if (start === cursor && end === cursor) return null
  return { start, end }
}

/**
 * Find quote pair around cursor position.
 */
export function findQuotePair(text: string, cursor: number, quote: string): CharRange | null {
  let left = -1
  let right = -1

  // Scan backward for opening quote
  for (let i = cursor - 1; i >= 0; i--) {
    if (text[i] === quote) {
      left = i
      break
    }
  }

  // Scan forward for closing quote
  for (let i = cursor; i < text.length; i++) {
    if (text[i] === quote) {
      right = i
      break
    }
  }

  if (left !== -1 && right !== -1 && left < right) {
    return { start: left, end: right }
  }
  return null
}

// ─── Number helper for Ctrl+a/Ctrl+x ───────────────────────────

/**
 * Find a number at or near the cursor position.
 * Scans forward from cursor for a digit, then expands to full number.
 */
export function findNumberAtCursor(text: string, cursor: number): NumberInfo | null {
  if (!text || cursor < 0 || cursor >= text.length) return null

  // Scan forward from cursor to find a digit
  let start = cursor
  while (start < text.length && !/\d/.test(text[start]!)) start++
  if (start >= text.length) return null      // Found a digit, scan backward to find the start of the number
      let numStart = start
      // Scan backward past digits first
      while (numStart > 0 && /\d/.test(text[numStart - 1]!)) numStart--
      // Now check for a minus sign before the first digit
      // Only treat as negative if the char before minus is NOT a digit
      // (avoids treating "5-3" as "-3")
      const hasRealMinus = numStart > 0
        && text[numStart - 1] === "-"
        && (numStart === 1 || !/\d/.test(text[numStart - 2]!))
      if (hasRealMinus) {
        numStart--
      }

  // Scan forward to find end of number
  let numEnd = start
  while (numEnd < text.length && /\d/.test(text[numEnd]!)) numEnd++

  const numStr = text.slice(numStart, numEnd)
  const value = parseInt(numStr, 10)
  if (isNaN(value)) return null

  return { start: numStart, end: numEnd, value }
}

// ─── Search helper ─────────────────────────────────────────────

/**
 * Find all substring match offsets (case-insensitive).
 */
export function findAllMatches(query: string, text: string): CharRange[] {
  if (!query) return []
  const matches: CharRange[] = []
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  let startIndex = 0
  while (startIndex < lowerText.length) {
    const idx = lowerText.indexOf(lowerQuery, startIndex)
    if (idx === -1) break
    matches.push({ start: idx, end: idx + query.length })
    startIndex = idx + 1
  }
  return matches
}

// ─── Text object resolution ────────────────────────────────────

/**
 * Resolve a text object range given the prefix (i/a) and key name.
 * Uses findWordBoundaries, findInnermostBracketPair, and findQuotePair internally.
 * Returns null if no valid text object is found.
 */
export function resolveTextObjectRange(
  text: string,
  cursor: number,
  prefix: "i" | "a",
  keyName: string,
): CharRange | null {
  if (keyName === "w") {
    const bounds = findWordBoundaries(text, cursor)
    if (bounds) {
      if (prefix === "a") {
        // aw: include trailing whitespace
        let end = bounds.end
        while (end < text.length && /\s/.test(text[end]!)) end++
        return { start: bounds.start, end }
      }
      return bounds
    }
  } else if (keyName === "(" || keyName === ")") {
    const pair = findInnermostBracketPair(text, cursor, "(", ")")
    if (pair) {
      return prefix === "a"
        ? { start: pair.openPos, end: pair.closePos + 1 }
        : { start: pair.openPos + 1, end: pair.closePos }
    }
  } else if (keyName === "{" || keyName === "}") {
    const pair = findInnermostBracketPair(text, cursor, "{", "}")
    if (pair) {
      return prefix === "a"
        ? { start: pair.openPos, end: pair.closePos + 1 }
        : { start: pair.openPos + 1, end: pair.closePos }
    }
  } else if (keyName === "[" || keyName === "]") {
    const pair = findInnermostBracketPair(text, cursor, "[", "]")
    if (pair) {
      return prefix === "a"
        ? { start: pair.openPos, end: pair.closePos + 1 }
        : { start: pair.openPos + 1, end: pair.closePos }
    }
  } else if (keyName === '"') {
    const pair = findQuotePair(text, cursor, '"')
    if (pair) {
      return prefix === "a"
        ? { start: pair.start, end: pair.end + 1 }
        : { start: pair.start + 1, end: pair.end }
    }
  } else if (keyName === "'") {
    const pair = findQuotePair(text, cursor, "'")
    if (pair) {
      return prefix === "a"
        ? { start: pair.start, end: pair.end + 1 }
        : { start: pair.start + 1, end: pair.end }
    }
  }
  return null
}

// ─── Paragraph movement helpers ─────────────────────────────────

/**
 * Find the row of the previous paragraph start (for `{` motion).
 * Uses blank lines as paragraph boundaries.
 */
export function findPrevParagraphStart(lines: string[], currentRow: number): number {
  let i = currentRow - 1
  // Skip blank lines
  while (i >= 0 && lines[i]!.trim() === "") i--
  // Find previous blank line (paragraph start is the line after)
  while (i >= 0 && lines[i]!.trim() !== "") i--
  return Math.max(i + 1, 0)
}

/**
 * Find the row of the next paragraph start (for `}` motion).
 * Uses blank lines as paragraph boundaries.
 */
export function findNextParagraphStart(lines: string[], currentRow: number): number {
  let i = currentRow + 1
  // Skip content lines to find next blank
  while (i < lines.length && lines[i]!.trim() !== "") i++
  // Skip blank lines to find next paragraph
  while (i < lines.length && lines[i]!.trim() === "") i++
  return Math.min(i, lines.length - 1)
}

// ─── Line text helper ──────────────────────────────────────────

/**
 * Find the index of the first non-whitespace character in a line.
 * Returns -1 if the line is empty or all whitespace.
 */
export function findFirstNonBlank(line: string): number {
  for (let i = 0; i < line.length; i++) {
    if (!/\s/.test(line[i]!)) return i
  }
  return -1
}

// ─── Code block extraction ─────────────────────────────────────

/**
 * Extract all fenced code blocks from markdown text with their language tags.
 * Returns an array of { content, lang } objects.
 */
export function extractCodeBlocksWithLang(text: string): { content: string; lang: string }[] {
  const blocks: { content: string; lang: string }[] = []
  const lines = text.split("\n")
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    if (line?.trimStart().startsWith("```")) {
      // Extract language from the opening fence (text after ```)
      const infoStr = line.trimStart().slice(3).trim()
      const lang = infoStr.split(/[\s)]/)[0] ?? ""
      const contentStart = i + 1
      let j = i + 1
      while (j < lines.length) {
        const fenceLine = lines[j]
        if (fenceLine?.trimStart().startsWith("```")) break
        j++
      }
      if (j < lines.length) {
        blocks.push({
          content: lines.slice(contentStart, j).join("\n"),
          lang,
        })
      }
      i = j + 1
    } else {
      i++
    }
  }
  return blocks
}
