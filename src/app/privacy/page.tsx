import fs from "fs";
import path from "path";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { renderMarkdown } from "@/lib/MarkdownRenderer";

export const metadata = {
  title: "Privacy Policy | Fewer",
  description:
    "How fewer collects, uses, and protects your data. Fewer is designed to run in your browser with minimal data collection.",
};

export default function PrivacyPage() {
  const filePath = path.join(process.cwd(), "content", "docs", "privacy.md");
  const raw = fs.readFileSync(filePath, "utf8");
  // Strip the YAML frontmatter block so only the markdown body renders.
  const body = raw.replace(/^---\n[\s\S]*?\n---\n?/, "");

  return (
    <MarketingLayout>
      <article className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-4xl font-bold tracking-tight text-foreground">Privacy Policy</h1>
        <div className="prose prose-slate dark:prose-invert mt-8 max-w-none">
          {renderMarkdown(body)}
        </div>
      </article>
    </MarketingLayout>
  );
}
