"use client";

import { useGraphStore } from "@/store/graphStore";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Sun,
  Moon,
  Palette,
  Info,
  Settings,
  Bug,
  Keyboard,
  RefreshCw,
  Github,
  Globe,
  HelpCircle,
  Map as MinimapIcon,
  Maximize2,
  FileIcon,
  BookOpen,
  ExternalLink,
  ChevronRight,
} from "lucide-react";
import type { ThemeMode } from "@/lib/fewer/types";
import { PowerUserToggle, CustomThemeEditor, Logo } from ".";
import { cn } from "@/lib/utils";

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION;

/* -------------------------------------------------------------------------- */
/*  About tab                                                                 */
/* -------------------------------------------------------------------------- */

function AboutTab() {
  return (
    <div className="flex flex-col gap-5 py-1">
      {/* Brand Hero Card */}
        <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-b from-card to-card/50 p-4 shadow-sm transition-[colors,transform,box-shadow]">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-background/80 shadow-sm border border-border/40 backdrop-blur-md">
            <Logo size={28} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold tracking-tight text-foreground">fewer</h3>
              <span className="rounded-full bg-accent/60 px-2 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground border border-border/40">
                v{APP_VERSION}
              </span>
            </div>
            <p className="text-xs text-muted-foreground/80 mt-0.5">Interactive File & System Graph Visualizer</p>
          </div>
        </div>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground/90 font-normal text-pretty">
        Transform complex file systems into clear, interactive graphs. Explore, search,
        customize, and export with ease. No data is ever uploaded — processing is completely local.
      </p>

      {/* Action Links */}
      <div className="grid grid-cols-2 gap-2.5">
        <Button
          variant="outline"
          size="sm"
          className="group h-10 gap-2 rounded-xl border-border/60 bg-card/40 hover:bg-accent/50 text-xs font-medium text-foreground transition-[colors,transform,box-shadow] hover:border-border active:scale-[0.96]"
          onClick={() => window.open("https://github.com/qvesera/fewer", "_blank", "noreferrer")}
        >
          <Github className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
          <span>GitHub</span>
          <ExternalLink className="h-3 w-3 text-muted-foreground/40 ml-auto opacity-0 transition-opacity group-hover:opacity-100" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="group h-10 gap-2 rounded-xl border-border/60 bg-card/40 hover:bg-accent/50 text-xs font-medium text-foreground transition-[colors,transform,box-shadow] hover:border-border active:scale-[0.96]"
          onClick={() => window.open("https://qvesera.github.io", "_blank", "noreferrer")}
        >
          <Globe className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
          <span>Website</span>
          <ExternalLink className="h-3 w-3 text-muted-foreground/40 ml-auto opacity-0 transition-opacity group-hover:opacity-100" />
        </Button>
      </div>

      <p className="text-[11px] text-center text-muted-foreground/50 pt-2">
        Built with Next.js, React Flow & shadcn/ui • Released under AGPLv3 License
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Appearance tab                                                            */
/* -------------------------------------------------------------------------- */

function AppearanceTab() {
  const themeMode = useGraphStore((s) => s.themeMode);
  const setThemeMode = useGraphStore((s) => s.setThemeMode);
  const showFiles = useGraphStore((s) => s.showFiles);
  const setShowFiles = useGraphStore((s) => s.setShowFiles);
  const advancedModeEnabled = useGraphStore((s) => s.advancedModeEnabled);

  return (
    <div className="flex flex-col gap-5 py-1">
      <div className="space-y-2.5">
        <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Theme Preferences
        </Label>
        <div className="grid grid-cols-3 gap-2.5">
          {(advancedModeEnabled ? (["light", "dark", "custom"] as ThemeMode[]) : (["light", "dark"] as ThemeMode[])).map((mode) => {
            const Icon = mode === "light" ? Sun : mode === "dark" ? Moon : Palette;
            const active = themeMode === mode;
            return (
              <button
                key={mode}
                onClick={() => setThemeMode(mode)}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-2 rounded-xl border p-3 transition-[colors,transform,box-shadow] duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96]",
                  active
                    ? "border-primary/50 bg-primary/5 text-primary shadow-sm font-medium"
                    : "border-border/50 bg-card/30 hover:bg-accent/40 hover:border-border text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className={cn("h-4 w-4 transition-transform group-hover:scale-110", active && "text-primary")} />
                <span className="text-xs capitalize">{mode}</span>
              </button>
            );
          })}
        </div>
        {advancedModeEnabled && themeMode === "custom" && <CustomThemeEditor />}
      </div>

        <div className="flex items-center justify-between rounded-2xl border border-border/50 bg-card/30 p-3.5 hover:border-border/80 transition-[colors,box-shadow] hover:shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-accent/50 text-muted-foreground shadow-sm">
            <FileIcon className="h-4 w-4" />
          </div>
          <div className="flex flex-col">
            <Label htmlFor="settings-show-files" className="text-xs font-medium cursor-pointer">
              Show Files
            </Label>
            <span className="text-[11px] text-muted-foreground/70 text-pretty">Toggle display of file-level graph nodes</span>
          </div>
        </div>
        <Switch
          id="settings-show-files"
          checked={showFiles}
          onCheckedChange={setShowFiles}
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Minimap controls                                                          */
/* -------------------------------------------------------------------------- */

function MinimapControls() {
  const showMiniMap = useGraphStore((s) => s.showMiniMap);
  const setShowMiniMap = useGraphStore((s) => s.setShowMiniMap);
  const miniMapPosition = useGraphStore((s) => s.miniMapPosition);
  const setMiniMapPosition = useGraphStore((s) => s.setMiniMapPosition);
  const miniMapSize = useGraphStore((s) => s.miniMapSize);
  const setMiniMapSize = useGraphStore((s) => s.setMiniMapSize);

  const positions = [
    { value: "top-left", label: "Top Left" },
    { value: "top-right", label: "Top Right" },
    { value: "bottom-left", label: "Bottom Left" },
    { value: "bottom-right", label: "Bottom Right" },
  ] as const;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium text-foreground">Enable Minimap</Label>
        <Switch checked={showMiniMap} onCheckedChange={setShowMiniMap} />
      </div>

      {showMiniMap && (
        <>
          <div className="space-y-2">
            <Label className="text-[11px] text-muted-foreground font-medium">Position</Label>
            <div className="grid grid-cols-2 gap-2">
              {positions.map((pos) => {
                const active = miniMapPosition === pos.value;
                return (
                  <button
                    key={pos.value}
                    onClick={() => setMiniMapPosition(pos.value)}
                    className={cn(
                      "rounded-lg border px-2.5 py-1.5 text-xs text-center transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "border-primary/40 bg-primary/10 text-primary font-medium"
                        : "border-border/50 hover:bg-accent/40 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {pos.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <Label className="text-[11px] text-muted-foreground font-medium">Size</Label>
              <span className="text-xs font-mono tabular-nums text-foreground/80">{miniMapSize}px</span>
            </div>
            <Slider
              value={[miniMapSize]}
              onValueChange={([v]) => setMiniMapSize(v)}
              min={80}
              max={300}
              step={10}
            />
          </div>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Advanced tab                                                              */
/* -------------------------------------------------------------------------- */

function AdvancedTab() {
  const nodeWidth = useGraphStore((s) => s.nodeWidth);
  const nodeHeight = useGraphStore((s) => s.nodeHeight);
  const setNodeDimensions = useGraphStore((s) => s.setNodeDimensions);
  const advancedModeEnabled = useGraphStore((s) => s.advancedModeEnabled);

  return (
    <div className="flex flex-col gap-5 py-1">
      <PowerUserToggle />

      {advancedModeEnabled && (
        <div className="flex flex-col gap-4 rounded-2xl border border-border/50 bg-card/30 p-4 shadow-sm">
          <div className="flex items-center gap-2 border-b border-border/30 pb-2.5">
            <Maximize2 className="h-3.5 w-3.5 text-primary" />
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
              Node Metrics
            </Label>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground font-normal">Width</Label>
              <span className="text-xs font-mono tabular-nums font-medium text-foreground">{nodeWidth}px</span>
            </div>
            <Slider
              value={[nodeWidth]}
              onValueChange={([v]) => setNodeDimensions(v, nodeHeight)}
              min={120}
              max={400}
              step={10}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground font-normal">Height</Label>
              <span className="text-xs font-mono tabular-nums font-medium text-foreground">{nodeHeight}px</span>
            </div>
            <Slider
              value={[nodeHeight]}
              onValueChange={([v]) => setNodeDimensions(nodeWidth, v)}
              min={40}
              max={300}
              step={5}
            />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <MinimapIcon className="h-3.5 w-3.5 text-muted-foreground/70" />
          <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Minimap Settings
          </Label>
        </div>
        <div className="rounded-2xl border border-border/50 bg-card/30 p-4 shadow-sm">
          <MinimapControls />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Help tab                                                                  */
/* -------------------------------------------------------------------------- */

function HelpTab() {
  const setShortcutsOpen = useGraphStore((s) => s.setShortcutsOpen);
  const setBugReportOpen = useGraphStore((s) => s.setBugReportOpen);

  const handleRestartTutorial = () => {
    useGraphStore.getState().resetTutorial();
    window.dispatchEvent(new Event("fewer-restart-tutorial"));
  };

  const helpActions = [
    { label: "Keyboard Shortcuts", icon: Keyboard, onClick: () => setShortcutsOpen(true) },
    { label: "Report an Issue", icon: Bug, onClick: () => setBugReportOpen(true) },
    { label: "Restart Interactive Tutorial", icon: RefreshCw, onClick: handleRestartTutorial },
    { label: "GitHub Issues", icon: HelpCircle, onClick: () => window.open("https://github.com/qvesera/fewer/issues", "_blank", "noreferrer") },
    { label: "Official Documentation", icon: Globe, onClick: () => window.open("https://qvesera.github.io", "_blank", "noreferrer") },
  ];

  return (
    <div className="flex flex-col gap-2 py-1">
      {helpActions.map((item, idx) => (
        <Button
          key={idx}
          variant="ghost"
          size="default"
          className="group justify-between h-11 px-3.5 rounded-xl border border-border/30 bg-card/20 hover:bg-accent/50 hover:border-border/60 text-xs font-normal text-foreground transition-[colors,transform,border-color] active:scale-[0.96]"
          onClick={item.onClick}
        >
          <div className="flex items-center gap-3">
            <item.icon className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
            <span>{item.label}</span>
          </div>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
        </Button>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Settings dialog shell                                                     */
/* -------------------------------------------------------------------------- */

export function SettingsDialog() {
  const settingsOpen = useGraphStore((s) => s.settingsOpen);
  const setSettingsOpen = useGraphStore((s) => s.setSettingsOpen);

  return (
    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
      <DialogContent className="w-[520px] max-w-[calc(100%-2rem)] h-[580px] max-h-[85vh] overflow-hidden flex flex-col gap-0 p-0 rounded-2xl border-border/60 bg-background/95 backdrop-blur-xl shadow-2xl">
        <DialogHeader className="shrink-0 p-6 pb-4 border-b border-border/40">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 text-primary">
              <Settings className="h-4 w-4" />
            </div>
            <div>
               <DialogTitle className="text-base font-semibold tracking-tight text-balance">Settings</DialogTitle>
               <DialogDescription className="text-xs text-muted-foreground/80 mt-0.5 text-pretty">
                Manage visual themes, graph metrics, and application preferences
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="about" className="flex min-h-0 flex-1 flex-col">
          <div className="px-6 pt-3 pb-2 border-b border-border/30 bg-muted/10">
            <TabsList className="w-full justify-start h-9 bg-transparent p-0 gap-1 overflow-x-auto [&::-webkit-scrollbar]:h-0">
              <TabsTrigger
                value="about"
                className="gap-1.5 rounded-lg px-3 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground"
              >
                <Info className="h-3.5 w-3.5" />
                About
              </TabsTrigger>
              <TabsTrigger
                value="appearance"
                className="gap-1.5 rounded-lg px-3 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground"
              >
                <Palette className="h-3.5 w-3.5" />
                Appearance
              </TabsTrigger>
              <TabsTrigger
                value="advanced"
                className="gap-1.5 rounded-lg px-3 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground"
              >
                <Settings className="h-3.5 w-3.5" />
                Advanced
              </TabsTrigger>
              <TabsTrigger
                value="help"
                className="gap-1.5 rounded-lg px-3 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground"
              >
                <BookOpen className="h-3.5 w-3.5" />
                Help
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <TabsContent value="about" className="m-0">
              <AboutTab />
            </TabsContent>
            <TabsContent value="appearance" className="m-0">
              <AppearanceTab />
            </TabsContent>
            <TabsContent value="advanced" className="m-0">
              <AdvancedTab />
            </TabsContent>
            <TabsContent value="help" className="m-0">
              <HelpTab />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}