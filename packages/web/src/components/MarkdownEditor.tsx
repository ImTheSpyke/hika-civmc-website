import { useEffect, useRef, useState } from "react";
import { Markdown } from "./Markdown.js";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  maxLength?: number;
  minHeight?: number;
  statusLeft?: React.ReactNode;
  statusRight?: React.ReactNode;
}

/**
 * Single-pane editor: shows rendered markdown when idle; swaps to a plain
 * textarea on click/focus; swaps back to render on blur (with autosave).
 * No side-by-side split — one clean surface.
 */
export function MarkdownEditor({
  value,
  onChange,
  onBlur,
  placeholder,
  maxLength,
  minHeight = 300,
  statusLeft,
  statusRight,
}: Props) {
  const [editing, setEditing] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const caretPosRef = useRef<number | null>(null);

  // When entering edit mode: focus and place caret at the saved position.
  useEffect(() => {
    if (!editing) return;
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.max(ta.scrollHeight, minHeight)}px`;
    ta.focus();
    if (caretPosRef.current !== null) {
      ta.setSelectionRange(caretPosRef.current, caretPosRef.current);
      caretPosRef.current = null;
    }
  }, [editing, minHeight]);

  // Grow textarea as user types.
  useEffect(() => {
    if (!editing) return;
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.max(ta.scrollHeight, minHeight)}px`;
  }, [value, editing, minHeight]);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    if (maxLength !== undefined && v.length > maxLength) return;
    onChange(v);
  }

  function handleBlur() {
    setEditing(false);
    onBlur?.();
  }

  function handleRenderClick(e: React.MouseEvent<HTMLDivElement>) {
    // Best-effort: use caretPositionFromPoint / caretRangeFromPoint to find
    // where in the rendered text the click landed, then walk the DOM to get
    // a cumulative text offset. Map that rendered-text offset to the raw
    // markdown by finding the same visible text in the source string.
    const pos = resolveCaretOffset(e.clientX, e.clientY, value);
    caretPosRef.current = pos;
    setEditing(true);
  }

  return (
    <div className="md-editor-wrap">
      {editing ? (
        <textarea
          ref={taRef}
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          className="md-editor-textarea"
          style={{ minHeight }}
          spellCheck
        />
      ) : (
        <div
          className="md-editor-render markdown"
          style={{ minHeight }}
          onClick={handleRenderClick}
          role="textbox"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { caretPosRef.current = value.length; setEditing(true); } }}
          aria-label={placeholder}
        >
          {value.trim()
            ? <Markdown>{value}</Markdown>
            : <span className="md-editor-placeholder">{placeholder}</span>}
        </div>
      )}

      {(statusLeft !== undefined || statusRight !== undefined) && (
        <div className="md-editor-footer">
          <span>{statusLeft}</span>
          <span>{statusRight}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Given a click point, find the character offset in the rendered DOM text,
 * then map it back to an offset in the raw markdown source.
 *
 * The rendered text has markdown syntax stripped (e.g. "**bold**" → "bold"),
 * so we can't do a direct index lookup. Strategy: collect all visible text
 * nodes in DOM order to build a rendered string + per-char rendered offsets.
 * Then walk the raw source and match visible characters one-by-one to find
 * the corresponding raw index.
 */
function resolveCaretOffset(x: number, y: number, raw: string): number {
  // 1. Find caret position in the rendered DOM.
  let renderedOffset = 0;
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };

  let node: Node | null = null;
  let nodeOffset = 0;

  if (doc.caretPositionFromPoint) {
    const pos = doc.caretPositionFromPoint(x, y);
    if (pos) { node = pos.offsetNode; nodeOffset = pos.offset; }
  } else if (doc.caretRangeFromPoint) {
    const range = doc.caretRangeFromPoint(x, y);
    if (range) { node = range.startContainer; nodeOffset = range.startOffset; }
  }

  if (node) {
    // Walk all text nodes in document order within the render div,
    // accumulating length until we reach our target node+offset.
    const root = document.querySelector(".md-editor-render");
    if (root) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let found = false;
      let cur: Node | null;
      while ((cur = walker.nextNode())) {
        if (cur === node) {
          renderedOffset += nodeOffset;
          found = true;
          break;
        }
        renderedOffset += (cur.textContent ?? "").length;
      }
      if (!found) renderedOffset = Infinity; // clicked past all text → end
    }
  }

  // 2. Map rendered text offset → raw source offset.
  return mapRenderedToRaw(raw, renderedOffset);
}

