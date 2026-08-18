import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

async function getAuthedClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  const cookieStore = await cookies();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          /* ignore */
        }
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  return supabase;
}

/**
 * GET /api/graphs/[id]/versions/[versionId]
 * Fetch the full snapshot for one version so it can be restored/previewed.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const supabase = await getAuthedClient();
  if (!supabase) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id, versionId } = await params;

  const { data, error } = await supabase
    .from("graph_versions")
    .select("id, saved_graph_id, data, node_count, created_at")
    .eq("id", versionId)
    .eq("saved_graph_id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ version: data });
}

/**
 * DELETE /api/graphs/[id]/versions/[versionId]
 * Remove a single version (owner only via RLS).
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const supabase = await getAuthedClient();
  if (!supabase) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id, versionId } = await params;

  const { error } = await supabase
    .from("graph_versions")
    .delete()
    .eq("id", versionId)
    .eq("saved_graph_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}