import Link from "next/link";
import { DocsLayout } from "@/components/DocsLayout";
import { getSupabase } from "@/lib/supabase";

export const metadata = {
  title: "Blog | Fewer",
  description: "Release notes, feature deep-dives, and behind-the-scenes stories from the Fewer project.",
};

// Serve from Supabase with a 60s revalidate so unpublished/edited posts go live
// without a deploy. ponytail: DB outage => empty blog list (no crash); upgrade
// path is caching the last-known-good list on disk.
export const revalidate = 60;

type PostMeta = {
  slug: string;
  title: string;
  date: string;
  description: string;
  author: string;
  tags: string;
};

async function getPosts(): Promise<PostMeta[]> {
  try {
    const { data, error } = await getSupabase()
      .from("content_pages")
      .select("slug,title,date,description,author,tags")
      .eq("type", "blog")
      .eq("published", true)
      .order("date", { ascending: false });
    if (error) return [];
    return (data ?? []).map((p) => ({
      slug: p.slug,
      title: p.title,
      date: p.date ?? "",
      description: p.description ?? "",
      author: p.author ?? "",
      tags: p.tags ?? "",
    }));
  } catch {
    return [];
  }
}

export default async function BlogPage() {
  const posts = await getPosts();
  return (
    <DocsLayout type="blog" title="Blog">
      <h1 className="text-4xl font-bold tracking-tight text-foreground">
        Blog
      </h1>
      <p className="mt-4 text-lg text-muted-foreground">
        Release notes, feature deep-dives, and behind-the-scenes stories from the Fewer project.
      </p>

      <div className="mt-12 space-y-12">
        {posts.map((post) => (
          <article
            key={post.slug}
            className="group relative border-b border-border/40 pb-12 last:border-0"
          >
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <time dateTime={post.date}>{post.date}</time>
              {post.author && <span>· {post.author}</span>}
            </div>
            <h2 className="mt-2 text-2xl font-semibold text-foreground group-hover:text-fewer-file-icon transition-colors">
              {post.title}
            </h2>
            <p className="mt-3 text-muted-foreground">{post.description}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {post.tags.split(",").map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground"
                >
                  {tag.trim()}
                </span>
              ))}
            </div>
            <Link
              href={`/blog/${post.slug}`}
              className="mt-4 inline-flex items-center text-sm font-medium text-fewer-file-icon hover:underline"
            >
              Read more →
            </Link>
          </article>
        ))}
      </div>
    </DocsLayout>
  );
}
