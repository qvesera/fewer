"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * A number display that, on click, becomes a numeric input so the user can
 * type an exact value. Committing (Enter/blur) calls `onCommit` with the raw
 * typed number — deliberately bypassing any slider min/max. Pressing Escape
 * or clearing/committing without a change reverts to the display.
 *
 * Props:
 *  - value: the numeric value to show.
 *  - onCommit: called with the committed (possibly out-of-range) number.
 *  - unit: optional suffix rendered after the number (e.g. "px", "%", " items").
 *  - labelFn: optional formatter for the display state — e.g. `(v) => v === 0 ? "Unlimited" : `${v} lvl``.
 */
function EditableNumber({
  value,
  onCommit,
  unit,
  labelFn,
  className,
}: {
  value: number
  onCommit: (v: number) => void
  unit?: string
  labelFn?: (v: number) => string
  className?: string
}) {
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState<string>(String(value))
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (editing) {
      setDraft(String(value))
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing, value])

  const commit = React.useCallback(() => {
    const parsed = Number(draft)
    if (!Number.isNaN(parsed)) onCommit(parsed)
    setEditing(false)
  }, [draft, onCommit])

  React.useEffect(() => {
    if (!editing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault()
        commit()
      } else if (e.key === "Escape") {
        setDraft(String(value))
        setEditing(false)
      }
    }
    const input = inputRef.current
    input?.addEventListener("keydown", onKey)
    return () => input?.removeEventListener("keydown", onKey)
  }, [editing, value, draft, commit])

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "w-20 rounded border border-ring/60 bg-background px-1 py-0 text-right text-xs font-mono tabular-nums text-foreground outline-none",
          className,
        )}
        aria-label="Enter a value"
      />
    )
  }

  const text = labelFn ? labelFn(value) : `${value}${unit ?? ""}`

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        setEditing(true)
      }}
      title="Click to type a value"
      className={cn(
        "cursor-pointer border-b border-dashed border-transparent rounded px-0.5 text-left font-mono tabular-nums transition-colors hover:border-muted-foreground/40 hover:bg-muted/30",
        className,
      )}
    >
      {text}
    </button>
  )
}

export { EditableNumber }
