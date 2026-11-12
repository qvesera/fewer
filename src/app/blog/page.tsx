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
  // Blogs are web-only (T-104): the standalone export ships none.
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

      <div className="mt-12 grid grid-cols-1 gap-10 md:grid-cols-[16rem_minmax(0,1fr)]">
        {/* Index: the left rail /docs has, so a reader picks a post instead of
            scrolling the list to find it. The links go to the post pages, the
            way the docs rail's do.

            It is 16rem rather than the docs rail's quarter of a four column
            grid: at this width the posts' titles ("Aurora Haze: A New Visual
            Identity for Fewer") wrap three or four times, and a rail nobody
            can read is no index at all. The rail is not sticky, so it behaves
            exactly like the one beside the docs. */}
        <aside className="space-y-6">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              All posts
            </h2>
            <ul className="mt-2 space-y-1">
              {posts.map((post) => (
                <li key={post.slug}>
                  <Link
                    href={`/blog/${post.slug}`}
                    className="block text-sm text-foreground/80 transition-colors hover:text-fewer-file-icon"
                  >
                    {post.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <div className="space-y-12">
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
      </div>
    </DocsLayout>
  );
}
