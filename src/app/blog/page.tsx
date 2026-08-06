import fs from "fs";
import path from "path";
import Link from "next/link";
import { DocsLayout } from "@/components/DocsLayout";

export const metadata = {
  title: "Blog — Fewer",
  description: "Release notes, feature deep-dives, and behind-the-scenes stories from the Fewer project.",
};

type PostMeta = {
  slug: string;
  title: string;
  date: string;
  description: string;
  author: string;
  tags: string;
};

function getPosts(): PostMeta[] {
  const dir = path.join(process.cwd(), "content", "blog");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
  const posts = files.map((file) => {
    const raw = fs.readFileSync(path.join(dir, file), "utf8");
    const match = raw.match(/^---\n([\s\S]*?)\n---/);
    const frontmatter = match
      ? Object.fromEntries(
          match[1].split("\n").map((line) => {
            const [key, ...rest] = line.split(":");
            return [key.trim(), rest.join(":").trim()];
          }),
        )
      : {};
    return {
      slug: file.replace(/\.md$/, ""),
      title: (frontmatter["title"] as string) || file,
      date: (frontmatter["date"] as string) || "",
      description: (frontmatter["description"] as string) || "",
      author: (frontmatter["author"] as string) || "",
      tags: (frontmatter["tags"] as string) || "",
    };
  });
  posts.sort((a, b) => b.date.localeCompare(a.date));
  return posts;
}

export default function BlogPage() {
  const posts = getPosts();
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
