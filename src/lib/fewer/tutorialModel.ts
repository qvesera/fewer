// Pure helpers for TutorialDialog.
import type { TutorialChecklistItem } from "@/lib/fewer/tutorial";

/** Should this item be marked done given the current store state? */
export function isStepComplete(
  state: Record<string, unknown>,
  item: TutorialChecklistItem,
  doneIds: string[],
): boolean {
  if (doneIds.includes(item.id)) return true;
  if (!item.watchState) return false;
  const { key, value } = item.watchState;
  const stateValue = state[key];
  if (value === null) {
    if (key === "selectedNodeIds" && Array.isArray(stateValue) && (stateValue as unknown[]).length > 0) return true;
    return false;
  }
  return stateValue === value;
}

/** Should the tutorial be dismissed (globally dismissed + no restart)? */
export function shouldAutoDismiss(dismissed: boolean, restartKey: number): boolean {
  return dismissed && restartKey === 0;
}
