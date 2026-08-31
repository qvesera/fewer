"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { GripHorizontal, Layers, Minus, XIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import type { DockEdge } from "@/lib/fewer/themeEditor"
import { clampDockRaw, snapDockPosition } from "@/lib/fewer/themeEditor"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className
      )}
      {...props}
    />
  )
}


/* -------------------------------------------------------------------------- */
/*  Drag support                                                              */
/* -------------------------------------------------------------------------- */

/** Provides the drag-start callback from DialogContent to its DialogDragHandle. */
const DragHandleContext = React.createContext<
  ((e: React.PointerEvent) => void) | null
>(null)

/**
 * Pointer-based dialog dragging. Attach `ref` to the positioned element and
 * `onDragStart` to a handle inside it; apply `offset` as an inline `transform`
 * (composes with Tailwind's `translate`-based centering). Offset is clamped so
 * at least ~48px of the dialog stays inside the viewport.
 */
function useDialogDrag() {
  const ref = React.useRef<HTMLDivElement | null>(null)
  const offsetRef = React.useRef({ x: 0, y: 0 })
  const [offset, setOffset] = React.useState<{ x: number; y: number } | null>(
    null
  )

  const onDragStart = React.useCallback((e: React.PointerEvent) => {
    if (e.button !== 0 || !ref.current) return
    e.preventDefault()
    const rect = ref.current.getBoundingClientRect()
    const sx = e.clientX
    const sy = e.clientY
    const ox = offsetRef.current.x
    const oy = offsetRef.current.y
    const EDGE = 48
    const onMove = (ev: PointerEvent) => {
      const next = {
        x: Math.min(
          Math.max(ox + ev.clientX - sx, EDGE - rect.right),
          window.innerWidth - EDGE - rect.left
        ),
        y: Math.min(
          Math.max(oy + ev.clientY - sy, EDGE - rect.bottom),
          window.innerHeight - EDGE - rect.top
        ),
      }
      offsetRef.current = next
      setOffset(next)
    }
    const onUp = () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
  }, [])

  const resetOffset = React.useCallback(() => {
    offsetRef.current = { x: 0, y: 0 }
    setOffset(null)
  }, [])

  return { ref, offset, onDragStart, resetOffset }
}

/** Grip icon that drags its dialog. Renders nothing outside a DialogContent. */
function DialogDragHandle({ className }: { className?: string }) {
  const onDragStart = React.useContext(DragHandleContext)
  if (!onDragStart) return null
  return (
    <button
      type="button"
      aria-label="Drag dialog to move it"
      title="Drag to move"
      onPointerDown={onDragStart}
      className={cn(
        "inline-flex shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground/40 transition-colors hover:text-muted-foreground active:cursor-grabbing",
        className
      )}
    >
      <GripHorizontal className="size-4" />
    </button>
  )
}


/* -------------------------------------------------------------------------- */
/*  Minimized dock pill                                                       */
/* -------------------------------------------------------------------------- */

function getCanvasBounds() {
  return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
}

// ---- Dock-pill slot registry -----------------------------------------------
// Pills would otherwise stack on top of each other. Each pill claims a slot
// along its edge; slots tile with a step >= the max pill size so two pills can
// never overlap. On drop we resolve to the nearest *free* slot (searching
// outward from the drop point), so even manual drags can’t produce overlap.
// Pills on different edges can’t collide, so occupancy is tracked per edge.
const PAD = 12
const H_STEP = 130 // tile step along horizontal edges (bottom/top)
const V_STEP = 170 // tile step along vertical edges (left/right)

const edgeSlots: Record<DockEdge, Set<number>> = {
  top: new Set(),
  bottom: new Set(),
  left: new Set(),
  right: new Set(),
}
const pillSlot = new Map<number, { edge: DockEdge; index: number }>()
let nextPillId = 0

