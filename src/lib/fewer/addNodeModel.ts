// Pure helpers for AddNodeDialog — toast text + validation.
// Extracted from AddNodeDialog.tsx to keep the component thin.

/** Toast content per dialog mode/type combination. */
export function addNodeToast(
  mode: "child" | "standalone" | "parent",
  type: "folder" | "file",
  name: string,
): { title: string; description: string } {
  const label = mode === "parent" ? "is now the parent card" : type === "folder" ? `"${name}" added to folder` : `"${name}" added to canvas`;
  const title = mode === "parent" ? "Parent folder added" : type === "folder" ? "Folder added" : "File added";
  if (mode === "parent") return { title, description: `"${name}" is now the parent card` };
  return {
    title,
    description: mode === "child" ? `"${name}" added to folder` : `"${name}" added to canvas`,
  };
}

/** Returns a reason string if the name is invalid, null if OK. */
export function validateAddName(name: string, type: "folder" | "file"): string | null {
  if (!name.trim()) return null; // empty handled by caller defaulting to "New Folder"
  if (type === "file" && !name.includes(".")) return "File names must include an extension.";
  return null;
}
