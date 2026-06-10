# Markdown Editor 🖊️

A **terminal-based** markdown editor with live preview, vim mode, and syntax highlighting — built with [OpenTUI](https://opentui.com).

## Quick Start

```bash
bun install
bun run index.ts
```

---

## Editor Layout

```
┌─ ✏️ Editor ──────────────────────┬─ 👁️ Preview ───────────────────┐
│                                  │                                  │
│  <textarea> - type markdown      │  Rendered HTML preview           │
│                                  │  with headers, code blocks,      │
│                                  │  lists, blockquotes, etc.        │
│                                  │                                  │
├──────────────────────────────────┴──────────────────────────────────┤
│  NORMAL  file.md  Ln 1, Col 1  Words: 42                    │
└─────────────────────────────────────────────────────────────────────┘
```

**Left pane**: Markdown source editor (supports vim mode)  
**Right pane**: Live rendered preview  
**Bottom bar**: Status bar with vim mode, file info, cursor position  

---

## Vim Mode

The editor includes a built-in vim emulation with three modes:

| Mode | Status Bar | Cursor | Description |
|------|-----------|--------|-------------|
| **INSERT** | ` INSERT ` (green) | `▎` blinking line | Type text normally |
| **NORMAL** | ` NORMAL ` (blue) | `█` block | Navigate & edit via keystrokes |
| **VISUAL** | ` VISUAL ` (purple) | `█` selected | Select text for operations |

- **Default mode**: INSERT (start typing immediately)
- **`Esc`** → switch to NORMAL
- **`i`** → switch to INSERT
- **`Ctrl+Z`** → toggle vim mode on/off globally

### NORMAL Mode — Navigation

| Key | Move |
|-----|------|
| `h` `j` `k` `l` | Left / Down / Up / Right |
| `w` `b` `e` | Word forward / Word backward / Word end |
| `0` `$` `^` | Line start / Line end / First non-whitespace |
| `gg` `G` | File start / File end |
| `5gg` | Go to line 5 (count + gg) |
| `5j` | Move down 5 lines (count + movement) |
| `Ctrl+f` `Ctrl+b` | Page down / Page up |
| `Ctrl+d` `Ctrl+u` | Half page down / Half page up |
| `{` `}` | Paragraph backward / forward |
| `%` | Jump to matching bracket `(){}[]` |
| `H` `M` `L` | Screen top / Screen middle / Screen bottom |

### NORMAL Mode — Editing

| Key | Action |
|-----|--------|
| `i` `a` | Insert before / after cursor |
| `I` `A` | Insert at line start / line end |
| `o` `O` | New line below / above |
| `x` | Delete character (supports count: `5x`) |
| `X` | Delete character before cursor (`dh`) |
| `s` | Delete character and enter insert (`cl`) |
| `S` | Delete line and enter insert (`cc`) |
| `D` | Delete to end of line (`d$`) |
| `C` | Delete to end of line and enter insert (`c$`) |
| `r` | Replace character under cursor (`5ra` → replace 5 chars with `a`) |
| `dd` | Delete line (supports count: `3dd`) |
| `yy` | Yank (copy) line |
| `p` `P` | Paste after / before cursor |
| `J` | Join next line into current |
| `u` | Undo |
| `Ctrl+r` | Redo |
| `q` | Quit (warning if unsaved) |
| `.` | Repeat last edit operation |
| `>>` `<<` | Indent / Deindent line |
| `Ctrl+a` | Increment number at cursor by count |
| `Ctrl+x` | Decrement number at cursor by count |

### NORMAL Mode — Operators + Motions

After pressing an operator (`d`, `y`, `c`, `>`, `<`), the editor waits for a **motion** to define the range:

| Operator | + Motion | Result |
|----------|---------|--------|
| `d` | `w` → `dw` | Delete word forward |
| `c` | `$` → `c$` | Change to end of line (enters insert) |
| `y` | `0` → `y0` | Yank from cursor to line start |
| `d` | `d` → `dd` | Delete current line |
| `>` | `>` → `>>` | Indent current line |
| `<` | `<` → `<<` | Deindent current line |

### Text Objects

Text objects work with operators `d`/`y`/`c` to operate on structural text units:

| Text Object | Example | Result |
|-------------|---------|--------|
| `iw` / `aw` | `diw` | Delete inner word |
| | `ciw` | Change word (enters insert) |
| | `yaw` | Yank a word + trailing space |
| `i(` / `a(` | `di(` | Delete inside parentheses |
| | `ca(` | Change including parentheses |
| `i{` / `a{` | `ci{` | Change inside curly braces |
| `i[` / `a[` | `da[` | Delete including brackets |
| `i"` / `a"` | `ci"` | Change inside double quotes |
| `i'` / `a'` | `da'` | Delete including single quotes |

### Named Registers `"a`-`"z`

Prefix any yank/delete/paste with `"<register>` to use named registers:

| Command | Action |
|---------|--------|
| `"ayw` | Yank word into register `a` |
| `"add` | Delete line into register `d` |
| `"ap` | Paste from register `a` |
| `"adiw` | Delete inner word into register `a` |
| `"+` / `"*` | System clipboard (wired for future use) |

### Word Search (`*` / `#`)

| Key | Action |
|-----|--------|
| `*` | Search forward for word under cursor (highlights all matches) |
| `#` | Search backward for word under cursor |
| `n` / `N` | Navigate next / previous match (also works after `*` or `#`) |

### VISUAL Mode

Press `v` in NORMAL mode to enter VISUAL mode and select text:

| Key | Action |
|-----|--------|
| `h` `j` `k` `l` | Extend selection |
| `w` `b` `e` `$` `0` `G` | Extend selection to word/line/buffer |
| `d` `x` | Delete selection (yanked to default register) |
| `y` | Yank selection |
| `c` | Delete selection and enter INSERT |
| `>` | Indent selected lines |
| `<` | Deindent selected lines |
| `Esc` | Cancel selection |

### `/` Search

Press `/` in NORMAL mode to search:

| Key | Action |
|-----|--------|
| Type characters | Live highlighting of all matches |
| `Enter` | Jump to first match, `n` / `N` to navigate |
| `n` | Next match |
| `N` | Previous match |
| `Esc` | Cancel search, clear highlights |

- Matches are **case-insensitive**
- Also works after `*` / `#` word search
- All matches highlighted with a yellow background in the editor

### `:` Command Mode

Press `:` in NORMAL mode to enter command mode.

| Command | Action |
|---------|--------|
| `:w` `:write` | Save file |
| `:q` / `q` | Quit (shows warning if unsaved) |
| `:q!` | Force quit (discard changes) |
| `:wq` | Save and quit |
| `:wq!` | Force save and quit |
| `:help` `:h` | Show keyboard shortcuts help |

### `:s` Substitute

Search and replace via command line — similar to vim's `:s`:

| Command | Action |
|---------|--------|
| `:s/old/new/` | Replace first occurrence |
| `:%s/old/new/g` | Replace all occurrences (file-wide) |
| `:s/old/new/gi` | Case-insensitive replace all |
| `:S/old/new/g` | Uppercase S = same as `%s` |

**Flags:**
- `g` — replace all occurrences (not just first)
- `i` — case insensitive
- **Supports `:s/old/new/g`** and **`:%s/old/new/g`** (both work file-wide)

**Escape sequences in replacement:**
- `\/` → literal `/`
- `\n` → newline
- `\&` → entire matched text

Example:
```
:%s/foo/bar/gi     → Replace all "foo" (case-insensitive) with "bar"
:s/node/Node/g     → Replace all "node" with "Node"
:s/https:\/\/http/ → Replace "https://" with "http"
```

### `.` Repeat

Press `.` in NORMAL mode to repeat the last edit operation.

Supports repeating: `dd`, `cc`, `>>`, `<<`, `x`, `X`, `r`, `p`, `P`, `dw`, `cw`, text object operations, `Ctrl+a`/`Ctrl+x`, and more.

---

## Global Shortcuts

These shortcuts work regardless of vim mode:

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` | Save file |
| `Ctrl+O` | Open file |
| `Ctrl+F` | Find / Replace |
| `Ctrl+K` | Copy active code block to clipboard |
| `Ctrl+Shift+K` | Copy ALL code blocks |
| `Ctrl+E` | Export code blocks to separate files |
| `Ctrl+Shift+E` | Export all code blocks as one file |
| `Alt+W` | Toggle code block wrap mode |
| `Ctrl+Z` | Toggle vim mode on/off |
| `Esc` | Exit application (when not in vim insert mode) |

### Find/Replace (`Ctrl+F`)

- **Tab** — switch between query and replacement field
- **Enter** — next match; **Shift+Enter** — previous match
- **Ctrl+R** — toggle find/replace mode
- **Enter** (in replace mode) — replace current match
- **Shift+Enter** (in replace mode) — replace all matches

### File Operations

- **`Ctrl+S`**: Save to current path (or prompts for path)
- **`Ctrl+O`**: Open a markdown file
- **File dialog**: Type path and press Enter, Esc to cancel

### Code Block Export

- **`Ctrl+K`**: Copy the code block currently under the cursor
- **`Ctrl+Shift+K`**: Copy ALL fenced code blocks in the document
- **`Ctrl+E`**: Export each code block to a separate file in a directory
- **`Ctrl+Shift+E`**: Export all code blocks to a single concatenated file

---

## Configuration

### Vim Toggle (`Ctrl+Z`)

- Default: **ON** (vim mode enabled, starts in INSERT)
- Toggle off: editor behaves as a normal textarea, `Esc` exits the app
- Status bar shows ` OFF ` (gray) when disabled

---

## Technical Stack

- **Runtime**: [Bun](https://bun.sh)
- **UI Framework**: [OpenTUI](https://opentui.com) — React-style terminal UI
- **Markdown Rendering**: Marked parser + custom terminal renderer
- **Syntax Highlighting**: Tree-sitter
- **Clipboard**: OSC 52 escape sequences

---

## Development

```bash
bun run index.ts    # Start the editor
bun run tsc         # TypeScript type check
```

## File Structure

```
src/
├── index.tsx                         # Entry point
├── App.tsx                           # Main component (orchestrates hooks + JSX)
├── vim-helpers.ts                    # Pure vim helper functions
├── vim-helpers.test.ts               # Unit tests (88 tests)
├── MarkdownPreview.tsx               # Markdown renderer
├── components/
│   ├── HelpOverlay.tsx               # Keyboard shortcuts overlay
│   ├── FindReplaceBar.tsx            # Find/replace UI
│   ├── FileDialog.tsx                # Save/open dialog
│   ├── StatusBar.tsx                 # Bottom status bar
│   └── VimCmdBar.tsx                 # Vim : command and / search input
└── hooks/
    ├── useFileOperations.ts          # File save/load/export state
    ├── useVimState.ts                # Vim refs, state, textarea input control
    ├── useVimKeyHandlers.ts          # Vim normal/visual/cmd key handlers
    ├── useKeyboardHandlers.ts        # Global keyboard routing & dispatch
    ├── useClipboard.ts               # Copy-to-clipboard functions
    ├── useExport.ts                  # Code block export logic
    └── useAppUI.ts                   # UI callbacks (image status, cancel dialog)

index.ts                              # Server entry point (Bun.serve)
```

### Architecture

```
App.tsx  (orchestrator — ~120 lines + JSX)
├── hooks/useFileOperations.ts      — file I/O, dialog state
├── hooks/useVimState.ts            — vim refs, mode, registers, search state
├── hooks/useVimKeyHandlers.ts      — d/y/c, motions, text objects, register ops
├── hooks/useKeyboardHandlers.ts    — find/replace bar, dialog, global shortcuts
├── hooks/useClipboard.ts           — copyToClipboard, copyActiveCodeBlock
├── hooks/useExport.ts              — handleExportSubmit, handleExportSingleSubmit
├── hooks/useAppUI.ts               — handleImageStatus, handleCancelDialog
└── vim-helpers.ts                  — pure functions (88 unit tests)
```

**Key design principle:** Each hook manages a single concern. `App.tsx` only calls hooks, wires up JSX, and does layout math — no inline business logic. Pure vim helpers are tested independently in `vim-helpers.test.ts`.
