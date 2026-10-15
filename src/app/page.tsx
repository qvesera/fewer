import type { Metadata } from "next";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { MarketingHome } from "@/components/marketing/MarketingHome";

export const metadata: Metadata = {
  title: "fewer | See everything inside any folder, at once",
  description:
    "Open a folder and see everything inside it at once: search it (even inside a zip), plan a structure, group and rename files in bulk, and export it. Fewer turns any directory into an interactive graph. Runs entirely in your browser. Open source (AGPLv3), privacy-first.",
};

/**
 * Root page. The `/` route always serves the public marketing homepage;
 * the interactive app lives at `/app` (see src/app/app/page.tsx).
 */
export default function Home() {
  return (
    <MarketingLayout>
      <MarketingHome />
    </MarketingLayout>
  );
}
