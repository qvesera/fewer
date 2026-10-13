import type { Metadata } from "next";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { MarketingHome } from "@/components/marketing/MarketingHome";

export const metadata: Metadata = {
  title: "fewer | Turn any directory into an interactive graph",
  description:
    "fewer turns any file system into an interactive graph you can explore, edit, organise and group, and export in 8 formats, including the .fwr graph document. Runs entirely in your browser. Open source (AGPLv3), keyboard-first, privacy-first.",
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