function slotIndexForEdge(edge: DockEdge, x: number, y: number): number {
  const raw = edge === "top" || edge === "bottom"
    ? Math.round((x - PAD) / H_STEP)
    : Math.round((y - PAD) / V_STEP)
  return Math.max(0, raw)
}

function slotPositionForEdge(
  edge: DockEdge,
  index: number,
  b: ReturnType<typeof getCanvasBounds>,
): { x: number; y: number } {
  if (edge === "bottom") return { x: PAD + index * H_STEP, y: b.height - PAD - 30 }
  if (edge === "top") return { x: PAD + index * H_STEP, y: PAD }
  if (edge === "left") return { x: PAD, y: PAD + index * V_STEP }
  return { x: b.width - PAD - 26, y: PAD + index * V_STEP }
}

function claimEdgeSlot(edge: DockEdge, preferred: number): number {
  const taken = edgeSlots[edge]
  if (!taken.has(preferred)) {
    taken.add(preferred)
    return preferred
  }
  for (let d = 1; d < 200; d++) {
    if (preferred - d >= 0 && !taken.has(preferred - d)) {
      taken.add(preferred - d)
      return preferred - d
    }
    if (!taken.has(preferred + d)) {
      taken.add(preferred + d)
      return preferred + d
    }
  }
  return preferred
}

function freeEdgeSlot(edge: DockEdge, index: number) {
  edgeSlots[edge]?.delete(index)
}

/** Small docked pill shown when a dialog is minimized. Draggable, snaps to
 *  the nearest screen edge, click (without drag) restores the dialog. */
function MinimizedDialogPill({
  icon,
  label,
  onRestore,
}: {
  icon?: React.ReactNode
  label: string
  onRestore: () => void
}) {
  const [dockPosition, setDockPosition] = React.useState({ x: 0, y: 0 })
  const [dockEdge, setDockEdge] = React.useState<DockEdge>("bottom")
  const [isDragging, setIsDragging] = React.useState(false)
  const movedRef = React.useRef(false)
  const startRef = React.useRef({ x: 0, y: 0, posX: 0, posY: 0 })
  const posRef = React.useRef({ x: 0, y: 0 })

  const pillId = React.useRef<number | null>(null)
  if (pillId.current === null) pillId.current = nextPillId++
  const slotRef = React.useRef<{ edge: DockEdge; index: number } | null>(null)

  React.useEffect(() => {
    const b = getCanvasBounds()
    const edge: DockEdge = "bottom"
    const index = claimEdgeSlot(edge, 0)
    slotRef.current = { edge, index }
    const pos = slotPositionForEdge(edge, index, b)
    posRef.current = pos
    setDockPosition(pos)
    setDockEdge(edge)
    return () => {
      const s = slotRef.current
      if (s) freeEdgeSlot(s.edge, s.index)
    }
  }, [])

  const handlePointerDown = React.useCallback((e: React.PointerEvent) => {
    e.stopPropagation()
    movedRef.current = false
    setIsDragging(true)
    startRef.current = {
      x: e.clientX,
      y: e.clientY,
      posX: posRef.current.x,
      posY: posRef.current.y,
    }
    e.preventDefault()
  }, [])

  React.useEffect(() => {
    if (!isDragging) return
    const onMove = (e: PointerEvent) => {
      movedRef.current = true
      const nx = startRef.current.posX + (e.clientX - startRef.current.x)
      const ny = startRef.current.posY + (e.clientY - startRef.current.y)
      const clamped = clampDockRaw(nx, ny, getCanvasBounds())
      posRef.current = clamped
      setDockPosition(clamped)
    }
    const onUp = () => {
      setIsDragging(false)
      if (!movedRef.current) {
        onRestore()
        return
      }
      const b = getCanvasBounds()
      const snapped = snapDockPosition(posRef.current.x, posRef.current.y, b)
      // Free the old slot, then claim the nearest free slot along the edge
      // we dropped onto so two pills can never occupy the same position.
      const prev = slotRef.current
      if (prev) freeEdgeSlot(prev.edge, prev.index)
      const preferred = slotIndexForEdge(snapped.edge, snapped.x, snapped.y)
      const index = claimEdgeSlot(snapped.edge, preferred)
      slotRef.current = { edge: snapped.edge, index }
      const pos = slotPositionForEdge(snapped.edge, index, b)
      posRef.current = pos
      setDockPosition(pos)
      setDockEdge(snapped.edge)
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onUp)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onUp)
    }
  }, [isDragging, onRestore])

  const isVertical = dockEdge === "left" || dockEdge === "right"

  return (
    <div
      className={cn(
        "fixed z-50 flex rounded-xl border border-border/60 bg-background/95 backdrop-blur-xl shadow-lg select-none hover:shadow-xl",
        isVertical ? "flex-col items-center gap-1" : "flex-row items-center gap-2"
      )}
      style={{
        left: dockPosition.x,
        top: dockPosition.y,
        padding: isVertical ? "10px 6px" : "8px 14px",
        cursor: isDragging ? "grabbing" : "grab",
        touchAction: "none",
        transition: isDragging
          ? "box-shadow 150ms ease"
          : "left 300ms cubic-bezier(0.34,1.56,0.64,1), top 300ms cubic-bezier(0.34,1.56,0.64,1), box-shadow 150ms ease",
      }}
      onPointerDown={handlePointerDown}
      title="Drag to snap · Click to restore"
    >
      {icon ?? <Layers className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
      <span
        className={cn(
          "text-[10px] font-medium text-foreground/80",
          isVertical ? "writing-vertical" : ""
        )}
        style={isVertical ? { writingMode: "vertical-rl", textOrientation: "mixed" } : undefined}
      >
        {label}
      </span>
    </div>
  )
}

