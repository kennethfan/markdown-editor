import { test, expect } from "bun:test"
import {
  findBracketMatch,
  findInnermostBracketPair,
  findWordBoundaries,
  findQuotePair,
  findNumberAtCursor,
  findAllMatches,
  resolveTextObjectRange,
  findPrevParagraphStart,
  findNextParagraphStart,
  findFirstNonBlank,
  extractCodeBlocksWithLang,
} from "./vim-helpers"

// ─── findBracketMatch ──────────────────────────────────────────

test("findBracketMatch: matching parentheses forward", () => {
  expect(findBracketMatch("hello (world)", 6)).toBe(12) // ( at 6, ) at 12
})

test("findBracketMatch: matching parentheses backward", () => {
  expect(findBracketMatch("hello (world)", 12)).toBe(6) // ) at 12, ( at 6
})

test("findBracketMatch: nested brackets", () => {
  expect(findBracketMatch("a(b(c)d)", 1)).toBe(7) // outer pair
  expect(findBracketMatch("a(b(c)d)", 3)).toBe(5) // inner pair
})

test("findBracketMatch: curly braces", () => {
  expect(findBracketMatch("{hello}", 0)).toBe(6) // { at 0, } at 6
})

test("findBracketMatch: square brackets", () => {
  expect(findBracketMatch("[hello]", 0)).toBe(6) // [ at 0, ] at 6
})

test("findBracketMatch: no matching bracket", () => {
  expect(findBracketMatch("(hello", 0)).toBe(null) // unmatched
})

test("findBracketMatch: not on a bracket", () => {
  expect(findBracketMatch("hello", 0)).toBe(null)
})

test("findBracketMatch: empty text", () => {
  expect(findBracketMatch("", 0)).toBe(null)
})

test("findBracketMatch: multiple pairs", () => {
  expect(findBracketMatch("()()", 0)).toBe(1)
  expect(findBracketMatch("()()", 2)).toBe(3)
})

// ─── findInnermostBracketPair ──────────────────────────────────

test("findInnermostBracketPair: innermost pair containing cursor", () => {
  const result = findInnermostBracketPair("a(b(c)d)", 4, "(", ")")
  expect(result).toEqual({ openPos: 3, closePos: 5 }) // inner pair (c)
})

test("findInnermostBracketPair: cursor in outer pair", () => {
  const result = findInnermostBracketPair("a(b(c)d)", 2, "(", ")")
  expect(result).toEqual({ openPos: 1, closePos: 7 }) // outer pair
})

test("findInnermostBracketPair: cursor at opening bracket", () => {
  const result = findInnermostBracketPair("a(b(c)d)", 3, "(", ")")
  expect(result).toEqual({ openPos: 3, closePos: 5 }) // inner pair (c)
})

test("findInnermostBracketPair: no pair containing cursor", () => {
  const result = findInnermostBracketPair("a(b)c", 0, "(", ")")
  expect(result).toBe(null) // cursor at 'a', outside pair
})

test("findInnermostBracketPair: curly braces", () => {
  const result = findInnermostBracketPair("a{b{c}d}", 4, "{", "}")
  expect(result).toEqual({ openPos: 3, closePos: 5 }) // inner pair {c}
})

test("findInnermostBracketPair: empty pair", () => {
  const result = findInnermostBracketPair("()", 0, "(", ")")
  expect(result).toEqual({ openPos: 0, closePos: 1 })
})

// ─── findWordBoundaries ────────────────────────────────────────

test("findWordBoundaries: in middle of word", () => {
  expect(findWordBoundaries("hello world", 2)).toEqual({ start: 0, end: 5 })
})

test("findWordBoundaries: at start of word", () => {
  expect(findWordBoundaries("hello world", 0)).toEqual({ start: 0, end: 5 })
})

test("findWordBoundaries: at end of word", () => {
  expect(findWordBoundaries("hello world", 4)).toEqual({ start: 0, end: 5 })
})

test("findWordBoundaries: second word", () => {
  expect(findWordBoundaries("hello world", 8)).toEqual({ start: 6, end: 11 })
})

test("findWordBoundaries: on whitespace between words", () => {
  const result = findWordBoundaries("hello world", 5)
  expect(result).not.toBe(null)
  // Cursor on space expands backward into the previous word
  expect(result!.start).toBe(0)
  expect(result!.end).toBe(5)
})

test("findWordBoundaries: underscore treated as word char", () => {
  expect(findWordBoundaries("hello_world", 0)).toEqual({ start: 0, end: 11 })
})

test("findWordBoundaries: numbers treated as word chars", () => {
  expect(findWordBoundaries("abc123def", 4)).toEqual({ start: 0, end: 9 })
})

