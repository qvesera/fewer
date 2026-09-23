"use client";

/**
 * Unified 3-step import dialog for ALL origins (folder, file, URL, cloud):
 *
 *   step 1 — select origin (+ pick the origin's source)
 *   step 2 — configure import options (ONE shared ImportOptionsPanel)
 *   step 3 — import (per-origin action, summary + Import button)
 *
 * Only the import action changes per origin; steps 2 is identical everywhere.
 */

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Download, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGraphStore } from "@/store/graphStore";
import { useToast } from "@/hooks/use-toast";
import { useImport } from "@/hooks/use-github-import";
import { useWatch } from "@/hooks/use-watch";
import { ImportOptionsPanel } from "./ImportOptionsPanel";
import { ImportOriginStep, ORIGIN_ICONS } from "./ImportOriginStep";
import type { ImportOptions } from "@/lib/fewer/importOptions";
import { DEFAULT_IMPORT_OPTIONS } from "@/lib/fewer/importOptions";
import {
  ORIGIN_META,
  defaultSourceFor,
  isSourceReady,
  sourceLabel,
} from "@/lib/fewer/importFlow";
import type { ImportOrigin, OriginSource } from "@/lib/fewer/importFlow";
import { runImport } from "@/lib/fewer/importAction";
import { can } from "@/lib/fewer/tiers";

type Step = 1 | 2 | 3;

const STEP_LABELS: Record<Step, string> = {
  1: "Origin",
  2: "Options",
  3: "Import",
};

const BASIC_MODE_OPTION_DEFAULTS: Partial<ImportOptions> = {
  includeHidden: DEFAULT_IMPORT_OPTIONS.includeHidden,
  includeVendored: DEFAULT_IMPORT_OPTIONS.includeVendored,
  skipEmptyFolders: DEFAULT_IMPORT_OPTIONS.skipEmptyFolders,
  includeFiles: DEFAULT_IMPORT_OPTIONS.includeFiles,
  extensions: DEFAULT_IMPORT_OPTIONS.extensions,
  caseSensitiveExtensions: DEFAULT_IMPORT_OPTIONS.caseSensitiveExtensions,
};

interface ImportFlowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Which origin card is preselected when the dialog opens. */
  initialOrigin?: ImportOrigin;
  /** Called once when the dialog is first opened (for lazy-mount tracking). */
  onFirstOpen?: () => void;
}

