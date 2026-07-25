"use client";

/**
 * _dev/RaycastTest.tsx
 *
 * Временный dev-компонент для тестирования raycasting на поверхности скана.
 * НЕ включать в продакшн-код.
 *
 * Использование: передать viewerRef и scanId в компонент.
 * При клике на Canvas выводит 3D-координаты в console.log и
 * отображает маркер (красная точка) поверх Canvas в HTML-оверлее.
 *
 * Маркер позиционируется как overlay над Canvas (не в 3D-сцене, т.к.
 * проект не использует @react-three/fiber).
 */

import { useState, useCallback, useEffect } from "react";
import type { ModelViewerHandle } from "@/components/ModelViewer";
import type React from "react";

interface ClickMarker {
  id: number;
  point: [number, number, number];
  screenX: number;
  screenY: number;
}

interface RaycastTestProps {
  viewerRef: React.RefObject<ModelViewerHandle | null>;
  scanId: string;
}

export default function RaycastTest({ viewerRef, scanId }: RaycastTestProps) {
  const [markers, setMarkers] = useState<ClickMarker[]>([]);
  const [enabled, setEnabled] = useState(false);

  const handleCanvasClick = useCallback(
    async (event: MouseEvent) => {
      if (!enabled) return;
      const viewer = viewerRef.current;
      if (!viewer) return;

      const mesh = viewer.getMesh();
      const camera = viewer.getCamera();
      const renderer = viewer.getRenderer();
      if (!mesh || !camera || !renderer) return;

      const { Raycaster, Vector2 } = await import("three");
      const raycaster = new Raycaster();
      const mouse = new Vector2();
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObject(mesh);

      if (hits.length > 0) {
        const p = hits[0].point;
        const point: [number, number, number] = [p.x, p.y, p.z];
        console.log(
          `[RaycastTest] Клик на скане ${scanId}: [${point.map((v) => v.toFixed(4)).join(", ")}]`
        );

        // Экранные координаты для HTML-маркера
        const screenX = event.clientX - rect.left;
        const screenY = event.clientY - rect.top;

        setMarkers((prev) => [
          ...prev,
          { id: Date.now(), point, screenX, screenY },
        ]);
      } else {
        console.log("[RaycastTest] Клик мимо меша");
      }
    },
    [enabled, viewerRef, scanId]
  );

  // Подписываемся на click события canvas-элемента напрямую
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const renderer = viewer.getRenderer();
    if (!renderer) return;
    renderer.domElement.addEventListener("click", handleCanvasClick);
    return () => {
      renderer.domElement.removeEventListener("click", handleCanvasClick);
    };
  }, [viewerRef, handleCanvasClick]);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 30,
      }}
    >
      {/* Контрольная панель */}
      <div
        style={{
          position: "absolute",
          bottom: 12,
          right: 12,
          pointerEvents: "auto",
          background: "rgba(0,0,0,0.75)",
          color: "white",
          borderRadius: 8,
          padding: "8px 12px",
          fontSize: 12,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          backdropFilter: "blur(6px)",
        }}
      >
        <span style={{ fontWeight: 600 }}>🔬 RaycastTest [DEV]</span>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => {
              setEnabled(e.target.checked);
              if (!e.target.checked) setMarkers([]);
            }}
            style={{ pointerEvents: "auto" }}
          />
          Режим клика
        </label>
        {markers.length > 0 && (
          <button
            onClick={() => setMarkers([])}
            style={{
              background: "rgba(255,255,255,0.15)",
              border: "none",
              color: "white",
              borderRadius: 4,
              padding: "2px 8px",
              cursor: "pointer",
              pointerEvents: "auto",
            }}
          >
            Очистить ({markers.length})
          </button>
        )}
        {markers.length > 0 && (
          <div style={{ opacity: 0.8, maxHeight: 120, overflowY: "auto" }}>
            {markers.map((m) => (
              <div key={m.id} style={{ fontFamily: "monospace", fontSize: 11 }}>
                [{m.point.map((v) => v.toFixed(3)).join(", ")}]
              </div>
            ))}
          </div>
        )}
      </div>

      {/* HTML-маркеры поверх Canvas */}
      {markers.map((m) => (
        <div
          key={m.id}
          style={{
            position: "absolute",
            left: m.screenX - 6,
            top: m.screenY - 6,
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: "#ef4444",
            border: "2px solid white",
            boxShadow: "0 0 6px rgba(239,68,68,0.8)",
          }}
          title={`[${m.point.map((v) => v.toFixed(3)).join(", ")}]`}
        />
      ))}
    </div>
  );
}