test("findWordBoundaries: non-word chars (punctuation)", () => {
  // On '...' between words, expands through all non-space chars
  const result = findWordBoundaries("a...b", 2)
  expect(result).toEqual({ start: 0, end: 5 })
})

test("findWordBoundaries: empty text", () => {
  expect(findWordBoundaries("", 0)).toBe(null)
})

test("findWordBoundaries: single character", () => {
  expect(findWordBoundaries("a", 0)).toEqual({ start: 0, end: 1 })
})

// ─── findQuotePair ─────────────────────────────────────────────

test("findQuotePair: double quotes", () => {
  const result = findQuotePair('hello "world" test', 9, '"')
  expect(result).toEqual({ start: 6, end: 12 })
})

test("findQuotePair: single quotes", () => {
  const result = findQuotePair("it's 'hello' world", 11, "'")
  expect(result).toEqual({ start: 5, end: 11 })
})

test("findQuotePair: cursor in middle of quoted text", () => {
  const result = findQuotePair('say "hello"', 8, '"')
  expect(result).toEqual({ start: 4, end: 10 })
})

test("findQuotePair: no opening quote", () => {
  const result = findQuotePair('hello"', 0, '"')
  expect(result).toBe(null)
})

test("findQuotePair: no closing quote", () => {
  const result = findQuotePair('"hello', 2, '"')
  expect(result).toBe(null)
})

test("findQuotePair: multiple quote pairs", () => {
  const result = findQuotePair('"a" "b"', 5, '"')
  expect(result).toEqual({ start: 4, end: 6 })
})

// ─── findNumberAtCursor ────────────────────────────────────────

test("findNumberAtCursor: cursor on number", () => {
  const result = findNumberAtCursor("hello 42 world", 6)
  expect(result).toEqual({ start: 6, end: 8, value: 42 })
})

test("findNumberAtCursor: cursor before number", () => {
  const result = findNumberAtCursor("hello 42 world", 0)
  expect(result).toEqual({ start: 6, end: 8, value: 42 })
})

test("findNumberAtCursor: multi-digit number", () => {
  const result = findNumberAtCursor("count: 12345", 7)
  expect(result).toEqual({ start: 7, end: 12, value: 12345 })
})

test("findNumberAtCursor: negative number", () => {
  const result = findNumberAtCursor("temp: -5", 6)
  expect(result).toEqual({ start: 6, end: 8, value: -5 })
})

test("findNumberAtCursor: number with leading zeros", () => {
  const result = findNumberAtCursor("version 007", 10)
  expect(result).toEqual({ start: 8, end: 11, value: 7 })
})

test("findNumberAtCursor: no number in text", () => {
  const result = findNumberAtCursor("hello world", 0)
  expect(result).toBe(null)
})

test("findNumberAtCursor: empty text", () => {
  const result = findNumberAtCursor("", 0)
  expect(result).toBe(null)
})

test("findNumberAtCursor: zero", () => {
  const result = findNumberAtCursor("value: 0", 7)
  expect(result).toEqual({ start: 7, end: 8, value: 0 })
})

test("findNumberAtCursor: number at start of string", () => {
  const result = findNumberAtCursor("42 is the answer", 0)
  expect(result).toEqual({ start: 0, end: 2, value: 42 })
})

test("findNumberAtCursor: negative zero", () => {
  const result = findNumberAtCursor("-0", 1)
  expect(result).toEqual({ start: 0, end: 2, value: -0 })
})

test("findNumberAtCursor: minus between digits is not negative (5-3)", () => {
  // The minus is a subtraction operator, not a negative sign
  const result = findNumberAtCursor("5-3", 2)
  expect(result).toEqual({ start: 2, end: 3, value: 3 })
})

test("findNumberAtCursor: minus after non-digit is negative", () => {
  const result = findNumberAtCursor("x-42", 3)
  expect(result).toEqual({ start: 1, end: 4, value: -42 })
})

// ─── findAllMatches ────────────────────────────────────────────

test("findAllMatches: single match", () => {
  expect(findAllMatches("hello", "hello world")).toEqual([
    { start: 0, end: 5 },
  ])
})

test("findAllMatches: multiple matches", () => {
  expect(findAllMatches("abc", "abc abc abc")).toEqual([
    { start: 0, end: 3 },
    { start: 4, end: 7 },
    { start: 8, end: 11 },
  ])
})

test("findAllMatches: case insensitive", () => {
  expect(findAllMatches("hello", "Hello HELLO hello")).toEqual([
    { start: 0, end: 5 },
    { start: 6, end: 11 },
    { start: 12, end: 17 },
  ])
})

test("findAllMatches: no matches", () => {
  expect(findAllMatches("xyz", "hello world")).toEqual([])
})

