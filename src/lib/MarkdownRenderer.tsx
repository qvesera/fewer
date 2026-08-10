import Link from "next/link";

export function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const codeMatch = remaining.match(/`([^`]+)`/);
    const boldMatch = remaining.match(/\*\*([^*]+)\*\*/);
    const italicMatch = remaining.match(/\*([^*]+)\*/);
    const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/);

    const matches = [
      { match: codeMatch, index: codeMatch ? codeMatch.index! : Infinity, type: "code" },
      { match: boldMatch, index: boldMatch ? boldMatch.index! : Infinity, type: "bold" },
      { match: italicMatch, index: italicMatch ? italicMatch.index! : Infinity, type: "italic" },
      { match: linkMatch, index: linkMatch ? linkMatch.index! : Infinity, type: "link" },
    ].sort((a, b) => a.index - b.index);

    const first = matches[0];
    if (!first || first.index === Infinity) {
      parts.push(<span key={key++}>{remaining}</span>);
      break;
    }

    if (first.index > 0) {
      parts.push(<span key={key++}>{remaining.slice(0, first.index)}</span>);
    }

    const m = first.match!;
    const after = remaining.slice(first.index + m[0].length);

    if (first.type === "code") {
      parts.push(
        <code key={key++} className="bg-muted rounded px-1.5 py-0.5 text-sm font-mono">
          {m[1]}
        </code>,
      );
    } else if (first.type === "bold") {
      parts.push(
        <strong key={key++} className="font-semibold">
          {m[1]}
        </strong>,
      );
    } else if (first.type === "italic") {
      parts.push(<em key={key++}>{m[1]}</em>);
    } else if (first.type === "link") {
      const href = m[2];
      const linkContent = m[1];
      if (href.startsWith("http") || href.startsWith("/")) {
        if (href.startsWith("/")) {
          parts.push(
            <Link key={key++} href={href} className="text-primary underline">
              {linkContent}
            </Link>,
          );
        } else {
          parts.push(
            <a key={key++} href={href} className="text-primary underline" target="_blank" rel="noopener noreferrer">
              {linkContent}
            </a>,
          );
        }
      } else {
        parts.push(
          <a key={key++} href={href} className="text-primary underline" target="_blank" rel="noopener noreferrer">
            {linkContent}
          </a>,
        );
      }
    }

    remaining = after;
  }

  return parts;
}

function isTable(block: string): boolean {
  const lines = block.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return false;
  return lines.every((l) => l.trim().startsWith("|"));
}

export function renderMarkdown(content: string): React.ReactNode {
  const normalized = content.replace(/\r\n/g, "\n");
  const blocks = normalized.split("\n\n");
  const result: React.ReactNode[] = [];
  let i = 0;

  while (i < blocks.length) {
    const block = blocks[i];

    if (block.startsWith("# ")) {
      result.push(<h1 key={i} className="text-3xl font-bold mt-8 mb-4">{renderInline(block.slice(2))}</h1>);
      i++;
    } else if (block.startsWith("## ")) {
      result.push(<h2 key={i} className="text-2xl font-semibold mt-8 mb-3">{renderInline(block.slice(3))}</h2>);
      i++;
    } else if (block.startsWith("### ")) {
      result.push(<h3 key={i} className="text-xl font-semibold mt-6 mb-2">{renderInline(block.slice(4))}</h3>);
      i++;
    } else if (block.startsWith("- ")) {
      const items = block.split("\n").filter((l) => l.startsWith("- "));
      result.push(
        <ul key={i} className="list-disc pl-6 space-y-1 my-4">
          {items.map((item, j) => <li key={j}>{renderInline(item.slice(2))}</li>)}
        </ul>,
      );
      i++;
    } else if (/^\d+\.\s/.test(block)) {
      const items = block.split("\n").filter((l) => /^\d+\.\s/.test(l));
      result.push(
        <ol key={i} className="list-decimal pl-6 space-y-1 my-4">
          {items.map((item, j) => <li key={j}>{renderInline(item.replace(/^\d+\.\s/, ""))}</li>)}
        </ol>,
      );
      i++;
    } else if (block.startsWith("```")) {
      const code = block.split("\n").slice(1, -1).join("\n");
      result.push(
        <pre key={i} className="bg-muted rounded-md p-4 overflow-x-auto text-sm">
          <code>{code}</code>
        </pre>,
      );
      i++;
    } else if (isTable(block)) {
      const rows = block.split("\n").filter((l) => l.trim().startsWith("|"));
      const dataRows = rows.filter((l) => !/^\|\s*[-: ]+\s*\|/.test(l));
      result.push(
        <div key={i} className="overflow-x-auto my-4">
          <table className="min-w-full text-sm border border-border">
            <tbody>
              {dataRows.map((row, rIdx) => (
                <tr key={rIdx} className={rIdx === 0 ? "bg-muted font-semibold" : ""}>
                  {row.split("|").filter((cell, cIdx, arr) => cIdx !== 0 && cIdx !== arr.length - 1).map((cell, cIdx) => (
                    <td key={cIdx} className="border border-border px-3 py-2">{renderInline(cell.trim())}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      i++;
    } else if (block.startsWith(">")) {
      const quote = block
        .split("\n")
        .filter((l) => l.trim().length > 0)
        .map((l) => l.replace(/^>\s?/, ""))
        .join(" ");
      result.push(
        <blockquote key={i} className="my-4 border-l-4 border-border pl-4 italic text-muted-foreground">
          {renderInline(quote)}
        </blockquote>,
      );
      i++;
    } else {
      result.push(<p key={i} className="my-4 text-foreground/90">{renderInline(block)}</p>);
      i++;
    }
  }

  return result;
}