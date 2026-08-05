import fs from "fs";
import path from "path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DocsLayout } from "@/components/DocsLayout";
import { renderMarkdown } from "@/lib/MarkdownRenderer";

type PostMeta = {
  title: string;
  date: string;
  description: string;
  author: string;
  tags: string;
};

function getPost(slug: string): { content: string; meta: PostMeta } | null {
  const filePath = path.join(process.cwd(), "content", "blog", `${slug}.md`);
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
      date: (frontmatter["date"] as string) || "",
      description: (frontmatter["description"] as string) || "",
      author: (frontmatter["author"] as string) || "",
      tags: (frontmatter["tags"] as string) || "",
    },
  };
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
  const post = getPost(slug);
  if (!post) return { title: "Not Found" };
  return {
    title: `${post.meta.title} — Blog — Fewer`,
    description: post.meta.description,
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPost(slug);
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
