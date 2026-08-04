import fs from "fs";
import path from "path";
import Link from "next/link";
import { notFound } from "next/navigation";

type DocMeta = {
  title: string;
  description: string;
};

function getDoc(slug: string): { content: string; meta: DocMeta } | null {
  const filePath = path.join(process.cwd(), "content", "docs", `${slug}.md`);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf8");
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const frontmatter = match
    ? Object.fromEntries(
        match[1].split("\n").map((line) => {
          const [key, ...rest] = line.split(":");
          return [key.trim(), rest.join(":").trim()];
        })
      )
    : {};
  return {
    content: match ? match[2] : raw,
    meta: {
      title: (frontmatter["title"] as string) || slug,
      description: (frontmatter["description"] as string) || "",
    },
  };
}

function renderMarkdown(content: string) {
  return content.split("\n\n").map((para, idx) => {
    if (para.startsWith("# ")) {
      return <h1 key={idx} className="text-3xl font-bold mt-8 mb-4">{para.slice(2)}</h1>;
    }
    if (para.startsWith("## ")) {
      return <h2 key={idx} className="text-2xl font-semibold mt-8 mb-3">{para.slice(3)}</h2>;
    }
    if (para.startsWith("### ")) {
      return <h3 key={idx} className="text-xl font-semibold mt-6 mb-2">{para.slice(4)}</h3>;
    }
    if (para.startsWith("- ")) {
      const items = para.split("\n").filter((l) => l.startsWith("- "));
      return (
        <ul key={idx} className="list-disc pl-6 space-y-1 my-4">
          {items.map((item, i) => <li key={i}>{item.slice(2)}</li>)}
        </ul>
      );
    }
    if (para.startsWith("```")) {
      const code = para.split("\n").slice(1, -1).join("\n");
      return (
        <pre key={idx} className="bg-muted rounded-md p-4 overflow-x-auto text-sm">
          <code>{code}</code>
        </pre>
      );
    }
    if (para.includes("|") && para.split("\n").every((l) => l.includes("|"))) {
      const rows = para.split("\n").filter((l) => l.trim().startsWith("|"));
      return (
        <div key={idx} className="overflow-x-auto my-4">
          <table className="min-w-full text-sm border border-border">
            <tbody>
              {rows.map((row, rIdx) => (
                <tr key={rIdx} className={rIdx === 0 ? "bg-muted font-semibold" : ""}>
                  {row.split("|").filter((cell, cIdx, arr) => cIdx !== 0 && cIdx !== arr.length - 1).map((cell, cIdx) => (
                    <td key={cIdx} className="border border-border px-3 py-2">{cell.trim()}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    return <p key={idx} className="my-4 text-foreground/90">{para}</p>;
  });
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = getDoc(slug);
  if (!doc) notFound();

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Link href="/docs" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to Docs
        </Link>

        <article className="mt-8">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            {doc.meta.title}
          </h1>
          {doc.meta.description && (
            <p className="mt-4 text-lg text-muted-foreground">{doc.meta.description}</p>
          )}

          <div className="mt-10">{renderMarkdown(doc.content)}</div>
        </article>
      </div>
    </div>
  );
}