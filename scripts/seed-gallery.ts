#!/usr/bin/env bun
/**
 * seed-gallery.ts — idempotent gallery seeder for curated starter templates.
 *
 * Reads TEMPLATE_GRAPHS + THEME_PRESETS from the lib, builds graph payloads
 * via treeToGraph + layoutGraphSync, and upserts rows into Supabase using
 * the service-role key (bypasses RLS).
 *
 * Usage:
 *   bun run gallery:seed                          # dry-run
 *   bun run gallery:seed -- --apply               # upsert rows
 *   bun run gallery:seed -- --apply --graphs-only
 *   bun run gallery:seed -- --apply --themes-only
 *   bun run gallery:seed -- --delete              # remove seeded rows
 *
 * Env required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from "@supabase/supabase-js";
import { TEMPLATE_GRAPHS, templateGraphId } from "../src/lib/fewer/templates";
import { THEME_PRESETS } from "../src/lib/fewer/themePresets";
import { treeToGraph } from "../src/lib/fewer/treeToGraph";
import { layoutGraphSync } from "../src/lib/fewer/layout";

// ── env guard ──────────────────────────────────────────────────────────────
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing env: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(url, key);

// ── CLI args ───────────────────────────────────────────────────────────────
const args = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => a.replace(/^--/, "")));
const DRY_RUN = !args.has("apply");
const DELETE = args.has("delete");
const GRAPHS_ONLY = args.has("graphs-only");
const THEMES_ONLY = args.has("themes-only");
const DO_GRAPHS = !THEMES_ONLY;
const DO_THEMES = !GRAPHS_ONLY;

console.log(`Target: ${new URL(url).hostname}`);
console.log(`Mode: ${DELETE ? "DELETE" : DRY_RUN ? "DRY-RUN" : "APPLY"}`);
console.log(`Scope: ${GRAPHS_ONLY ? "graphs" : THEMES_ONLY ? "themes" : "graphs + themes"}\n`);

// ── system owner ───────────────────────────────────────────────────────────
const SYSTEM_EMAIL = "gallery@fewer.directory";
const SYSTEM_PASSWORD = "gallery-seed-placeholder-do-not-use"; // ponytail: auth disabled for this user; password exists only to satisfy admin API

async function ensureSystemUser(): Promise<string> {
  // List existing users and find by email
  const { data: listData, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) throw new Error(`Failed to list users: ${listErr.message}`);
  const existing = listData.users.find((u) => u.email === SYSTEM_EMAIL);
  if (existing) return existing.id;

  console.log(`Creating system user ${SYSTEM_EMAIL}…`);
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email: SYSTEM_EMAIL,
    password: SYSTEM_PASSWORD,
    email_confirm: true,
  });
  if (createErr) throw new Error(`Failed to create user: ${createErr.message}`);
  return created.user.id;
}

// ── build graph payload ────────────────────────────────────────────────────
function buildGraphPayload(template: (typeof TEMPLATE_GRAPHS)[number]) {
  const { nodes, edges } = treeToGraph(template.tree);
  const laid = layoutGraphSync(nodes, edges, template.direction);
  const data = { nodes: laid, edges, localRootPath: null };
  const nodeCount = laid.length;
  return { data, nodeCount };
}

// ── main ───────────────────────────────────────────────────────────────────
async function main() {
  const userId = await ensureSystemUser();
  console.log(`System user: ${userId}\n`);

  // ── graphs ─────────────────────────────────────────────────────────────
  if (DO_GRAPHS) {
    console.log("── Graphs ──");
    if (DELETE) {
      const ids = TEMPLATE_GRAPHS.map((t) => templateGraphId(t.slug));
      if (!DRY_RUN) {
        const { error } = await supabase.from("shared_graphs").delete().in("id", ids);
        if (error) console.error(`  Delete error: ${error.message}`);
        else console.log(`  Deleted ${ids.length} seeded graph rows`);
      } else {
        console.log(`  Would delete: ${ids.join(", ")}`);
      }
    } else {
      const rows = TEMPLATE_GRAPHS.map((t, i) => {
        const { data, nodeCount } = buildGraphPayload(t);
        const ts = new Date(Date.now() - i * 60_000).toISOString(); // stagger by 1 min each
        return {
          id: templateGraphId(t.slug),
          data,
          owner_id: userId,
          saved_graph_id: null,
          access: "public",
          in_gallery: true,
          node_count: nodeCount,
          gallery_title: t.title,
          gallery_description: t.description,
          expires_at: null,
          created_at: ts,
        };
      });

      for (const row of rows) {
        console.log(`  ${row.id} — ${row.gallery_title} (${row.node_count} cards)`);
      }

      if (!DRY_RUN) {
        const { error } = await supabase.from("shared_graphs").upsert(rows, { onConflict: "id" });
        if (error) console.error(`  Upsert error: ${error.message}`);
        else console.log(`\n  Upserted ${rows.length} graph rows`);
      } else {
        console.log(`\n  Dry-run: ${rows.length} graphs ready`);
      }
    }
    console.log();
  }

  // ── themes ─────────────────────────────────────────────────────────────
  if (DO_THEMES) {
    const GALLERY_THEME_NAMES = [
      "Terminal Amber",
      "Blueprint",
      "Ink & Clay",
      "Neon Grid",
      "Mono Print",
      "Canopy",
      "Aurora Depth",
      "Slate Highlighter",
    ];

    console.log("── Themes ──");
    const presets = GALLERY_THEME_NAMES.map((n) => THEME_PRESETS.find((p) => p.name === n)!).filter(Boolean);

    if (DELETE) {
      if (!DRY_RUN) {
        // Delete from shared_themes by author_username, then saved_themes by user_id + name
        const { error: stErr } = await supabase
          .from("shared_themes")
          .delete()
          .eq("author_username", "fewer");
        if (stErr) console.error(`  shared_themes delete error: ${stErr.message}`);
        else console.log("  Deleted shared_themes rows");

        const { error: svErr } = await supabase
          .from("saved_themes")
          .delete()
          .eq("user_id", userId);
        if (svErr) console.error(`  saved_themes delete error: ${svErr.message}`);
        else console.log("  Deleted saved_themes rows");
      } else {
        console.log(`  Would delete shared_themes where author_username='fewer'`);
        console.log(`  Would delete saved_themes for system user`);
      }
    } else {
      // Step 1: upsert saved_themes (needed for saved_theme_id FK)
      const savedThemeRows: { id: string; user_id: string; name: string; theme: object }[] = [];
      for (const preset of presets) {
        // Find existing by user_id + name (no unique constraint, so query)
        const { data: existing } = await supabase
          .from("saved_themes")
          .select("id")
          .eq("user_id", userId)
          .eq("name", preset.name)
          .maybeSingle();

        if (existing) {
          console.log(`  saved_themes: ${preset.name} → ${existing.id} (exists)`);
          savedThemeRows.push({ id: existing.id, user_id: userId, name: preset.name, theme: preset.theme });
        } else {
          console.log(`  saved_themes: ${preset.name} → (new)`);
          savedThemeRows.push({ id: "", user_id: userId, name: preset.name, theme: preset.theme });
        }
      }

      if (!DRY_RUN) {
        for (let i = 0; i < presets.length; i++) {
          const row = savedThemeRows[i];
          if (row.id) continue; // already has an id from query
          const { data: inserted, error } = await supabase
            .from("saved_themes")
            .insert({ user_id: userId, name: row.name, theme: row.theme })
            .select("id")
            .single();
          if (error) {
            console.error(`  Insert saved_themes error for ${row.name}: ${error.message}`);
          } else {
            savedThemeRows[i].id = inserted.id;
          }
        }
      }

      // Step 2: upsert shared_themes on saved_theme_id (unique key)
      const sharedRows = presets.map((preset, i) => ({
        saved_theme_id: savedThemeRows[i].id || "pending",
        user_id: userId,
        name: preset.name,
        theme: preset.theme,
        gallery_title: preset.name,
        gallery_description: preset.description,
        author_name: "fewer",
        author_username: "fewer",
      }));

      for (const row of sharedRows) {
        console.log(`  shared_themes: ${row.name} → saved_theme_id=${row.saved_theme_id}`);
      }

      if (!DRY_RUN) {
        const valid = sharedRows.filter((r) => r.saved_theme_id && r.saved_theme_id !== "pending");
        if (valid.length > 0) {
          const { error } = await supabase
            .from("shared_themes")
            .upsert(valid, { onConflict: "saved_theme_id" });
          if (error) console.error(`  Upsert shared_themes error: ${error.message}`);
          else console.log(`\n  Upserted ${valid.length} theme rows`);
        }
      } else {
        console.log(`\n  Dry-run: ${sharedRows.length} themes ready`);
      }
    }
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
