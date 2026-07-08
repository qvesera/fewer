"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: { componentStack: string } | null;
}

/**
 * Error boundary that catches render errors in the graph canvas and
 * provides a retry button. Prevents a single node crash from taking
 * down the whole app.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: { componentStack: string }) {
    console.error("[ErrorBoundary] Caught error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    this.props.onReset?.();
  };

  handleReload = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-4 rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-foreground">
              Something went wrong
            </h3>
            <p className="max-w-md text-sm text-muted-foreground">
              {this.state.error?.message || "An unexpected error occurred while rendering the graph."}
            </p>
          </div>
          {this.state.errorInfo?.componentStack && (
            <details className="max-w-lg text-left">
              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                Show technical details
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto rounded-lg border border-border/40 bg-muted/30 p-3 text-[10px] text-muted-foreground">
                {this.state.errorInfo.componentStack}
              </pre>
            </details>
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={this.handleReset}
              className="gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Try again
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={this.handleReload}
              className="gap-1.5"
            >
              <Home className="h-3.5 w-3.5" />
              Reload app
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Lightweight loading fallback for lazy-loaded components.
 */
export function NodeLoadingFallback() {
  return (
    <div className="flex h-32 w-48 animate-pulse items-center justify-center rounded-xl border border-border/40 bg-card/40">
      <div className="text-xs text-muted-foreground">Loading…</div>
    </div>
  );
}