/**
 * Walk the raw markdown string and count only the "visible" characters
 * (stripping inline syntax markers: **, __, *, _, `, # prefixes, > prefixes,
 * list markers, image/link markup). When the visible count reaches
 * `renderedOffset`, return the current raw index.
 *
 * This handles the most common cases well enough for caret placement.
 * It doesn't need to be perfect — being off by a few chars in a heading
 * prefix is acceptable.
 */
function mapRenderedToRaw(raw: string, renderedOffset: number): number {
  if (renderedOffset <= 0) return 0;

  let visible = 0;
  let i = 0;

  while (i < raw.length) {
    if (visible >= renderedOffset) return i;

    const rest = raw.slice(i);

    // Fenced code block — content is visible as-is.
    if (rest.startsWith("```")) {
      const close = raw.indexOf("```", i + 3);
      const blockEnd = close === -1 ? raw.length : close + 3;
      const content = raw.slice(i + 3, close === -1 ? raw.length : close);
      const contentVisible = content.length; // code content shown verbatim
      if (visible + contentVisible >= renderedOffset) {
        return i + 3 + (renderedOffset - visible);
      }
      visible += contentVisible;
      i = blockEnd;
      continue;
    }

    // Heading prefix `# ` … `###### ` — skip hashes and space.
    const headingMatch = rest.match(/^(#{1,6}) /);
    if (headingMatch) {
      i += headingMatch[0].length;
      continue;
    }

    // Blockquote prefix `> `.
    const bqMatch = rest.match(/^> ?/);
    if (bqMatch && (i === 0 || raw[i - 1] === "\n")) {
      i += bqMatch[0].length;
      continue;
    }

    // Unordered list marker `- `, `* `, `+ `.
    const ulMatch = rest.match(/^[-*+] /);
    if (ulMatch && (i === 0 || raw[i - 1] === "\n")) {
      i += ulMatch[0].length;
      continue;
    }

    // Ordered list marker `1. `.
    const olMatch = rest.match(/^\d+\. /);
    if (olMatch && (i === 0 || raw[i - 1] === "\n")) {
      i += olMatch[0].length;
      continue;
    }

    // Image `![alt](url)` → skip markup, count alt.
    const imgMatch = rest.match(/^!\[([^\]]*)\]\([^)]*\)/);
    if (imgMatch) {
      const alt = imgMatch[1];
      if (visible + alt.length >= renderedOffset) {
        return i + 2 + (renderedOffset - visible); // land inside alt text
      }
      visible += alt.length;
      i += imgMatch[0].length;
      continue;
    }

    // Link `[text](url)` → skip markup, count text.
    const linkMatch = rest.match(/^\[([^\]]+)\]\([^)]*\)/);
    if (linkMatch) {
      const text = linkMatch[1];
      if (visible + text.length >= renderedOffset) {
        return i + 1 + (renderedOffset - visible);
      }
      visible += text.length;
      i += linkMatch[0].length;
      continue;
    }

    // Inline code `code` — skip backticks, count content.
    const codeMatch = rest.match(/^`([^`]+)`/);
    if (codeMatch) {
      const content = codeMatch[1];
      if (visible + content.length >= renderedOffset) {
        return i + 1 + (renderedOffset - visible);
      }
      visible += content.length;
      i += codeMatch[0].length;
      continue;
    }

    // Bold `**text**` or `__text__`.
    const boldMatch = rest.match(/^(\*\*|__)([^*_]+)\1/);
    if (boldMatch) {
      const content = boldMatch[2];
      if (visible + content.length >= renderedOffset) {
        return i + 2 + (renderedOffset - visible);
      }
      visible += content.length;
      i += boldMatch[0].length;
      continue;
    }

    // Italic `*text*` or `_text_`.
    const italicMatch = rest.match(/^([*_])([^*_]+)\1/);
    if (italicMatch) {
      const content = italicMatch[2];
      if (visible + content.length >= renderedOffset) {
        return i + 1 + (renderedOffset - visible);
      }
      visible += content.length;
      i += italicMatch[0].length;
      continue;
    }

    // Newline — counts as a visible character (line break in rendered output).
    if (raw[i] === "\n") {
      visible += 1;
      i += 1;
      continue;
    }

    // Ordinary character.
    visible += 1;
    i += 1;
  }

  return raw.length;
}
