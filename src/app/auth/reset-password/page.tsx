"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getBrowserSupabase } from "@/lib/supabase";
import { KeyRound, Loader2, Check, X, Eye, EyeOff } from "lucide-react";
import { PASSWORD_HINTS, unmetPasswordHints } from "@/lib/fewer/passwordPolicy";

/**
 * Set-new-password screen reached from the password-reset email link.
 * The /auth/callback route exchanges the reset code for a session and
 * redirects here (?next=/auth/reset-password) — so this page assumes the
 * visitor is signed in with a "recovery" session and lets them update
 * the password via auth.updateUser().
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    getBrowserSupabase()
      .auth.getSession()
      .then(({ data }) => {
        if (!mounted) return;
        // No session = the callback exchange didn't happen (expired/used link).
        // The main app handles the "not signed in" state gracefully.
        if (!data.session) router.replace("/app");
        else setChecking(false);
      });
    return () => {
      mounted = false;
    };
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      toast({ title: "Passwords do not match", description: "Re-enter the password in both fields.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { error } = await getBrowserSupabase().auth.updateUser({ password });
      if (error) throw error;
      toast({ title: "Password updated", description: "Your password has been changed." });
      router.push("/app");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not update password";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border/50 bg-card/40 p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" aria-hidden />
          <h1 className="text-sm font-semibold text-foreground">Set a new password</h1>
        </div>

        {checking ? (
          <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Checking your reset link…
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="reset-password" className="text-xs font-medium">
                New password
              </Label>
              <div className="relative">
                <Input
                  id="reset-password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  aria-invalid={password.length > 0 && PASSWORD_HINTS.some((h) => !h.test(password))}
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
              {password.length > 0 && (
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

            <div className="space-y-1.5">
              <Label htmlFor="reset-confirm-password" className="text-xs font-medium">
                Confirm password
              </Label>
              <Input
                id="reset-confirm-password"
                type={showPassword ? "text" : "password"}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                aria-invalid={confirmPassword.length > 0 && confirmPassword !== password}
              />
              {confirmPassword.length > 0 && confirmPassword !== password && (
                <p className="text-[11px] text-muted-foreground/70">Passwords do not match yet.</p>
              )}
            </div>

            <Button type="submit" className="w-full gap-1.5 cursor-pointer" disabled={loading}>
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Update password
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
