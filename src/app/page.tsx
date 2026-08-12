import { headers } from "next/headers";
import type { Metadata } from "next";
import { FewerApp } from "@/components/fewer";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { MarketingHome } from "@/components/marketing/MarketingHome";

/**
 * Hosts that should see the marketing homepage at `/` instead of the app.
 * The apex domain (fewer.directory) is the public site + privacy policy;
 * the app itself lives at app.fewer.directory.
 */
const MARKETING_HOSTS = new Set(["fewer.directory", "www.fewer.directory"]);

/** Whether the current request is for the marketing (apex) host. */
async function isMarketingHost(): Promise<boolean> {
  const host = ((await headers()).get("host") ?? "")
    .toLowerCase()
    .replace(/:\d+$/, "");
  return MARKETING_HOSTS.has(host);
}

export async function generateMetadata(): Promise<Metadata> {
  if (await isMarketingHost()) {
    return {
      title: "fewer | Turn any directory into an interactive graph",
      description:
        "fewer turns any file system into an interactive graph you can explore, edit, and export. Runs entirely in your browser. Open source, keyboard-first, privacy-first.",
    };
  }
  return {
    title: "fewer | Interactive Directory Graph Visualizer",
    description:
      "Transform your file system navigation into an art form. Interactive graph-based directory visualization with React Flow, Dagre auto-layout, 7 export formats, keyboard-first navigation, custom themes, and real file system integration.",
  };
}

/**
 * Root page. Reads the Host header at render time so the homepage/app split
 * works reliably even when the app is served from a prerendered page.
 */
export default async function Home() {
  if (await isMarketingHost()) {
    return (
      <MarketingLayout>
        <MarketingHome />
      </MarketingLayout>
    );
  }

  return <FewerApp />;
}