test("findAllMatches: empty query", () => {
  expect(findAllMatches("", "hello")).toEqual([])
})

test("findAllMatches: overlapping not included (each char scanned once)", () => {
  // "aaa" with query "aa" would match at 0 and 1 in Vim's behavior,
  // but this implementation uses indexOf which finds the next match
  // after the previous start index + 1, so it finds both.
  const result = findAllMatches("aa", "aaa")
  expect(result).toEqual([
    { start: 0, end: 2 },
    { start: 1, end: 3 },
  ])
})

test("findAllMatches: special regex chars treated as literals", () => {
  // findAllMatches uses indexOf, not regex, so special chars are fine
  expect(findAllMatches("a.b", "a.b and a.b")).toEqual([
    { start: 0, end: 3 },
    { start: 8, end: 11 },
  ])
})

// ─── resolveTextObjectRange ────────────────────────────────────

test("resolveTextObjectRange: iw (word inside)", () => {
  const result = resolveTextObjectRange("hello world", 2, "i", "w")
  expect(result).toEqual({ start: 0, end: 5 })
})

test("resolveTextObjectRange: aw (word including whitespace)", () => {
  const result = resolveTextObjectRange("hello world", 2, "a", "w")
  expect(result).toEqual({ start: 0, end: 6 }) // includes trailing space
})

test("resolveTextObjectRange: aw at end of file (no trailing space)", () => {
  const result = resolveTextObjectRange("hello", 2, "a", "w")
  expect(result).toEqual({ start: 0, end: 5 }) // no space after
})

test("resolveTextObjectRange: i( (inside parentheses)", () => {
  const result = resolveTextObjectRange("foo (bar) baz", 6, "i", "(")
  expect(result).toEqual({ start: 5, end: 8 }) // inside parens, without parens
})

test("resolveTextObjectRange: a( (parentheses including parens)", () => {
  const result = resolveTextObjectRange("foo (bar) baz", 6, "a", "(")
  expect(result).toEqual({ start: 4, end: 9 }) // including parens
})

test("resolveTextObjectRange: i{ (inside curly braces)", () => {
  const result = resolveTextObjectRange("{hello}", 3, "i", "{")
  expect(result).toEqual({ start: 1, end: 6 })
})

test("resolveTextObjectRange: a{ (curly including braces)", () => {
  const result = resolveTextObjectRange("{hello}", 3, "a", "{")
  expect(result).toEqual({ start: 0, end: 7 })
})

test("resolveTextObjectRange: i[ (inside brackets)", () => {
  const result = resolveTextObjectRange("[hello]", 3, "i", "[")
  expect(result).toEqual({ start: 1, end: 6 })
})

test("resolveTextObjectRange: a[ (brackets including brackets)", () => {
  const result = resolveTextObjectRange("[hello]", 3, "a", "[")
  expect(result).toEqual({ start: 0, end: 7 })
})

test("resolveTextObjectRange: i\" (inside double quotes)", () => {
  const result = resolveTextObjectRange('say "hello"', 8, 'i', '"')
  expect(result).toEqual({ start: 5, end: 10 })
})

test("resolveTextObjectRange: a\" (double quotes including quotes)", () => {
  const result = resolveTextObjectRange('say "hello"', 8, 'a', '"')
  expect(result).toEqual({ start: 4, end: 11 })
})

test("resolveTextObjectRange: i' (inside single quotes)", () => {
  const result = resolveTextObjectRange("it's 'hello' world", 11, "i", "'")
  expect(result).toEqual({ start: 6, end: 11 })
})

test("resolveTextObjectRange: no match for unknown key", () => {
  const result = resolveTextObjectRange("hello world", 0, "i", "x")
  expect(result).toBe(null)
})

test("resolveTextObjectRange: no match when no word at cursor", () => {
  const result = resolveTextObjectRange("", 0, "i", "w")
  expect(result).toBe(null)
})

// ─── findPrevParagraphStart ────────────────────────────────────

test("findPrevParagraphStart: from middle of paragraph", () => {
  const lines = ["a", "b", "", "c", "d"]
  expect(findPrevParagraphStart(lines, 4)).toBe(3) // previous paragraph is line 3 ("c")
})

test("findPrevParagraphStart: from blank line between paragraphs", () => {
  const lines = ["a", "b", "", "c", "d"]
  expect(findPrevParagraphStart(lines, 2)).toBe(0) // previous paragraph is line 0 ("a")
})

test("findPrevParagraphStart: at start of file", () => {
  const lines = ["hello", "", "world"]
  expect(findPrevParagraphStart(lines, 0)).toBe(0) // stays at line 0
})

