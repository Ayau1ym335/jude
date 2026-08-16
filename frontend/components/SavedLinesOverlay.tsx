"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { ModelViewerHandle } from "@/components/ModelViewer";

type XYZ = [number, number, number];

export interface SavedLineRecord {
  id: string;
  version_id: string;
  line_type: string;
  geometry_data: {
    anchor_points: XYZ[];
    curve_points: XYZ[];
  };
}

interface SavedLinesOverlayProps {
  viewerRef: RefObject<ModelViewerHandle | null>;
  savedLines: SavedLineRecord[];
  activeLineType?: string | null;
}

const LINE_COLORS: Record<string, string> = {
  proximal: "#8b5cf6", // violet-500
  ankle: "#3b82f6",    // blue-500
  distal: "#10b981",   // emerald-500
};

function projectToScreen(
  point: XYZ,
  camera: import("three").PerspectiveCamera,
  rect: DOMRect,
  THREE: typeof import("three")
): { x: number; y: number } {
  const v = new THREE.Vector3(...point);
  v.project(camera);
  return {
    x: ((v.x + 1) / 2) * rect.width,
    y: ((-v.y + 1) / 2) * rect.height,
  };
}

export default function SavedLinesOverlay({
  viewerRef,
  savedLines,
  activeLineType,
}: SavedLinesOverlayProps) {
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const threeRef = useRef<typeof import("three") | null>(null);

  useEffect(() => {
    let rafId: number;
    let cancelled = false;

    async function getThree() {
      if (!threeRef.current) {
        threeRef.current = await import("three");
      }
      return threeRef.current;
    }

    async function drawFrame() {
      if (cancelled) return;

      const canvas = overlayRef.current;
      const viewer = viewerRef.current;
      if (!canvas || !viewer || savedLines.length === 0) {
        if (canvas) {
          const ctx = canvas.getContext("2d");
          ctx?.clearRect(0, 0, canvas.width, canvas.height);
        }
        rafId = requestAnimationFrame(drawFrame);
        return;
      }

      const camera = viewer.getCamera();
      const renderer = viewer.getRenderer();
      if (!camera || !renderer) {
        rafId = requestAnimationFrame(drawFrame);
        return;
      }

      const THREE = await getThree();
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const domRect = renderer.domElement.getBoundingClientRect();
      canvas.width = domRect.width;
      canvas.height = domRect.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const line of savedLines) {
        // Не рисуем линию, если она сейчас редактируется
        if (line.line_type === activeLineType) continue;

        const curvePts = line.geometry_data.curve_points || [];
        if (curvePts.length < 2) continue;

        const color = LINE_COLORS[line.line_type] || "#ef4444";

        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";

        for (let i = 0; i < curvePts.length; i++) {
          const { x, y } = projectToScreen(curvePts[i], camera, domRect, THREE);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      rafId = requestAnimationFrame(drawFrame);
    }

    void drawFrame();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      const canvas = overlayRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
  }, [savedLines, activeLineType, viewerRef]);

  return (
    <canvas
      ref={overlayRef}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 22, // над LineHintOverlay (20), под TrimLineDrawer (25)
      }}
    />
  );
}
