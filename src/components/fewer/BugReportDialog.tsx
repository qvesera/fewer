"use client";

import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Bug,
  Download,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  Mail,
  Github,
} from "lucide-react";
import { useGraphStore } from "@/store/graphStore";
import { computeStats } from "@/lib/fewer/stats";
import { useToast } from "@/hooks/use-toast";

type Severity = "low" | "medium" | "high" | "critical";
type Category =
  | "layout"
  | "import"
  | "export"
  | "resize"
  | "theme"
  | "context-menu"
  | "keyboard"
  | "search"
  | "drag-drop"
  | "file-ops"
  | "ui"
  | "performance"
  | "other";

const SEVERITIES: { value: Severity; label: string; color: string }[] = [
  { value: "low", label: "Low — minor inconvenience", color: "text-blue-500" },
  {
    value: "medium",
    label: "Medium — workaround exists",
    color: "text-yellow-600 dark:text-yellow-500",
  },
  {
    value: "high",
    label: "High — feature broken",
    color: "text-orange-600 dark:text-orange-500",
  },
  {
    value: "critical",
    label: "Critical — app unusable",
    color: "text-red-600 dark:text-red-500",
  },
];

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "layout", label: "Layout / Beautify" },
  { value: "import", label: "Import / File System" },
  { value: "export", label: "Export" },
  { value: "resize", label: "Node Resizing" },
  { value: "theme", label: "Theme / Colors" },
  { value: "context-menu", label: "Context Menu" },
  { value: "keyboard", label: "Keyboard Shortcuts" },
  { value: "search", label: "Search" },
  { value: "drag-drop", label: "Drag & Drop" },
  { value: "file-ops", label: "File Operations" },
  { value: "ui", label: "UI / Visual" },
  { value: "performance", label: "Performance" },
  { value: "other", label: "Other" },
];

