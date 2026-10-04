import Link from "next/link";
import { notFound } from "next/navigation";
import { DocsLayout } from "@/components/DocsLayout";
import { renderMarkdown } from "@/lib/MarkdownRenderer";
import { getSupabase } from "@/lib/supabase";
import { getLocalContent, isDesktopExport, listLocalSlugs } from "@/lib/content/localContent";

// Serve from Supabase with a 60s revalidate so doc edits go live without a deploy.
// (The desktop static export has no server: it renders the in-repo markdown at
// build time via generateStaticParams/getLocalContent below. This segment config
// must stay a literal — Next only statically parses it, and a ternary aborts the
// build with "Invalid segment configuration export detected".)
export const revalidate = 60;

type DocMeta = {
  title: string;
  description: string;
};

async function getDoc(slug: string): Promise<{ content: string; meta: DocMeta } | null> {
  if (isDesktopExport()) {
    const local = await getLocalContent("docs", slug);
    if (!local) return null;
    return {
      content: local.content,
      meta: { title: local.title, description: local.description },
    };
  }
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

// Static export prerenders every slug from the repo's markdown; the web build
// renders on demand with ISR.
export async function generateStaticParams() {
  if (!isDesktopExport()) return [];
  return (await listLocalSlugs("docs")).map((slug) => ({ slug }));
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