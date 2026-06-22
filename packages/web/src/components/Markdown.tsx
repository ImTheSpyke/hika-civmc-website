import { useMemo } from "react";

/**
 * Tiny, dependency-free Markdown renderer for user content.
 *
 * Supported: headings (#..######), bold, italic, inline `code`, fenced ``` code
 * blocks, blockquotes, unordered/ordered lists, horizontal rules, paragraphs and
 * line breaks. Intentionally NOT supported: links and images — link/image syntax
 * is rendered as plain text so no URLs or remote images are ever emitted.
 *
 * Everything is built from React elements (never dangerouslySetInnerHTML), so the
 * input is inert by construction — no HTML in the source string is interpreted.
 */
export function Markdown({ children, className }: { children: string; className?: string }) {
  const blocks = useMemo(() => parseBlocks(children ?? ""), [children]);
  return <div className={`markdown ${className ?? ""}`.trim()}>{blocks}</div>;
}

type Node = React.ReactNode;

function parseBlocks(src: string): Node[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: Node[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line — skip.
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Fenced code block.
    const fence = line.match(/^\s*```/);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      i++; // consume closing fence (if present)
      out.push(<pre key={key++}><code>{body.join("\n")}</code></pre>);
      continue;
    }

    // Horizontal rule.
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      out.push(<hr key={key++} />);
      i++;
      continue;
    }

    // Heading.
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const Tag = `h${level}` as keyof React.JSX.IntrinsicElements;
      out.push(<Tag key={key++}>{parseInline(heading[2])}</Tag>);
      i++;
      continue;
    }

    // Blockquote (consecutive `>` lines).
    if (/^\s*>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      out.push(<blockquote key={key++}>{parseBlocks(quote.join("\n"))}</blockquote>);
      continue;
    }

    // Unordered list.
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ""));
        i++;
      }
      out.push(
        <ul key={key++}>
          {items.map((it, idx) => <li key={idx}>{parseInline(it)}</li>)}
        </ul>
      );
      continue;
    }

    // Ordered list.
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      out.push(
        <ol key={key++}>
          {items.map((it, idx) => <li key={idx}>{parseInline(it)}</li>)}
        </ol>
      );
      continue;
    }

    // Paragraph — gather until a blank line or a block starter.
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^\s*```/.test(lines[i]) &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^\s*([-*_])(\s*\1){2,}\s*$/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    out.push(<p key={key++}>{parseInlineWithBreaks(para.join("\n"))}</p>);
  }

  return out;
}

function parseInlineWithBreaks(text: string): Node[] {
  const parts = text.split("\n");
  const out: Node[] = [];
  parts.forEach((part, idx) => {
    if (idx > 0) out.push(<br key={`br-${idx}`} />);
    out.push(...parseInline(part, idx));
  });
  return out;
}

// Inline parsing: code spans first (so their contents aren't further formatted),
// then bold/italic. Link/image markup is deliberately left as literal text.
function parseInline(text: string, salt = 0): Node[] {
  const out: Node[] = [];
  let rest = text;
  let key = 0;
  const k = () => `${salt}-${key++}`;

  // Neutralize image/link syntax by stripping the markup punctuation but keeping
  // the visible label as plain text, so no URL is ever surfaced.
  rest = rest
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // image -> alt text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");  // link  -> link text

  const tokenRe = /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*]+\*)|(_[^_]+_)/;
  while (rest.length) {
    const m = rest.match(tokenRe);
    if (!m || m.index === undefined) {
      out.push(rest);
      break;
    }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    const tok = m[0];
    if (tok.startsWith("`")) {
      out.push(<code key={k()}>{tok.slice(1, -1)}</code>);
    } else if (tok.startsWith("**") || tok.startsWith("__")) {
      out.push(<strong key={k()}>{parseInline(tok.slice(2, -2), key)}</strong>);
    } else {
      out.push(<em key={k()}>{parseInline(tok.slice(1, -1), key)}</em>);
    }
    rest = rest.slice(m.index + tok.length);
  }
  return out;
}
