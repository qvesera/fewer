"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getBrowserSupabase } from "@/lib/supabase";
import { Loader2, LogIn, UserPlus, KeyRound, Info, Check, X } from "lucide-react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { PASSWORD_HINTS, unmetPasswordHints } from "@/lib/fewer/passwordPolicy";

/** Basic email format check (RFC-ish: no spaces, one @, a dot after it). */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AuthDialog({ open, onOpenChange }: AuthDialogProps) {
  const { toast } = useToast();
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  const close = () => {
    onOpenChange(false);
    setMode("signin");
    setEmail("");
    setPassword("");
    setEmailError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Field-level email validation (all modes need a well-formed email).
    const emailOk = EMAIL_RE.test(email.trim());
    if (!emailOk) {
      setEmailError("Enter a valid email address.");
      toast({ title: "Invalid email", description: "Enter a valid email address.", variant: "destructive" });
      return;
    }
    if (emailError) setEmailError(null);

    if (mode === "reset") {
      setLoading(true);
      try {
        const supabase = getBrowserSupabase();
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/callback`,
        });
        if (error) throw error;
        toast({ title: "Reset link sent", description: `Check ${email} for a password reset link.` });
        close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Could not send reset link";
        toast({ title: "Error", description: msg, variant: "destructive" });
      } finally {
        setLoading(false);
      }
      return;
    }

    // Field-level validation before submitting (matches Supabase's policy).
    if (mode === "signup") {
      const unmet = unmetPasswordHints(password);
      if (unmet.length) {
        toast({
          title: "Password requirements not met",
          description: unmet.map((h) => h.label).join(", "),
          variant: "destructive",
        });
        return;
      }
    }

    setLoading(true);
    try {
      const supabase = getBrowserSupabase();
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        toast({ title: "Check your email", description: "Confirm your email to finish signing up." });
        close();
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast({ title: "Signed in", description: "Welcome back!" });
        close();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Authentication failed";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "signin" ? <LogIn className="h-4 w-4 text-primary" /> : mode === "signup" ? <UserPlus className="h-4 w-4 text-primary" /> : <KeyRound className="h-4 w-4 text-primary" />}
            {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Reset password"}
          </DialogTitle>
          <DialogDescription>
            {mode === "signin"
              ? "Sign in to save directories, sync settings, and share graphs."
              : mode === "signup"
                ? "Create an account to save directories across devices."
                : "Enter your email to receive a password reset link."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="auth-email" className="text-xs font-medium">Email</Label>
            <Input
              id="auth-email"
              type="email"
              required
              value={email}
              onChange={(e) => {
                const v = e.target.value;
                setEmail(v);
                if (emailError) {
                  setEmailError(EMAIL_RE.test(v.trim()) ? null : "Enter a valid email address.");
                }
              }}
              placeholder="you@example.com"
              autoComplete="email"
              aria-invalid={!!emailError}
            />
            {emailError && <p className="text-[11px] text-destructive">{emailError}</p>}
          </div>

          {mode !== "reset" && (
            <div className="space-y-1.5">
              <Label htmlFor="auth-password" className="text-xs font-medium flex items-center gap-1">
                Password
                {mode === "signup" && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        tabIndex={-1}
                        className="inline-flex text-muted-foreground hover:text-foreground cursor-help"
                        aria-label="Password requirements"
                      >
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[230px]">
                      <p className="font-medium mb-1">Password must include:</p>
                      <ul className="list-disc pl-4 space-y-0.5">
                        {PASSWORD_HINTS.map((h) => (
                          <li key={h.id}>{h.label}</li>
                        ))}
                      </ul>
                    </TooltipContent>
                  </Tooltip>
                )}
              </Label>
              <Input
                id="auth-password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                aria-invalid={
                  mode === "signup" && password.length > 0 && PASSWORD_HINTS.some((h) => !h.test(password))
                }
              />
              {mode === "signup" && password.length > 0 && (
                <ul className="space-y-0.5 pt-0.5" aria-live="polite">
                  {PASSWORD_HINTS.map((h) => {
                    const ok = h.test(password);
                    return (
                      <li
                        key={h.id}
                        className={`flex items-center gap-1.5 text-[11px] ${
                          ok ? "text-green-600 dark:text-green-500" : "text-muted-foreground/70"
                        }`}
                      >
                        {ok ? (
                          <Check className="h-3 w-3 shrink-0" aria-hidden />
                        ) : (
                          <X className="h-3 w-3 shrink-0 opacity-40" aria-hidden />
                        )}
                        {h.label}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          <Button type="submit" className="w-full gap-1.5 cursor-pointer" disabled={loading}>
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {mode === "signin" ? "Sign in" : mode === "signup" ? "Sign up" : "Send reset link"}
          </Button>
        </form>

        <div className="flex flex-col gap-1.5 text-xs text-center">
          {mode === "signin" && (
            <>
              <button
                type="button"
                onClick={() => setMode("signup")}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                No account? <span className="text-primary">Create one</span>
              </button>
              <button
                type="button"
                onClick={() => setMode("reset")}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                Forgot password?
              </button>
            </>
          )}
          {mode === "signup" && (
            <button
              type="button"
              onClick={() => setMode("signin")}
              className="text-muted-foreground hover:text-foreground cursor-pointer"
            >
              Already have an account? <span className="text-primary">Sign in</span>
            </button>
          )}
          {mode === "reset" && (
            <button
              type="button"
              onClick={() => setMode("signin")}
              className="text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <span className="text-primary">Back to sign in</span>
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}