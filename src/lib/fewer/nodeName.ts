/**
 * Full display name of a node — label plus its stored extension, if any.
 * Shared by the store slices and UI components (was copy-pasted in both).
 */
export const fullName = (n: { data: { label: string; extension?: string } }) =>
  n.data.extension ? `${n.data.label}.${n.data.extension}` : n.data.label;
