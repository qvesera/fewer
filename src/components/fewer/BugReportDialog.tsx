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
import { Bug, Download, Copy, Check, Loader2, AlertCircle, Mail, Github } from "lucide-react";
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
  { value: "low", label: "Low — minor inconvenience", color: "text-blue-400" },
  {
    value: "medium",
    label: "Medium — workaround exists",
    color: "text-yellow-400",
  },
  { value: "high", label: "High — feature broken", color: "text-orange-400" },
  {
    value: "critical",
    label: "Critical — app unusable",
    color: "text-red-400",
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
  const [submitting, setSubmitting] = useState<"idle" | "email" | "github">("idle");
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
      throw new Error("Web3Forms access key is not configured. Please set NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY in your environment.");
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

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => (v ? setOpen(true) : handleClose())}
    >
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bug className="h-4 w-4 text-red-400" />
            Report a Bug
          </DialogTitle>
          <DialogDescription>
            Describe the issue you encountered. Diagnostics are collected
            automatically and included in the report.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="bug-title">Bug title</Label>
            <Input
              id="bug-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Nodes overlap when switching to LR layout"
              className="text-sm"
              disabled={submitting !== "idle"}
            />
          </div>

          {/* Category + Severity */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Category</Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as Category)}
                disabled={submitting !== "idle"}
              >
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Severity</Label>
              <Select
                value={severity}
                onValueChange={(v) => setSeverity(v as Severity)}
                disabled={submitting !== "idle"}
              >
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
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
          <div className="space-y-1.5">
            <Label htmlFor="bug-desc">Description</Label>
            <Textarea
              id="bug-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What happened? What did you expect to happen instead?"
              className="text-sm min-h-[80px]"
              disabled={submitting !== "idle"}
            />
          </div>

          {/* Steps to reproduce */}
          <div className="space-y-1.5">
            <Label htmlFor="bug-steps">Steps to reproduce</Label>
            <Textarea
              id="bug-steps"
              value={steps}
              onChange={(e) => setSteps(e.target.value)}
              placeholder={
                "1. Load sample project\n2. Switch to LR layout\n3. ..."
              }
              className="text-sm min-h-[80px] font-mono text-xs"
              disabled={submitting !== "idle"}
            />
          </div>

          {/* Diagnostics preview */}
          <div className="rounded-lg border border-border/40 bg-muted/30 p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <AlertCircle className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                Auto-collected diagnostics
              </span>
            </div>
            <div className="space-y-1 text-[10px] text-muted-foreground">
              <div className="flex justify-between">
                <span>Nodes / Edges</span>
                <span className="tabular-nums">
                  {diagnostics.graphState.totalNodes} /{" "}
                  {diagnostics.graphState.totalEdges}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Layout / Edge style</span>
                <span>
                  {diagnostics.graphState.layoutDirection} /{" "}
                  {diagnostics.graphState.edgeStyle}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Theme / Node size</span>
                <span>
                  {diagnostics.graphState.themeMode} /{" "}
                  {diagnostics.graphState.nodeWidth}×
                  {diagnostics.graphState.nodeHeight}
                </span>
              </div>
              <div className="flex justify-between">
                <span>FS Access API</span>
                <span>{diagnostics.environment.fileSystemAccess}</span>
              </div>
              <div className="flex justify-between">
                <span>Viewport</span>
                <span>{diagnostics.environment.viewport}</span>
              </div>
              <div className="flex justify-between">
                <span>Hidden nodes</span>
                <span>{diagnostics.graphState.hiddenNodes}</span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:justify-end">
          <Button 
            variant="outline" 
            onClick={handleClose}
            disabled={submitting !== "idle"}
          >
            Cancel
          </Button>
          <Button 
            variant="outline" 
            onClick={handleCopy} 
            disabled={submitting !== "idle"}
            className="gap-1.5"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-green-400" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                Copy JSON
              </>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={handleDownload}
            disabled={exporting || submitting !== "idle"}
            className="gap-1.5"
          >
            {exporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            Download Report
          </Button>
          <Button
            onClick={handleSubmitEmail}
            disabled={submitting !== "idle" || !title.trim()}
            className="gap-1.5 bg-gradient-to-r from-blue-500 to-cyan-500 text-white hover:from-blue-600 hover:to-cyan-600"
          >
            {submitting === "email" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Mail className="h-3.5 w-3.5" />
            )}
            Send Email
          </Button>
          <Button
            onClick={handleSubmitGitHub}
            disabled={submitting !== "idle" || !title.trim()}
            className="gap-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-700 hover:to-indigo-700"
          >
            {submitting === "github" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Github className="h-3.5 w-3.5" />
            )}
            Create GitHub Issue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
