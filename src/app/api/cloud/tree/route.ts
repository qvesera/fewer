import { NextResponse } from "next/server";
import { getConnectionWithToken } from "@/lib/fewer/cloud/server";
import { getAdapter } from "@/lib/fewer/cloud/registry";
import type { CloudProvider } from "@/lib/fewer/cloud/types";

/**
 * Build a TreeEntry subtree for a cloud folder (for graph import).
 * Body: { connectionId, provider, ref, depth? }
 */
export async function POST(request: Request) {
  let body: { connectionId?: string; provider?: CloudProvider; ref?: string; depth?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { connectionId, provider, ref, depth } = body;
  if (!connectionId || !provider) return NextResponse.json({ error: "Missing connectionId/provider" }, { status: 400 });

  try {
    const { accessToken } = await getConnectionWithToken(connectionId, provider);
    const adapter = await getAdapter(provider);
    const tree = await adapter.buildTree!(accessToken, ref ?? "", depth ?? 6);
    return NextResponse.json({ tree });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}