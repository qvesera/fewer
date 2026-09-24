"use client";

import Link from "next/link";
import { BookOpen, FileText, ArrowLeft } from "lucide-react";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";

interface DocsLayoutProps {
  children: React.ReactNode;
  type: "blog" | "docs";
  title: string;
  backHref?: string;
  backLabel?: string;
}

/**
 * Shell for docs + blog pages. Renders the site's MarketingLayout header/footer
 * (same nav as the main page) and keeps only the prose styling + a slim
 * context row above the content — its own navbar/footer are gone so every
 * non-app page shares one header.
 */
export function DocsLayout({ children, type, title, backHref, backLabel }: DocsLayoutProps) {
  const accentColor = type === "blog" ? "var(--fewer-file-icon)" : "var(--fewer-folder-icon)";
  const iconColor = type === "blog" ? "text-fewer-file-icon" : "text-fewer-folder-icon";

  return (
    <MarketingLayout>
      <div className="mx-auto max-w-4xl px-6 py-10">
        {/* Context row: page type + title + optional back link */}
        <div className="flex items-center justify-between gap-4 border-b border-border/40 pb-4">
          <div className="flex items-center gap-2 min-w-0">
            {type === "docs" ? (
              <BookOpen className={`h-4 w-4 shrink-0 ${iconColor}`} />
            ) : (
              <FileText className={`h-4 w-4 shrink-0 ${iconColor}`} />
            )}
            <span className={`truncate text-sm font-semibold ${iconColor}`}>{title}</span>
          </div>
          {backHref && backLabel && (
            <Link
              href={backHref}
              className="inline-flex shrink-0 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> {backLabel}
            </Link>
          )}
        </div>

        {/* Content */}
        <div className="prose prose-slate dark:prose-invert max-w-none pt-8">
          {children}
        </div>
        <style jsx global>{`
          .prose h1,
          .prose h2,
          .prose h3 {
            color: ${accentColor};
          }
          .prose a {
            color: ${accentColor};
          }
          .prose a:hover {
            color: ${accentColor};
          }
          .prose strong {
            color: ${accentColor};
          }
          .prose code {
            color: ${accentColor};
            background: transparent;
            border: none;
          }
          .prose pre code {
            color: inherit;
            background: transparent;
            border: none;
          }
          .prose thead tr {
            background: color-mix(in srgb, ${accentColor} 10%, transparent);
          }
          .prose thead tr th {
            color: ${accentColor};
            border-bottom: 2px solid ${accentColor};
          }
        `}</style>
      </div>
    </MarketingLayout>
  );
}