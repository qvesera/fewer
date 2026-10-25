import Link from "next/link";
import { notFound } from "next/navigation";
import { DocsLayout } from "@/components/DocsLayout";
import { renderMarkdown } from "@/lib/MarkdownRenderer";
import { getSupabase } from "@/lib/supabase";

// Serve from Supabase with a 60s revalidate so doc edits go live without a deploy.
export const revalidate = 60;

type DocMeta = {
  title: string;
  description: string;
};

async function getDoc(slug: string): Promise<{ content: string; meta: DocMeta } | null> {
  try {
    const { data, error } = await getSupabase()
      .from("content_pages")
      .select("title,description,content")
      .eq("type", "docs")
      .eq("slug", slug)
      .eq("published", true);
    if (error || !data || data.length === 0) return null;
    const d = data[0];
    return {
      content: d.content,
      meta: {
        title: d.title,
        description: d.description ?? "",
      },
    };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = await getDoc(slug);
  if (!doc) return { title: "Not Found" };
  return {
    title: `${doc.meta.title} | Docs | Fewer`,
    description: doc.meta.description,
  };
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = await getDoc(slug);
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