"use client";

import { useState, useMemo } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type DocItem = {
  slug: string;
  title: string;
  description: string;
};

interface DocsSearchProps {
  docs: DocItem[];
}

export function DocsSearch({ docs }: DocsSearchProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.description.toLowerCase().includes(q)
    );
  }, [query, docs]);

  const grouped = useMemo(() => {
    const sections = [
      { title: "Getting Started", items: ["getting-started"] },
      { title: "Features", items: ["graph-features", "editing", "import-export", "sharing", "accounts", "watch", "cloud"] },
      { title: "Reference", items: ["settings", "shortcuts", "theming", "pwa-install", "deployment"] },
      { title: "Legal", items: ["privacy", "terms"] },
    ];
    const bySlug = new Map(filtered.map((d) => [d.slug, d]));
    return sections
      .map((s) => ({
        ...s,
        items: s.items.filter((slug) => bySlug.has(slug)),
      }))
      .filter((s) => s.items.length > 0);
  }, [filtered]);

  return (
    <div className="space-y-6">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search docs..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-10 pr-10"
          data-search-input
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No docs match &ldquo;{query}&rdquo;.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          {/* Sidebar - filtered sections */}
          <aside className="md:col-span-1 space-y-6">
            {grouped.map((section) => (
              <div key={section.title}>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  {section.title}
                </h2>
                <ul className="mt-2 space-y-1">
                  {section.items.map((slug) => {
                    const doc = filtered.find((d) => d.slug === slug);
                    if (!doc) return null;
                    return (
                      <li key={slug}>
                        <a
                          href={`/docs/${slug}`}
                          className="block text-sm text-foreground/80 hover:text-primary transition-colors"
                        >
                          {doc.title}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </aside>

          {/* Main content - filtered doc cards */}
          <div className="md:col-span-3 space-y-10">
            {filtered.map((doc) => (
              <article
                key={doc.slug}
                className={cn(
                  "border border-border rounded-lg p-6 hover:border-border/80 transition-colors"
                )}
              >
                <a href={`/docs/${doc.slug}`}>
                  <h2 className="text-xl font-semibold text-foreground hover:text-primary transition-colors">
                    {doc.title}
                  </h2>
                </a>
                <p className="mt-2 text-muted-foreground">{doc.description}</p>
                <a
                  href={`/docs/${doc.slug}`}
                  className="mt-3 inline-flex items-center text-sm font-medium text-primary hover:underline"
                >
                  Read docs →
                </a>
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