export function ImportFlowDialog({
  open,
  onOpenChange,
  initialOrigin = "folder",
  onFirstOpen,
}: ImportFlowDialogProps) {
  const firstOpenDone = useRef(false);
  const handleFirstOpen = () => {
    if (!firstOpenDone.current) {
      firstOpenDone.current = true;
      onFirstOpen?.();
    }
  };
  const { toast } = useToast();
  const tier = useGraphStore((s) => s.tier);
  const advancedFormats = can("advancedImportFormats", tier);
  const { importUrl, getResult: getUrlResult } = useImport();
  const { add: watchAdd } = useWatch();

  const [step, setStep] = useState<Step>(1);
  const [origin, setOrigin] = useState<ImportOrigin>(initialOrigin);
  const [source, setSource] = useState<OriginSource>(
    defaultSourceFor(initialOrigin),
  );
  // Seed from the user's saved import preferences (cloud/db synced).
  const [options, setOptions] = useState<ImportOptions>(() => ({
    ...useGraphStore.getState().importOptions,
  }));
  const [importing, setImporting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Reset the flow on each genuine open transition (open false->true).
  // Re-seed options from the store (the source of truth): this dialog stays
  // mounted while closed, so a long-lived instance would otherwise keep stale
  // options after a cloud sync rewrote them. In basic mode the advanced fields
  // are clamped to defaults, so a saved/synced advanced value can't leak into an
  // import the user can no longer see or change.
  useEffect(() => {
    if (open) {
      handleFirstOpen();
      setStep(1);
      setOrigin(initialOrigin);
      setSource(defaultSourceFor(initialOrigin));
      const { importOptions, advancedModeEnabled: advanced } =
        useGraphStore.getState();
      setOptions(
        advanced
          ? { ...importOptions }
          : { ...importOptions, ...BASIC_MODE_OPTION_DEFAULTS },
      );
      setActionError(null);
      setImporting(false);
    }
  }, [open, initialOrigin]);

  // Advanced mode off → advanced options fall back to defaults (same as old dialog).
  useEffect(() => {
    if (!advancedFormats) {
      setOptions((prev) => ({ ...prev, ...BASIC_MODE_OPTION_DEFAULTS }));
    }
  }, [advancedFormats]);

  // Persist the user's import preferences so the next session/dialog remembers
  // them (and so they're synced to the account in the cloud).
  useEffect(() => {
    useGraphStore.setState((s) => ({ importOptions: { ...s.importOptions, ...options } }));
  }, [options]);

  const handleImport = async () => {
    if (importing) return;
    setImporting(true);
    setActionError(null);

    const result = await runImport(source, options, {
      importUrl,
      getUrlResult,
      watchUrl: watchAdd,
    });

    setImporting(false);

    if (result.cancelled) return; // e.g. native picker dismissed → stay on step 3
    if (!result.ok) {
      setActionError(result.error ?? "Import failed.");
      return;
    }

    toast({ title: result.title, description: result.description });
    result.notes?.forEach((n) =>
      toast({ title: n.title, description: n.description }),
    );
    onOpenChange(false);
  };

  const OriginIcon = ORIGIN_ICONS[origin];

  // Block closing while an import is in flight — otherwise the orphaned
  // promise would toast and close a freshly reopened dialog.
  const handleOpenChange = (next: boolean) => {
    if (!next && importing) return;
    onOpenChange(next);
  };

  // Enter-to-advance on the options (2) and summary (3) steps. Only fires when
  // focus is NOT on a button (buttons trigger their own Enter) or an editable
  // field (inputs/textareas keep their own Enter). Step 1 is handled inside
  // ImportOriginStep.
/** Returns true if the keyboard event target is an editable element that should consume Enter instead of advancing the dialog step. */
function isEditableTarget(el: HTMLElement): boolean {
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "BUTTON" || el.tagName === "A" || el.isContentEditable;
}
  const handleStepKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (importing) return;
    if (isEditableTarget(e.target as HTMLElement)) return;
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (step === 2) setStep(3);
    else if (step === 3) handleImport();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        dialogTitle="Import"
        minimizable
        onKeyDown={handleStepKeyDown}
        className="flex max-h-[85vh] flex-col bg-background/95 p-6 shadow-xl backdrop-blur-md sm:max-w-md"
      >
        <DialogHeader className="border-b border-border/20 pb-3">
          <DialogTitle className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-foreground">
            <OriginIcon className="h-5 w-5 text-muted-foreground/80" />
            Import {step === 1 ? "" : `· ${ORIGIN_META[origin].label}`}
          </DialogTitle>
          <DialogDescription className="mt-1 text-xs font-normal leading-normal text-muted-foreground">
            fewer does not store or upload any data. All data is processed locally, in browser.
          </DialogDescription>

          {/* Stepper: exactly 3 steps for every origin */}
          <div className="mt-3 flex items-center gap-1.5">
            {([1, 2, 3] as Step[]).map((s) => (
              <div key={s} className="flex flex-1 items-center gap-1.5">
                <div
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-colors",
                    s === step
                      ? "bg-primary text-primary-foreground"
                      : s < step
                        ? "bg-primary/25 text-primary"
                        : "bg-muted text-muted-foreground/70",
                  )}
                >
                  {s}
                </div>
                <span
                  className={cn(
                    "text-[10px] font-medium uppercase tracking-wider",
                    s === step
                      ? "text-foreground"
                      : "text-muted-foreground/70",
                  )}
                >
                  {STEP_LABELS[s]}
                </span>
                {s < 3 && (
                  <div
                    className={cn(
                      "h-px flex-1",
                      s < step ? "bg-primary/40" : "bg-border/50",
                    )}
                  />
                )}
              </div>
            ))}
          </div>
        </DialogHeader>

        <div className="gm-scroll flex-1 overflow-y-auto py-4 pr-1">
          {/* All 3 steps stay mounted; inactive ones are hidden. This keeps
              local source state (e.g. cloud browse position) alive across
              Back navigation. */}
          <div className={cn(step !== 1 && "hidden")}>
            <ImportOriginStep
              origin={origin}
              onOriginChange={(o) => {
                setOrigin(o);
                setActionError(null);
              }}
              source={source}
              onSourceChange={setSource}
              advancedFormats={advancedFormats}
              cloudImport={can("cloudImport", tier)}
              onRequireAuth={() =>
                useGraphStore.getState().setAuthOpen(true)
              }
              onOpenCloudSettings={() =>
                useGraphStore.getState().setSettingsOpen(true)
              }
              onAdvance={() => setStep(2)}
            />
          </div>

          <div className={cn(step !== 2 && "hidden")}>
            <ImportOptionsPanel
              options={options}
              onChange={(partial) =>
                setOptions((prev) => ({ ...prev, ...partial }))
              }
              advancedFormats={advancedFormats}
            />
          </div>

          <div className={cn("space-y-3", step !== 3 && "hidden")}>
              <div className="space-y-2.5 rounded-xl border border-border/40 bg-muted/25 p-4 text-xs text-muted-foreground">
                <div className="flex justify-between gap-3 border-b border-border/10 pb-1.5">
                  <span>Origin</span>
                  <span className="flex items-center gap-1.5 font-medium text-foreground/85">
                    <OriginIcon className="h-3.5 w-3.5" />
                    {ORIGIN_META[origin].label}
                  </span>
                </div>
                <div className="flex justify-between gap-3 border-b border-border/10 pb-1.5">
                  <span>Source</span>
                  <span className="max-w-[240px] truncate text-right font-mono text-[11px] font-medium text-foreground/85">
                    {sourceLabel(source)}
                  </span>
                </div>
                <div className="flex justify-between gap-3 border-b border-border/10 pb-1.5">
                  <span>Scan depth</span>
                  <span className="font-mono font-medium text-foreground/80">
                    {options.maxDepth === 0 ? "No limit" : `${options.maxDepth} levels`}
                  </span>
                </div>
                <div className="flex justify-between gap-3 border-b border-border/10 pb-1.5">
                  <span>Display depth</span>
                  <span className="font-mono font-medium text-foreground/80">
                    {options.displayMaxDepth === 0
                      ? "No limit"
                      : `${options.displayMaxDepth} levels`}
                  </span>
                </div>
                <div className="flex justify-between gap-3 border-b border-border/10 pb-1.5">
                  <span>Show files</span>
                  <span className="font-medium text-foreground/85">
                    {options.includeFiles ? "Yes" : "No"}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span>Extensions</span>
                  <span className="rounded bg-secondary px-2 py-0.5 font-mono text-[10px] font-medium text-secondary-foreground">
                    {options.extensions.length > 0
                      ? `${options.extensions.length} ext`
                      : "All (*)"}
                  </span>
                </div>
              </div>

              {actionError && (
                <div className="rounded-xl border border-red-500/35 bg-red-500/10 p-3 text-xs font-medium leading-normal text-red-400 dark:text-red-300">
                  {actionError}
                </div>
              )}

              <p className="text-[10px] leading-relaxed text-muted-foreground/70">
                Pressing Import {origin === "folder"
                  ? "opens your folder picker, then builds the graph."
                  : "builds the graph with the options above."}
              </p>
          </div>
        </div>

        {(step === 2 || step === 3) && (
          <p className="pb-1 text-right text-[10px] text-muted-foreground/60">
            Press <kbd>Enter</kbd> to {step === 2 ? "continue" : "import"}
          </p>
        )}

        <DialogFooter className="mt-2 flex w-full flex-row items-center justify-end gap-3 border-t border-border/20 pt-4">
          {step === 1 && (
            <>
              <Button
                variant="outline"
                size="default"
                onClick={() => handleOpenChange(false)}
                className="h-10 flex-1 border-border/80 text-xs font-medium text-foreground hover:bg-muted/50 sm:flex-initial"
              >
                Cancel
              </Button>
              <Button
                size="default"
                onClick={() => setStep(2)}
                disabled={!isSourceReady(source)}
                className="h-10 flex-1 gap-1.5 text-xs font-medium sm:flex-initial"
              >
                Continue
                <ArrowRight className="h-4 w-4" />
              </Button>
            </>
          )}

          {step === 2 && (
            <>
              <Button
                variant="outline"
                size="default"
                onClick={() => setStep(1)}
                className="h-10 flex-1 gap-1.5 border-border/80 text-xs font-medium text-foreground hover:bg-muted/50 sm:flex-initial"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Button
                size="default"
                onClick={() => setStep(3)}
                className="h-10 flex-1 gap-1.5 text-xs font-medium sm:flex-initial"
              >
                Continue
                <ArrowRight className="h-4 w-4" />
              </Button>
            </>
          )}

          {step === 3 && (
            <>
              <Button
                variant="outline"
                size="default"
                onClick={() => setStep(2)}
                disabled={importing}
                className="h-10 flex-1 gap-1.5 border-border/80 text-xs font-medium text-foreground hover:bg-muted/50 sm:flex-initial"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Button
                size="default"
                onClick={handleImport}
                disabled={importing}
                className="h-10 flex-1 gap-1.5 text-xs font-medium sm:flex-initial"
              >
                {importing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {importing ? "Importing..." : "Browse"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}