function DialogContent({
  className,
  children,
  style,
  showCloseButton = true,
  minimizable = true,
  dialogTitle = "Dialog",
  dialogIcon,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
  minimizable?: boolean
  dialogTitle?: string
  dialogIcon?: React.ReactNode
}) {
  const { ref, offset, onDragStart, resetOffset } = useDialogDrag()
  const [minimized, setMinimized] = React.useState(false)

  const handleMinimize = React.useCallback(() => {
    const el = document.activeElement as HTMLElement | null
    if (el && el !== document.body) el.blur()
    setMinimized(true)
  }, [])

  const handleRestore = React.useCallback(() => {
    // Re-center: clear any drag offset so the dialog mounts fresh and on-screen.
    resetOffset()
    setMinimized(false)
  }, [resetOffset])

  // Minimized: render ONLY the dock pill (unmount the Radix content entirely),
  // mirroring ThemeEditorDialog. This avoids display:none fighting Radix
  // Presence/data-state, which left restored content faded and inaccessible.
  if (minimized) {
    return (
      <DialogPortal data-slot="dialog-portal">
        <MinimizedDialogPill
          icon={dialogIcon}
          label={dialogTitle}
          onRestore={handleRestore}
        />
      </DialogPortal>
    )
  }

  const resolvedStyle = offset
    ? { ...style, transform: `translate(${offset.x}px, ${offset.y}px)` }
    : style

  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        data-slot="dialog-content"
        style={resolvedStyle}
        className={cn(
          "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-4 sm:p-6 shadow-lg duration-200 sm:max-w-lg max-h-[85dvh] overflow-y-auto",
          className
        )}
        {...props}
      >
        <DragHandleContext.Provider value={onDragStart}>
          {children}
        </DragHandleContext.Provider>
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
        {minimizable && (
          <button
            type="button"
            aria-label="Minimize dialog"
            title="Minimize"
            onClick={handleMinimize}
            className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-10 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <Minus className="size-4" />
          </button>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  )
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogDragHandle,
  DialogFooter,
  MinimizedDialogPill,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
  useDialogDrag,
}
