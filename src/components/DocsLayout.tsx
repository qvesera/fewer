"use client";

import Link from "next/link";
import { BookOpen, Home, FileText } from "lucide-react";

interface DocsLayoutProps {
  children: React.ReactNode;
  type: "blog" | "docs";
  title: string;
  backHref?: string;
  backLabel?: string;
}

export function DocsLayout({ children, type, title, backHref, backLabel }: DocsLayoutProps) {
  const accentColor = type === "blog" ? "var(--fewer-file-icon)" : "var(--fewer-folder-icon)";
  const iconColor = type === "blog" ? "text-fewer-file-icon" : "text-fewer-folder-icon";

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Aurora Haze background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="gm-canvas-aurora" />
        <div className="gm-canvas-aurora-3" />
      </div>

      {/* Navbar matching app style */}
      <div className="relative z-10 border-b border-border/40 bg-background/95 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className={`flex items-center gap-2 ${iconColor}`}>
              <Home className="h-4 w-4" />
              <span className="text-sm font-medium">fewer</span>
            </Link>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2">
              {type === "docs" ? (
                <BookOpen className={`h-4 w-4 ${iconColor}`} />
              ) : (
                <FileText className={`h-4 w-4 ${iconColor}`} />
              )}
              <span className="font-semibold text-foreground">{title}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {backHref && backLabel && (
              <Link
                href={backHref}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                ← {backLabel}
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="relative z-10 mx-auto max-w-4xl px-6 py-12">
        <div className="prose prose-slate dark:prose-invert max-w-none">
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

      {/* Footer with legal links */}
      <footer className="relative z-10 border-t border-border/40 bg-background/95">
        <div className="mx-auto max-w-4xl px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} fewer ·{" "}
            <Link href="/" className="hover:text-foreground">
              fewer.directory
            </Link>
          </p>
          <nav className="flex items-center gap-4 text-xs text-muted-foreground">
            <Link href="/docs/privacy" className="hover:text-foreground">
              Privacy Policy
            </Link>
            <Link href="/docs/terms" className="hover:text-foreground">
              Terms of Use
            </Link>
            <Link href="/docs" className="hover:text-foreground">
              Docs
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}