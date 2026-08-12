import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { MarketingHome } from "@/components/marketing/MarketingHome";

export const metadata = {
  title: "fewer | Turn any directory into an interactive graph",
  description:
    "fewer turns any file system into an interactive graph you can explore, edit, and export. Runs entirely in your browser. Open source, keyboard-first, privacy-first.",
};

export default function WelcomePage() {
  return (
    <MarketingLayout>
      <MarketingHome />
    </MarketingLayout>
  );
}
