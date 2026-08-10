import { NextResponse } from "next/server";
import { getConnectionWithToken } from "@/lib/fewer/cloud/server";
import { getAdapter } from "@/lib/fewer/cloud/registry";
import type { CloudProvider } from "@/lib/fewer/cloud/types";

/**
 * List immediate children of a cloud folder.
 * Body: { connectionId, provider, ref? }
 */
export async function POST(request: Request) {
  let body: { connectionId?: string; provider?: CloudProvider; ref?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { connectionId, provider, ref } = body;
  if (!connectionId || !provider) return NextResponse.json({ error: "Missing connectionId/provider" }, { status: 400 });

  try {
    const { accessToken } = await getConnectionWithToken(connectionId, provider);
    const adapter = await getAdapter(provider);
    const result = await adapter.listChildren(accessToken, ref);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}