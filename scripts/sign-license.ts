// License signing tool (T-090 / #302). The private key NEVER lives in this
// repo — it lives at ~/.fewer-signing/ed25519.key (or $FWER_LICENSE_KEY), and
// the script refuses key paths inside the repo working tree.
//
// The signature covers the exact payload JSON string stored in the file —
// no canonicalization step, signer controls the bytes, verifier checks them.
//
// Usage:
//   bun scripts/sign-license.ts --gen-key [--key-out PATH]
//   bun scripts/sign-license.ts --sign --holder "Acme" [--kind pro|enterprise|network]
//                                [--expires 2027-01-01] [--features '{"tags":false}']
//                                [--key PATH] [--out license.fewerlicense]
//   bun scripts/sign-license.ts --verify file.fewerlicense [--key PATH]
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

const DEFAULT_KEY = join(homedir(), ".fewer-signing", "ed25519.key");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

/** Raw 32-byte public key hex, from a PKCS8/SPKI key file. */
function pubHex(privPath: string): string {
  const pem = readFileSync(privPath, "utf8");
  const pub = createPublicKey(createPrivateKey(pem));
  const spki = pub.export({ type: "spki", format: "der" }) as Buffer;
  return spki.subarray(spki.length - 32).toString("hex");
}

function refuseRepoKey(path: string): void {
  const repo = resolve(process.cwd());
  if (resolve(path).startsWith(repo + "/")) {
    die(`refusing: key path ${path} is inside the repo. Keep the private key outside it (default ${DEFAULT_KEY}).`);
  }
}

function keyPath(): string {
  return arg("key") ?? process.env.FWER_LICENSE_KEY ?? DEFAULT_KEY;
}

function genKey(): void {
  const out = arg("key-out") ?? DEFAULT_KEY;
  refuseRepoKey(out);
  if (existsSync(out)) die(`key already exists at ${out} — refusing to overwrite`);
  mkdirSync(dirname(out), { recursive: true, mode: 0o700 });
  const { privateKey } = generateKeyPairSync("ed25519");
  writeFileSync(out, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  console.log(`private key: ${out}`);
  console.log(`public key (embed in src-tauri/src/lib.rs LICENSE_PUBLIC_KEY_HEX):`);
  console.log(pubHex(out));
}

interface LicensePayload {
  format: 1;
  id: string;
  holder: string;
  kind: "pro" | "enterprise" | "network";
  expires: string | null;
  features: Record<string, boolean> | null;
  issued_at: string;
}

function signLicense(): void {
  const key = keyPath();
  if (!existsSync(key)) die(`no signing key at ${key} — run --gen-key first`);
  const holder = arg("holder") ?? die("--holder required");
  const kind = (arg("kind") ?? "pro") as LicensePayload["kind"];
  if (!["pro", "enterprise", "network"].includes(kind)) die(`bad --kind ${kind}`);
  const expires = arg("expires") ?? null;
  if (expires && Number.isNaN(Date.parse(expires))) die(`bad --expires ${expires}`);
  let features: Record<string, boolean> | null = null;
  if (arg("features")) {
    try {
      features = JSON.parse(arg("features")!) as Record<string, boolean>;
    } catch {
      die("--features must be JSON object of feature→bool");
    }
  }
  const payload: LicensePayload = {
    format: 1,
    id: `lic_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    holder,
    kind,
    expires,
    features,
    issued_at: new Date().toISOString(),
  };
  const payloadJson = JSON.stringify(payload);
  const privateKey = createPrivateKey(readFileSync(key));
  const sig = sign(null, Buffer.from(payloadJson, "utf8"), privateKey);
  const file = { payload: payloadJson, signature: sig.toString("base64") };
  const out = arg("out") ?? `${payload.id}.fewerlicense`;
  writeFileSync(out, JSON.stringify(file, null, 2));
  console.log(`signed: ${out}`);
  console.log(`  id=${payload.id} kind=${payload.kind} expires=${payload.expires ?? "perpetual"}`);
  console.log(`  verify with: bun scripts/sign-license.ts --verify ${out}`);
}

function verifyLicense(): void {
  const file = arg("verify") ?? die("--verify <file> required");
  const key = keyPath();
  const raw = JSON.parse(readFileSync(file, "utf8")) as { payload?: string; signature?: string };
  if (typeof raw.payload !== "string" || typeof raw.signature !== "string") die("malformed license file");
  const pub = createPublicKey(createPrivateKey(readFileSync(key))); // same key file holds both halves
  const ok = verify(null, Buffer.from(raw.payload, "utf8"), pub, Buffer.from(raw.signature, "base64"));
  if (!ok) die("signature INVALID");
  console.log(`signature OK · payload: ${raw.payload}`);
}

if (flag("gen-key")) genKey();
else if (flag("sign")) signLicense();
else if (flag("verify")) verifyLicense();
else die("use --gen-key | --sign | --verify <file> (see header)");
