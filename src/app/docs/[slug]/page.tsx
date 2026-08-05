import fs from "fs";
import path from "path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DocsLayout } from "@/components/DocsLayout";
import { renderMarkdown } from "@/lib/MarkdownRenderer";

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
        }),
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

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = getDoc(slug);
  if (!doc) return { title: "Not Found" };
  return {
    title: `${doc.meta.title} — Docs — Fewer`,
    description: doc.meta.description,
  };
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = getDoc(slug);
  if (!doc) notFound();

  return (
    <DocsLayout type="docs" title={doc.meta.title} backHref="/docs" backLabel="Docs">
      <article>
        <h1 className="text-4xl font-bold tracking-tight text-foreground">
          {doc.meta.title}
        </h1>
        {doc.meta.description && (
          <p className="mt-4 text-lg text-muted-foreground">{doc.meta.description}</p>
        )}

        <div className="mt-10">{renderMarkdown(doc.content)}</div>
      </article>
    </DocsLayout>
  );
}