/**
 * App-wide count formatting: `plural(3, "node")` → `"3 nodes"`,
 * `plural(1, "node")` → `"1 node"`. Irregular nouns take an explicit plural:
 * `plural(2, "category", "categories")`.
 */
export function plural(count: number, noun: string, pluralNoun?: string): string {
  return `${count} ${count === 1 ? noun : pluralNoun ?? `${noun}s`}`;
}
