#!/usr/bin/env bun
/**
 * env-sync.ts — single-source environment sync for fewer.
 *
 * Source of truth is two gitignored files:
 *   .env       → production values
 *   .env.local → non-production (local dev + Netlify previews/branch deploys)
 *
 * Targets via their CLIs (no extra runtime deps):
 *   netlify → netlify env:set (per context + scope)
 *   github  → gh secret set / gh variable set (Actions / cron)
 *
 * Usage:
 *   bun scripts/env-sync.ts check      # verify every code var is defined
 *   bun scripts/env-sync.ts netlify    # push to Netlify
 *   bun scripts/env-sync.ts github     # push to GitHub
 *   bun scripts/env-sync.ts sync       # push to both
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const rawLine of readFileSync(path, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return out;
}

const PROD = readEnvFile(".env");
const DEV = readEnvFile(".env.local");

/* Registry: every var the code reads, its source(s), and its targets. */
const REGISTRY = {
  NEXT_PUBLIC_SUPABASE_URL:             { env: "prod", secret: false, scope: "builds",    github: "var" },
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: { env: "prod", secret: false, scope: "builds",    github: "var" },
  SUPABASE_SERVICE_ROLE_KEY:            { env: "prod", secret: true,  scope: "functions", github: "secret", placeholder: "YOUR_SUPABASE_SERVICE_ROLE_KEY" },
  NEXT_PUBLIC_APP_URL:                  { env: "prod", secret: false, scope: "builds",    github: "var" },
  NEXT_PUBLIC_HOME_URL:                 { env: "prod", secret: false, scope: "builds",    github: "var" },
  NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY:     { env: "prod", secret: false, scope: "builds",    github: "var" },
  NEXT_PUBLIC_APP_VERSION:              { env: "prod", secret: false, scope: "builds",    github: "var", placeholder: "injected-at-build" },
  RESEND_API_KEY:                       { env: "both", secret: true,  scope: "functions", github: "secret", placeholder: "YOUR_RESEND_API_KEY" },
  RESEND_FROM_EMAIL:                    { env: "both", secret: false, scope: "runtime",   github: "var", placeholder: "fewer <onboarding@resend.dev>" },
  CRON_SECRET:                          { env: "both", secret: true,  scope: "functions", github: "secret", placeholder: "YOUR_CRON_SECRET" },
  CONNECTIONS_ENCRYPTION_KEY:           { env: "both", secret: true,  scope: "functions", github: "secret", placeholder: "YOUR_32_BYTE_BASE64_KEY" },
  GITHUB_CLIENT_ID:                     { env: "both", secret: false, scope: "builds",    github: "var" },
  GITHUB_CLIENT_SECRET:                 { env: "both", secret: true,  scope: "functions", github: "secret" },
  GOOGLE_CLIENT_ID:                     { env: "both", secret: false, scope: "builds",    github: "var" },
  GOOGLE_CLIENT_SECRET:                 { env: "both", secret: true,  scope: "functions", github: "secret" },
  MICROSOFT_CLIENT_ID:                  { env: "both", secret: false, scope: "builds",    github: "var" },
  MICROSOFT_CLIENT_SECRET:              { env: "both", secret: true,  scope: "functions", github: "secret" },
  MICROSOFT_TENANT:                     { env: "both", secret: false, scope: "builds",    github: "var", placeholder: "common" },
  AZURE_BLOB_STORAGE_ACCOUNT:           { env: "both", secret: false, scope: "builds",    github: "var", placeholder: "optional" },
};

/* Vars referenced by code; used by check(). */
const CODE_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_APP_VERSION", "NEXT_PUBLIC_HOME_URL", "NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY",
  "RESEND_API_KEY", "RESEND_FROM_EMAIL", "CRON_SECRET", "CONNECTIONS_ENCRYPTION_KEY",
  "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET",
  "MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET", "MICROSOFT_TENANT", "AZURE_BLOB_STORAGE_ACCOUNT",
];

/* ---- check ---- */
const ok = (s) => console.log(`  ok ${s}`);
const warn = (s) => console.warn(`  ! ${s}`);
const err = (s) => console.error(`  x ${s}`);
const srcFor = (env) => (env === "prod" ? PROD : DEV);

function cmdCheck() {
  console.log("\n-- Env integrity check --");
  let problems = 0;
  for (const v of CODE_VARS) {
    if (!(v in REGISTRY)) { err(v + " referenced in code but missing from REGISTRY."); problems++; }
  }
  for (const [key, def] of Object.entries(REGISTRY)) {
    const testEnv = (env, label) => {
      if (key in srcFor(env)) return;
      if (def.placeholder) warn(key + ": placeholder \"" + def.placeholder + "\" in " + label + " — fill in real value");
      else { err(key + " missing from " + label); problems++; }
    };
    if (def.env === "both") { testEnv("prod", ".env"); testEnv("dev", ".env.local"); }
    else testEnv(def.env, def.env === "prod" ? ".env" : ".env.local");
  }
  const ps = PROD["NEXT_PUBLIC_SUPABASE_URL"] || "";
  const ds = DEV["NEXT_PUBLIC_SUPABASE_URL"] || "";
  if (ps && ds) {
    if (ps === ds) warn("PROD and DEV use the SAME Supabase URL — non-prod is NOT isolated!");
    else ok("Prod and dev use different Supabase projects (isolated).");
  }
  console.log(problems === 0 ? "\nALL required env vars defined." : "\n" + problems + " problem(s) to fix.");
  process.exit(problems === 0 ? 0 : 1);
}

/* ---- sync ---- */
function run(cmd, args) {
  try { execFileSync(cmd, args, { stdio: "inherit" }); return true; }
  catch { return false; }
}

function cmdNetlify() {
  console.log("\n-- Syncing to Netlify (fewer-directory) --");
  const contexts = [["production", "prod"], ["deploy-preview", "dev"], ["branch-deploy", "dev"]];
  for (const [context, env] of contexts) {
    const src = srcFor(env);
    for (const [key, def] of Object.entries(REGISTRY)) {
      const val = src[key];
      if (val === undefined) continue;
      const args = ["env:set", key, val, "--context", context, "--scope", def.scope];
      if (def.secret) args.push("--secret");
      console.log("  " + context + "/" + key);
      run("netlify", args);
    }
  }
}

async function cmdGitHub() {
  console.log("\n-- Syncing to GitHub (qvesera/fewer) --");
  for (const [key, def] of Object.entries(REGISTRY)) {
    if (!def.github) continue;
    const val = PROD[key];
    if (val === undefined && !def.placeholder) { warn(key + " not set in .env, skipping"); continue; }
    const kind = def.github === "secret" ? "secret" : "variable";
    const args = def.github === "secret"
      ? ["secret", "set", key, "--body", val || ""]
      : ["variable", "set", key, "--body", val || ""];
    console.log("  " + kind + "/" + key);
    run("gh", args);
  }
}

/* ---- CLI ---- */
const cmd = process.argv[2] || "check";
if (cmd === "check") cmdCheck();
else if (cmd === "netlify") cmdNetlify();
else if (cmd === "github") cmdGitHub();
else if (cmd === "sync") { cmdNetlify(); cmdGitHub(); }
else { console.error("Unknown: " + cmd); console.log("Usage: bun scripts/env-sync.ts [check|netlify|github|sync]"); process.exit(1); }
