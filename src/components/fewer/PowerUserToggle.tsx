"use client";

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useGraphStore } from "@/store/graphStore";

interface PowerUserToggleProps {
  className?: string;
}

export function PowerUserToggle({ className }: PowerUserToggleProps) {
  const advancedModeEnabled = useGraphStore((s) => s.advancedModeEnabled);
  const setAdvancedMode = useGraphStore((s) => s.setAdvancedMode);

  return (
    <div className={className}>
      <div className="flex items-center justify-between rounded-lg border border-border/40 p-3">
        <div className="flex items-center gap-2">
          <div>
            <Label className="text-sm font-medium">Power User Mode</Label>
            <p className="text-[10px] text-muted-foreground">
              Enable advanced features and settings
            </p>
          </div>
        </div>
        <Switch
          checked={advancedModeEnabled}
          onCheckedChange={setAdvancedMode}
          aria-label="Toggle advanced mode"
        />
      </div>
    </div>
  );
}