export function BugReportDialog() {
  const open = useGraphStore((s) => s.bugReportOpen);
  const setOpen = useGraphStore((s) => s.setBugReportOpen);
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const direction = useGraphStore((s) => s.direction);
  const edgeStyle = useGraphStore((s) => s.edgeStyle);
  const themeMode = useGraphStore((s) => s.themeMode);
  const nodeWidth = useGraphStore((s) => s.nodeWidth);
  const nodeHeight = useGraphStore((s) => s.nodeHeight);
  const hiddenIds = useGraphStore((s) => s.hiddenIds);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState("");
  const [severity, setSeverity] = useState<Severity>("medium");
  const [category, setCategory] = useState<Category>("other");
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [submitting, setSubmitting] = useState<"idle" | "email" | "github">(
    "idle",
  );
  const { toast } = useToast();

  // Collect diagnostics from the current app state
  const diagnostics = useMemo(() => {
    const stats = computeStats(nodes, edges);
    const userAgent =
      typeof navigator !== "undefined" ? navigator.userAgent : "unknown";
    const isBrave = typeof navigator !== "undefined" && "brave" in navigator;
    const fsSupported =
      typeof window !== "undefined" && "showDirectoryPicker" in window;
    const isIframe =
      typeof window !== "undefined" && window.self !== window.top;
    const viewport =
      typeof window !== "undefined"
        ? `${window.innerWidth}x${window.innerHeight}`
        : "unknown";

    return {
      app: {
        name: "fewer",
        version: "1.0.0",
        timestamp: new Date().toISOString(),
      },
      environment: {
        userAgent,
        browser: isBrave ? "Brave" : "Unknown",
        fileSystemAccess: fsSupported ? "Supported" : "Not supported",
        iframeContext: isIframe,
        viewport,
        online: typeof navigator !== "undefined" ? navigator.onLine : true,
      },
      graphState: {
        totalNodes: nodes.length,
        totalEdges: edges.length,
        totalFiles: stats.totalFiles,
        totalFolders: stats.totalFolders,
        totalSize: stats.totalSize,
        byCategory: stats.byCategory,
        hiddenNodes: hiddenIds.length,
        layoutDirection: direction,
        edgeStyle,
        nodeWidth,
        nodeHeight,
        themeMode,
      },
    };
  }, [
    nodes,
    edges,
    direction,
    edgeStyle,
    themeMode,
    nodeWidth,
    nodeHeight,
    hiddenIds,
  ]);

  // Build the full bug report object
  const bugReport = useMemo(
    () => ({
      ...diagnostics,
      bug: {
        title: title.trim() || "(no title provided)",
        description: description.trim() || "(no description provided)",
        stepsToReproduce: steps.trim() || "(no steps provided)",
        severity,
        category,
      },
    }),
    [diagnostics, title, description, steps, severity, category],
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(bugReport, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text in textarea
    }
  };

  const handleDownload = () => {
    setExporting(true);
    try {
      const blob = new Blob([JSON.stringify(bugReport, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fewer-bug-report-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
      setExporting(false);
    }
  };

  const submitToWeb3Forms = async (report: typeof bugReport) => {
    const accessKey = process.env.NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY;
    if (!accessKey || accessKey === "YOUR_WEB3FORMS_KEY_HERE") {
      throw new Error(
        "Web3Forms access key is not configured. Please set NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY in your environment.",
      );
    }

    const response = await fetch("https://api.web3forms.com/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        access_key: accessKey,
        subject: `[Bug Report] ${report.bug.title}`,
        from_name: "fewer Bug Reporter",
        message: JSON.stringify(report, null, 2),
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.message || "Failed to submit bug report via Web3Forms.");
    }
  };

  const submitToGitHub = async (report: typeof bugReport) => {
    const response = await fetch("/.netlify/functions/bug-report", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ report }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || "Failed to create GitHub issue.");
    }
    return data.issueUrl as string;
  };

  const handleSubmitEmail = async () => {
    setSubmitting("email");
    try {
      await submitToWeb3Forms(bugReport);
      toast({
        title: "Bug report sent!",
        description: "Your report has been successfully sent via email.",
      });
      handleClose();
    } catch (err: any) {
      toast({
        title: "Submission failed",
        description: err.message || "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setSubmitting("idle");
    }
  };

  const handleSubmitGitHub = async () => {
    setSubmitting("github");
    try {
      const issueUrl = await submitToGitHub(bugReport);
      toast({
        title: "GitHub Issue created!",
        description: "Your report has been successfully submitted to GitHub.",
      });
      if (issueUrl) {
        window.open(issueUrl, "_blank", "noopener,noreferrer");
      }
      handleClose();
    } catch (err: any) {
      toast({
        title: "Submission failed",
        description: err.message || "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setSubmitting("idle");
    }
  };

  const handleClose = () => {
    setOpen(false);
    // Reset form after closing
    setTimeout(() => {
      setTitle("");
      setDescription("");
      setSteps("");
      setSeverity("medium");
      setCategory("other");
      setSubmitting("idle");
    }, 200);
  };

  const isDisabled = submitting !== "idle";

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => (v ? setOpen(true) : handleClose())}
    >
      <DialogContent className="sm:max-w-2xl w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bug className="h-4 w-4 text-red-500" />
            Report a Bug
          </DialogTitle>
          <DialogDescription>
            Describe the issue you encountered. Diagnostics are collected
            automatically and included in the report.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Title */}
          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <Label htmlFor="bug-title" className="text-sm">Bug title</Label>
              <span className="text-red-500 text-sm">*</span>
            </div>
            <Input
              id="bug-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Nodes overlap when switching to LR layout"
              className="text-sm"
              disabled={isDisabled}
              aria-required="true"
            />
          </div>

          {/* Category + Severity */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">Category</Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as Category)}
                disabled={isDisabled}
              >
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent
                  position="popper"
                  sideOffset={4}
                  collisionPadding={16}
                  className="z-[100]"
                >
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Severity</Label>
              <Select
                value={severity}
                onValueChange={(v) => setSeverity(v as Severity)}
                disabled={isDisabled}
              >
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent
                  position="popper"
                  sideOffset={4}
                  collisionPadding={16}
                  className="z-[100]"
                >
                  {SEVERITIES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      <span className={s.color}>{s.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="bug-desc" className="text-sm">Description</Label>
            <Textarea
              id="bug-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What happened? What did you expect to happen instead?"
              className="text-sm min-h-[80px]"
              disabled={isDisabled}
            />
          </div>

          {/* Steps to reproduce */}
          <div className="space-y-2">
            <Label htmlFor="bug-steps" className="text-sm">Steps to reproduce</Label>
            <Textarea
              id="bug-steps"
              value={steps}
              onChange={(e) => setSteps(e.target.value)}
              placeholder={"1. Load sample project\n2. Switch to LR layout\n3. ..."}
              className="text-sm min-h-[80px] font-mono text-xs"
              disabled={isDisabled}
            />
          </div>

          <Separator />

          {/* Diagnostics preview */}
          <div className="rounded-lg border border-border/40 bg-muted/30 p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                Auto-collected diagnostics
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>Nodes / Edges</span>
                <span className="tabular-nums font-medium text-foreground/80">
                  {diagnostics.graphState.totalNodes} /{" "}
                  {diagnostics.graphState.totalEdges}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Layout / Edge style</span>
                <span className="font-medium text-foreground/80">
                  {diagnostics.graphState.layoutDirection} /{" "}
                  {diagnostics.graphState.edgeStyle}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Theme / Node size</span>
                <span className="font-medium text-foreground/80">
                  {diagnostics.graphState.themeMode} /{" "}
                  {diagnostics.graphState.nodeWidth}×
                  {diagnostics.graphState.nodeHeight}
                </span>
              </div>
              <div className="flex justify-between">
                <span>FS Access API</span>
                <span className="font-medium text-foreground/80">
                  {diagnostics.environment.fileSystemAccess}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Viewport</span>
                <span className="font-medium text-foreground/80">
                  {diagnostics.environment.viewport}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Hidden nodes</span>
                <span className="font-medium text-foreground/80">
                  {diagnostics.graphState.hiddenNodes}
                </span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-wrap gap-2 sm:justify-between">
          {/* Secondary actions */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleClose}
              disabled={isDisabled}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              disabled={isDisabled}
              className="gap-1.5 cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-green-500" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              disabled={exporting || isDisabled}
              className="gap-1.5 cursor-pointer"
            >
              {exporting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              Download
            </Button>
          </div>

          {/* Primary actions */}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={handleSubmitEmail}
              disabled={isDisabled || !title.trim()}
              className="gap-1.5 cursor-pointer bg-gradient-to-r from-blue-500 to-cyan-500 text-white transition-all hover:from-blue-600 hover:to-cyan-600 hover:shadow-lg hover:shadow-blue-500/20 active:scale-95"
            >
              {submitting === "email" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Mail className="h-3.5 w-3.5" />
              )}
              Send Email
            </Button>
            <Button
              size="sm"
              onClick={handleSubmitGitHub}
              disabled={isDisabled || !title.trim()}
              className="gap-1.5 cursor-pointer bg-gradient-to-r from-purple-600 to-indigo-600 text-white transition-all hover:from-purple-700 hover:to-indigo-700 hover:shadow-lg hover:shadow-purple-500/20 active:scale-95"
            >
              {submitting === "github" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Github className="h-3.5 w-3.5" />
              )}
              GitHub Issue
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}