import Link from "next/link";
import { notFound } from "next/navigation";
import { DocsLayout } from "@/components/DocsLayout";
import { renderMarkdown } from "@/lib/MarkdownRenderer";
import { getSupabase } from "@/lib/supabase";

// Serve from Supabase with a 60s revalidate so edits go live without a deploy.
export const revalidate = 60;

type PostMeta = {
  title: string;
  date: string;
  description: string;
  author: string;
  tags: string;
};

async function getPost(slug: string): Promise<{ content: string; meta: PostMeta } | null> {
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