test("findPrevParagraphStart: from first line with leading blanks", () => {
  const lines = ["", "hello", "world"]
  expect(findPrevParagraphStart(lines, 2)).toBe(1) // previous paragraph is line 1
})

test("findPrevParagraphStart: single line", () => {
  const lines = ["hello"]
  expect(findPrevParagraphStart(lines, 0)).toBe(0)
})

test("findPrevParagraphStart: multiple blank lines between paragraphs", () => {
  // Skips all blanks backward, then skips past the previous paragraph up to -1
  const lines = ["a", "", "", "", "b"]
  expect(findPrevParagraphStart(lines, 4)).toBe(0) // wraps back to line 0
})

// ─── findNextParagraphStart ────────────────────────────────────

test("findNextParagraphStart: from middle of paragraph", () => {
  const lines = ["a", "b", "", "c", "d"]
  // Skips content lines to find blank (i=2), then skips blanks to next paragraph (i=3)
  expect(findNextParagraphStart(lines, 0)).toBe(3)
})

test("findNextParagraphStart: from blank line between paragraphs", () => {
  const lines = ["a", "", "b"]
  expect(findNextParagraphStart(lines, 1)).toBe(2) // next paragraph is "b"
})

test("findNextParagraphStart: at end of file", () => {
  const lines = ["hello", "world"]
  expect(findNextParagraphStart(lines, 1)).toBe(1) // stays at last line
})

test("findNextParagraphStart: last line is blank", () => {
  const lines = ["hello", ""]
  // i=1: "" === "" → stop first loop
  // i=1: "" === "" → skip → i=2 → stop
  // return Math.min(2, 1) = 1
  expect(findNextParagraphStart(lines, 0)).toBe(1)
})

test("findNextParagraphStart: multiple blank lines between paragraphs", () => {
  const lines = ["a", "", "", "", "b"]
  expect(findNextParagraphStart(lines, 0)).toBe(4) // next paragraph after blanks is "b" at line 4
})

// ─── findFirstNonBlank ─────────────────────────────────────────

test("findFirstNonBlank: normal line", () => {
  expect(findFirstNonBlank("   hello")).toBe(3)
})

test("findFirstNonBlank: no leading whitespace", () => {
  expect(findFirstNonBlank("hello")).toBe(0)
})

test("findFirstNonBlank: empty line", () => {
  expect(findFirstNonBlank("")).toBe(-1)
})

test("findFirstNonBlank: whitespace only", () => {
  expect(findFirstNonBlank("   ")).toBe(-1)
})

test("findFirstNonBlank: blank line with tab", () => {
  expect(findFirstNonBlank("\t\tcode")).toBe(2)
})

// ─── extractCodeBlocksWithLang ─────────────────────────────────

test("extractCodeBlocksWithLang: single code block", () => {
  const md = "```js\nconsole.log(1)\n```"
  const result = extractCodeBlocksWithLang(md)
  expect(result).toEqual([{ content: "console.log(1)", lang: "js" }])
})

test("extractCodeBlocksWithLang: multiple code blocks", () => {
  const md = "```ts\nconst x = 1\n```\n\n```py\nprint(x)\n```"
  const result = extractCodeBlocksWithLang(md)
  expect(result).toEqual([
    { content: "const x = 1", lang: "ts" },
    { content: "print(x)", lang: "py" },
  ])
})

test("extractCodeBlocksWithLang: no language tag", () => {
  const md = "```\nplain code\n```"
  const result = extractCodeBlocksWithLang(md)
  expect(result).toEqual([{ content: "plain code", lang: "" }])
})

test("extractCodeBlocksWithLang: no code blocks", () => {
  const md = "just plain text"
  expect(extractCodeBlocksWithLang(md)).toEqual([])
})

test("extractCodeBlocksWithLang: unclosed fence returns no block", () => {
  const md = "```js\nunclosed"
  expect(extractCodeBlocksWithLang(md)).toEqual([])
})

test("extractCodeBlocksWithLang: language with info string", () => {
  const md = "```javascript {highlight=1-3}\nconst x = 1\n```"
  const result = extractCodeBlocksWithLang(md)
  expect(result).toEqual([{ content: "const x = 1", lang: "javascript" }])
})

test("extractCodeBlocksWithLang: indented fence still works", () => {
  const md = "  ```python\n  print(42)\n  ```"
  const result = extractCodeBlocksWithLang(md)
  expect(result).toEqual([{ content: "  print(42)", lang: "python" }])
})

test("extractCodeBlocksWithLang: empty content block", () => {
  const md = "```\n```"
  const result = extractCodeBlocksWithLang(md)
  expect(result).toEqual([{ content: "", lang: "" }])
})
