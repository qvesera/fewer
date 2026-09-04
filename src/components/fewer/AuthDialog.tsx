"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getBrowserSupabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";
import { Loader2, LogIn, UserPlus, KeyRound, Mail, Info, Check, X, Eye, EyeOff } from "lucide-react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { PASSWORD_HINTS, unmetPasswordHints } from "@/lib/fewer/passwordPolicy";

/** Basic email format check (RFC-ish: no spaces, one @, a dot after it). */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type AuthMode = "signin" | "signup" | "reset" | "magic";

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AuthDialog({ open, onOpenChange }: AuthDialogProps) {
  const { toast } = useToast();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setEmailError(null);
    setConfirmError(null);
  };

  const close = () => {
    onOpenChange(false);
    switchMode("signin");
    setEmail("");
  };

  const handleOAuth = async (provider: "google" | "github") => {
    setLoading(true);
    try {
      // PKCE flow (default with @supabase/ssr): the browser leaves for the
      // provider and comes back to /auth/callback, which exchanges the code.
      const { error } = await getBrowserSupabase().auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
      // No local cleanup — the page navigates away to the provider.
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not start sign-in";
      toast({ title: "Error", description: msg, variant: "destructive" });
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Auto-detect email vs username: an "@" means an email, anything else is a
    // username (usernames can't contain "@", so this is unambiguous).
    const identifier = email.trim();
    const isEmail = identifier.includes("@");

    if (mode === "signin") {
      if (!identifier) {
        setEmailError("Enter an email or username.");
        toast({ title: "Missing account", description: "Enter your email or username.", variant: "destructive" });
        return;
      }
      if (isEmail && !EMAIL_RE.test(identifier)) {
        setEmailError("Enter a valid email address.");
        toast({ title: "Invalid email", description: "Enter a valid email address.", variant: "destructive" });
        return;
      }
    } else {
      // Sign-up and password-reset always use a real email.
      if (!EMAIL_RE.test(identifier)) {
        setEmailError("Enter a valid email address.");
        toast({ title: "Invalid email", description: "Enter a valid email address.", variant: "destructive" });
        return;
      }
    }
    if (emailError) setEmailError(null);

    // Magic link: one email field, no password.
    if (mode === "magic") {
      setLoading(true);
      try {
        const supabase = getBrowserSupabase();
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) throw error;
        toast({
          title: "Sign-in link sent",
          description: `Check ${email} for a link that signs you in. It expires in an hour.`,
        });
        close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Could not send sign-in link";
        toast({ title: "Error", description: msg, variant: "destructive" });
      } finally {
        setLoading(false);
      }
      return;
    }

    if (mode === "reset") {
      setLoading(true);
      try {
        const supabase = getBrowserSupabase();
        // next=/auth/reset-password: the callback route redirects there after
        // exchanging the code, so the user can actually set the new password.
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password`,
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
      if (password !== confirmPassword) {
        setConfirmError("Passwords do not match.");
        toast({ title: "Passwords do not match", description: "Re-enter the password in both fields.", variant: "destructive" });
        return;
      }
      if (confirmError) setConfirmError(null);
    }

    setLoading(true);
    try {
      if (mode === "signup") {
        const supabase = getBrowserSupabase();
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        // Anti-enumeration: when the email is already registered Supabase
        // returns user: null (and no error) instead of rejecting. Surface it.
        if (!data.user) {
          toast({
            title: "Email already registered",
            description: "An account with this email already exists — sign in instead.",
            variant: "destructive",
          });
          switchMode("signin");
          return;
        }
        toast({ title: "Check your email", description: "Confirm your email to finish signing up." });
        close();
      } else {
        // Sign in goes through the server so usernames can be resolved to an
        // email (Supabase password login only accepts an email/phone).
        const res = await fetch("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifier, password }),
        });
        const json = (await res.json().catch(() => null)) as { error?: string; session?: Session } | null;
        if (!res.ok) {
          throw new Error(json?.error ?? "Invalid username or password");
        }
        // The server already set the session cookie (for middleware/SSR). Pushing
        // the returned session into the browser auth client lets onAuthStateChange
        // fire immediately, so the app shows signed-in without a page reload.
        if (json?.session) {
          await getBrowserSupabase().auth.setSession(json.session);
        }
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
      <DialogContent dialogTitle="Account" className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "signin" ? <LogIn className="h-4 w-4 text-primary" /> : mode === "signup" ? <UserPlus className="h-4 w-4 text-primary" /> : mode === "magic" ? <Mail className="h-4 w-4 text-primary" /> : <KeyRound className="h-4 w-4 text-primary" />}
            {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : mode === "magic" ? "Sign in with a link" : "Reset password"}
          </DialogTitle>
          <DialogDescription>
            {mode === "signin"
              ? "Sign in to save directories, sync settings, and share graphs."
              : mode === "signup"
                ? "Create an account to save directories across devices."
                : mode === "magic"
                  ? "Enter your email and we'll send you a one-tap sign-in link — no password needed."
                  : "Enter your email to receive a password reset link."}
          </DialogDescription>
        </DialogHeader>

        {(mode === "signin" || mode === "signup") && (
          <div className="flex flex-col gap-1.5">
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" className="gap-1.5 cursor-pointer" disabled={loading} onClick={() => handleOAuth("google")}>
                <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden><path fill="currentColor" d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81"/></svg>
                Google
              </Button>
              <Button type="button" variant="outline" className="gap-1.5 cursor-pointer" disabled={loading} onClick={() => handleOAuth("github")}>
                <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden><path fill="currentColor" d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.55v-2.15c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.75 2.69 1.25 3.34.95.1-.74.4-1.25.72-1.54-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.25 5.67.41.35.77 1.05.77 2.12v3.14c0 .3.21.66.8.55A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5"/></svg>
                GitHub
              </Button>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70">
              <span className="h-px flex-1 bg-border" />
              or with email
              <span className="h-px flex-1 bg-border" />
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="auth-email" className="text-xs font-medium">
              {mode === "signin" ? "Email or username" : "Email"}
            </Label>
            <Input
              id="auth-email"
              type={mode === "signin" ? "text" : "email"}
              required
              value={email}
              onChange={(e) => {
                const v = e.target.value;
                setEmail(v);
                if (emailError) {
                  // For sign-in, only flag a malformed email when it actually
                  // looks like one (contains "@"); otherwise it's a username.
                  const looksEmail = v.trim().includes("@");
                  if (mode !== "signin" || looksEmail) {
                    setEmailError(EMAIL_RE.test(v.trim()) ? null : "Enter a valid email address.");
                  } else {
                    setEmailError(null);
                  }
                }
              }}
              placeholder={mode === "signin" ? "you@example.com or your_username" : "you@example.com"}
              autoComplete={mode === "signin" ? "username" : "email"}
              aria-invalid={!!emailError}
            />
            {emailError && <p className="text-[11px] text-destructive">{emailError}</p>}
          </div>

          {(mode === "signin" || mode === "signup") && (
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
              <div className="relative">
                <Input
                  id="auth-password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  aria-invalid={
                    mode === "signup" && password.length > 0 && PASSWORD_HINTS.some((h) => !h.test(password))
                  }
                  className="pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground cursor-pointer"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
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

          {mode === "signup" && (
            <div className="space-y-1.5">
              <Label htmlFor="auth-confirm-password" className="text-xs font-medium">
                Confirm password
              </Label>
              <div className="relative">
                <Input
                  id="auth-confirm-password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (confirmError) setConfirmError(null);
                  }}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  aria-invalid={!!confirmError || (confirmPassword.length > 0 && confirmPassword !== password)}
                  className="pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground cursor-pointer"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {confirmError ? (
                <p className="text-[11px] text-destructive">{confirmError}</p>
              ) : (
                confirmPassword.length > 0 &&
                confirmPassword !== password && (
                  <p className="text-[11px] text-muted-foreground/70">Passwords do not match yet.</p>
                )
              )}
            </div>
          )}

          <Button type="submit" className="w-full gap-1.5 cursor-pointer" disabled={loading}>
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {mode === "signin"
              ? "Sign in"
              : mode === "signup"
                ? "Sign up"
                : mode === "magic"
                  ? "Send sign-in link"
                  : "Send reset link"}
          </Button>
        </form>

        <div className="flex flex-col gap-1.5 text-xs text-center">
          {mode === "signin" && (
            <>
              <button
                type="button"
                onClick={() => switchMode("signup")}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                No account? <span className="text-primary">Create one</span>
              </button>
              <button
                type="button"
                onClick={() => switchMode("reset")}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                Forgot password?
              </button>
              <button
                type="button"
                onClick={() => switchMode("magic")}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                Prefer no password? <span className="text-primary">Sign in with a link</span>
              </button>
            </>
          )}
          {mode === "signup" && (
            <button
              type="button"
              onClick={() => switchMode("signin")}
              className="text-muted-foreground hover:text-foreground cursor-pointer"
            >
              Already have an account? <span className="text-primary">Sign in</span>
            </button>
          )}
          {(mode === "reset" || mode === "magic") && (
            <button
              type="button"
              onClick={() => switchMode("signin")}
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