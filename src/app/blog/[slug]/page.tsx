import Link from "next/link";
import { notFound } from "next/navigation";
import { DocsLayout } from "@/components/DocsLayout";
import { renderMarkdown } from "@/lib/MarkdownRenderer";
import { getSupabase } from "@/lib/supabase";
import { getLocalContent, isDesktopExport, listLocalSlugs } from "@/lib/content/localContent";

// Serve from Supabase with a 60s revalidate so edits go live without a deploy.
// (The desktop static export has no server: it renders the in-repo markdown at
// build time via generateStaticParams/getLocalContent below. This segment config
// must stay a literal — Next only statically parses it, and a ternary aborts the
// build with "Invalid segment configuration export detected".)
export const revalidate = 60;

type PostMeta = {
  title: string;
  date: string;
  description: string;
  author: string;
  tags: string;
};

async function getPost(slug: string): Promise<{ content: string; meta: PostMeta } | null> {
  if (isDesktopExport()) {
    const local = await getLocalContent("blog", slug);
    if (!local) return null;
    return {
      content: local.content,
      meta: {
        title: local.title,
        date: local.date,
        description: local.description,
        author: local.author,
        tags: local.tags,
      },
    };
  }
  try {
    const { data, error } = await getSupabase()
      .from("content_pages")
      .select("title,date,description,author,tags,content")
      .eq("type", "blog")
      .eq("slug", slug)
      .eq("published", true);
    if (error || !data || data.length === 0) return null;
    const p = data[0];
    return {
      content: p.content,
      meta: {
        title: p.title,
        date: p.date ?? "",
        description: p.description ?? "",
        author: p.author ?? "",
        tags: p.tags ?? "",
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
  return (await listLocalSlugs("blog")).map((slug) => ({ slug }));
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return { title: "Not Found" };
  return {
    title: `${post.meta.title} | Blog | Fewer`,
    description: post.meta.description,
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  return (
    <DocsLayout type="blog" title={post.meta.title} backHref="/blog" backLabel="Blog">
      <article>
        <h1 className="text-4xl font-bold tracking-tight text-foreground">
          {post.meta.title}
        </h1>
        <div className="mt-4 flex items-center gap-3 text-sm text-muted-foreground">
          {post.meta.date && (
            <time dateTime={post.meta.date}>{formatDate(post.meta.date)}</time>
          )}
          {post.meta.author && <span>· {post.meta.author}</span>}
        </div>

        {post.meta.description && (
          <p className="mt-4 text-lg text-muted-foreground italic">
            {post.meta.description}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {post.meta.tags.split(",").map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground"
            >
              {tag.trim()}
            </span>
          ))}
        </div>

        <div className="prose prose-slate dark:prose-invert mt-10">
          {renderMarkdown(post.content)}
        </div>
      </article>
    </DocsLayout>
  );
}
