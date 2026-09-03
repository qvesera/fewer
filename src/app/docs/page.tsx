import { DocsLayout } from "@/components/DocsLayout";
import { DocsSearch } from "@/components/fewer/DocsSearch";
import { getSupabase } from "@/lib/supabase";

export const metadata = {
  title: "Docs | Fewer",
  description: "Feature guides, tutorials, and technical references for Fewer.",
};

// Serve from Supabase with a 60s revalidate so doc edits go live without a deploy.
// ponytail: DB outage => empty docs list (no crash); upgrade path is on-disk cache.
export const revalidate = 60;

type DocMeta = {
  slug: string;
  title: string;
  description: string;
};

async function getDocs(): Promise<DocMeta[]> {
  try {
    const { data, error } = await getSupabase()
      .from("content_pages")
      .select("slug,title,description")
      .eq("type", "docs")
      .eq("published", true)
      .order("title", { ascending: true });
    if (error) return [];
    return (data ?? []).map((d) => ({
      slug: d.slug,
      title: d.title,
      description: d.description ?? "",
    }));
  } catch {
    return [];
  }
}

export default async function DocsPage() {
  const docs = await getDocs();

  return (
    <DocsLayout type="docs" title="Docs">
      <h1 className="text-4xl font-bold tracking-tight text-foreground">
        Docs
      </h1>
      <p className="mt-4 text-lg text-muted-foreground">
        Feature guides, tutorials, and technical references for Fewer.
      </p>

      <div className="mt-8">
        <DocsSearch docs={docs} />
      </div>
    </DocsLayout>
  );
}
