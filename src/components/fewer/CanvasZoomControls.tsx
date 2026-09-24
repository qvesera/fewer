import { Panel } from "@xyflow/react";
import { ZoomIn, ZoomOut, Maximize2, Crosshair } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ZoomControlsProps {
  zoomIn: (opts?: { duration?: number }) => void;
  zoomOut: (opts?: { duration?: number }) => void;
  fitView: (opts?: { duration?: number; padding?: number }) => void;
  fitToSelection: () => void;
}

export function CanvasZoomControls({
  zoomIn,
  zoomOut,
  fitView,
  fitToSelection,
}: ZoomControlsProps) {
  return (
    <Panel position="bottom-center">
      <div className="gm-float flex items-center gap-1 rounded-2xl p-1">
        <Button variant="ghost" size="icon" className="h-8 w-8 min-hit" onClick={() => zoomIn({ duration: 250 })} title="Zoom in (+)">
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 min-hit" onClick={() => zoomOut({ duration: 250 })} title="Zoom out (-)">
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 min-hit" onClick={() => fitView({ duration: 600, padding: 0.2 })} title="Fit view (Space)">
          <Maximize2 className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 min-hit" onClick={fitToSelection} title="Zoom to selection">
          <Crosshair className="h-4 w-4" />
        </Button>
      </div>
    </Panel>
  );
}
