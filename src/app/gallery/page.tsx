"use client";

import { useState } from "react";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { ThemeGallerySection } from "@/components/marketing/ThemeGallerySection";
import { GraphGallerySection } from "@/components/marketing/GraphGallerySection";
import { Button } from "@/components/ui/button";
import { FolderTree, Palette } from "lucide-react";

type GalleryTab = "graphs" | "themes";

export default function GalleryPage() {
  const [tab, setTab] = useState<GalleryTab>("graphs");

  return (
    <MarketingLayout>
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="max-w-2xl">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">Community gallery</h1>
          <p className="mt-3 text-base text-muted-foreground">
            Directory graphs and custom themes shared publicly by the fewer community. Open a graph
            straight in the app, or share your own from the Share dialog and the theme editor.
          </p>
        </div>

        {/* Graphs ⇄ Themes toggle */}
        <div className="mt-6 flex items-center gap-2">
          <Button
            variant={tab === "graphs" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("graphs")}
            className="cursor-pointer gap-1.5"
          >
            <FolderTree className="h-4 w-4" />
            Graphs
          </Button>
          <Button
            variant={tab === "themes" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("themes")}
            className="cursor-pointer gap-1.5"
          >
            <Palette className="h-4 w-4" />
            Themes
          </Button>
        </div>

        {tab === "graphs" ? <GraphGallerySection /> : <ThemeGallerySection />}
      </section>
    </MarketingLayout>
  );
}