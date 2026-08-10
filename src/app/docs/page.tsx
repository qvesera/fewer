import fs from "fs";
import path from "path";
import Link from "next/link";
import { DocsLayout } from "@/components/DocsLayout";

export const metadata = {
  title: "Docs | Fewer",
  description: "Feature guides, tutorials, and technical references for Fewer.",
};

type DocMeta = {
  slug: string;
  title: string;
  description: string;
};

function getDocs(): DocMeta[] {
  const dir = path.join(process.cwd(), "content", "docs");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
  const docs = files.map((file) => {
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
      description: (frontmatter["description"] as string) || "",
    };
  });
  return docs.sort((a, b) => a.title.localeCompare(b.title));
}

const sections = [
  {
    title: "Getting Started",
    items: ["getting-started"],
  },
  {
    title: "Features",
    items: ["graph-features", "editing", "import-export", "sharing", "accounts", "watch", "cloud"],
  },
  {
    title: "Reference",
    items: ["settings", "shortcuts", "theming", "pwa-install", "deployment"],
  },
  {
    title: "Legal",
    items: ["privacy", "terms"],
  },
];

export default function DocsPage() {
  const docs = getDocs();
  const docsBySlug = new Map(docs.map((d) => [d.slug, d]));

  return (
    <DocsLayout type="docs" title="Docs">
      <h1 className="text-4xl font-bold tracking-tight text-foreground">
        Docs
      </h1>
      <p className="mt-4 text-lg text-muted-foreground">
        Feature guides, tutorials, and technical references for Fewer.
      </p>

      <div className="mt-12 grid grid-cols-1 md:grid-cols-4 gap-10">
        <aside className="md:col-span-1 space-y-6">
          {sections.map((section) => (
            <div key={section.title}>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {section.title}
              </h2>
              <ul className="mt-2 space-y-1">
                {section.items.map((slug) => {
                  const doc = docsBySlug.get(slug);
                  if (!doc) return null;
                  return (
                    <li key={slug}>
                      <Link
                        href={`/docs/${slug}`}
                        className="block text-sm text-foreground/80 hover:text-primary transition-colors"
                      >
                        {doc.title}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </aside>

        <div className="md:col-span-3 space-y-10">
          {docs.map((doc) => (
            <article
              key={doc.slug}
              className="border border-border rounded-lg p-6 hover:border-border/80 transition-colors"
            >
              <Link href={`/docs/${doc.slug}`}>
                <h2 className="text-xl font-semibold text-foreground hover:text-primary transition-colors">
                  {doc.title}
                </h2>
              </Link>
              <p className="mt-2 text-muted-foreground">{doc.description}</p>
              <Link
                href={`/docs/${doc.slug}`}
                className="mt-3 inline-flex items-center text-sm font-medium text-primary hover:underline"
              >
                Read docs →
              </Link>
            </article>
          ))}
        </div>
      </div>
    </DocsLayout>
  );
}
