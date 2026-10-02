"use client";

// License panel (T-090 / #302): desktop Settings tab for activating the
// offline .fewerlicense file. Verification is offline (Ed25519 in the shell).
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  activateLicense,
  checkLicense,
  deactivateLicense,
  getLicensePath,
  onLicenseChanged,
} from "@/lib/fewer/license/licenseState";
import type { LicenseStatus } from "@/lib/fewer/license/types";
import { BadgeCheck, FileText, KeyRound, Trash2 } from "lucide-react";

export function LicensePanel() {
  const { toast } = useToast();
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setStatus(await checkLicense());
  }, []);

  useEffect(() => {
    void refresh();
    return onLicenseChanged(() => void refresh());
  }, [refresh]);

  const handleActivate = async () => {
    setBusy(true);
    try {
      const res = await activateLicense();
      if (res.ok) {
        toast({ title: "License activated", description: `Welcome, ${res.status.payload?.holder}.` });
      } else if (res.error !== "cancelled") {
        toast({ title: "Activation failed", description: res.error, variant: "destructive" });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDeactivate = () => {
    deactivateLicense();
    toast({ title: "License removed", description: "Pro features are now locked on this device." });
  };

  if (!status || status.state === "none") {
    return (
      <div className="space-y-3 p-1">
        <p className="text-sm text-muted-foreground">
          No license activated. Desktop Pro features (local library, native browsing, preview)
          are unlocked with a Fewer license file.
        </p>
        <Button variant="outline" size="sm" className="gap-2" onClick={handleActivate} disabled={busy}>
          <KeyRound className="h-3.5 w-3.5" />
          Activate license file…
        </Button>
      </div>
    );
  }

  const p = status.payload;
  return (
    <div className="space-y-3 p-1">
      <div className="flex items-center gap-2">
        {status.state === "valid" ? (
          <BadgeCheck className="h-4 w-4 text-green-500" />
        ) : (
          <FileText className="h-4 w-4 text-destructive" />
        )}
        <span className="text-sm font-medium">
          {status.state === "valid"
            ? `${p?.kind === "enterprise" ? "Enterprise" : p?.kind === "network" ? "Network" : "Pro"} license active`
            : status.state === "expired"
              ? "License expired"
              : "License invalid"}
        </span>
      </div>
      {p && (
        <dl className="text-xs text-muted-foreground space-y-1">
          <div><dt className="inline font-medium">Holder: </dt><dd className="inline">{p.holder}</dd></div>
          <div><dt className="inline font-medium">License ID: </dt><dd className="inline font-mono">{p.id}</dd></div>
          <div>
            <dt className="inline font-medium">Expires: </dt>
            <dd className="inline">{p.expires ? new Date(p.expires).toLocaleDateString() : "never"}</dd>
          </div>
          <div className="truncate" title={getLicensePath()}>
            <dt className="inline font-medium">File: </dt><dd className="inline">{getLicensePath()}</dd>
          </div>
        </dl>
      )}
      {status.state !== "valid" && (
        <Button variant="outline" size="sm" className="gap-2" onClick={handleActivate} disabled={busy}>
          <KeyRound className="h-3.5 w-3.5" />
          Activate another license…
        </Button>
      )}
      <Button variant="ghost" size="sm" className="gap-2 text-destructive" onClick={handleDeactivate}>
        <Trash2 className="h-3.5 w-3.5" />
        Deactivate
      </Button>
    </div>
  );
}
