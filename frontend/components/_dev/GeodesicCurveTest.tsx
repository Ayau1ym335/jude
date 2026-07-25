"use client";

/**
 * _dev/GeodesicCurveTest.tsx
 *
 * End-to-end тест: клик → POST /api/geometry/geodesic-curve → отображение кривой.
 *
 * НЕ включать в продакшн-код.
 *
 * После 2-го и последующих кликов отправляет запрос на бекенд и рисует
 * красную ломаную линию поверх Canvas через HTML5 Canvas overlay (т.к.
 * проект не использует @react-three/fiber и @react-three/drei).
 */

import { useState, useCallback, useEffect, useRef } from "react";
import type { ModelViewerHandle } from "@/components/ModelViewer";
import type React from "react";

interface GeodesicCurveTestProps {
  viewerRef: React.RefObject<ModelViewerHandle | null>;
  scanId: string;
}

type XYZ = [number, number, number];

/** Проецирует 3D-точку в экранные координаты через THREE */
function projectToScreen(
  point: XYZ,
  camera: import("three").PerspectiveCamera,
  renderer: import("three").WebGLRenderer,
  THREE: typeof import("three")
): { x: number; y: number } {
  const v = new THREE.Vector3(...point);
  v.project(camera);
  const rect = renderer.domElement.getBoundingClientRect();
  return {
    x: ((v.x + 1) / 2) * rect.width,
    y: ((-v.y + 1) / 2) * rect.height,
  };
}

export default function GeodesicCurveTest({ viewerRef, scanId }: GeodesicCurveTestProps) {
  const [clickPoints, setClickPoints] = useState<XYZ[]>([]);
  const [curvePoints, setCurvePoints] = useState<XYZ[]>([]);
  const [status, setStatus] = useState<string>("");
  const [enabled, setEnabled] = useState(false);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);

  // Рисуем кривую на overlay-canvas каждый раз при изменении curvePoints
  const drawCurve = useCallback(async () => {
    const canvas = overlayRef.current;
    const viewer = viewerRef.current;
    if (!canvas || !viewer || curvePoints.length < 2) return;

    const camera = viewer.getCamera();
    const renderer = viewer.getRenderer();
    if (!camera || !renderer) return;

    const THREE = await import("three");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = renderer.domElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Рисуем кривую
    ctx.beginPath();
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 2.5;
    ctx.shadowColor = "#ef4444";
    ctx.shadowBlur = 4;

    for (let i = 0; i < curvePoints.length; i++) {
      const { x, y } = projectToScreen(curvePoints[i], camera, renderer, THREE);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Рисуем опорные точки клика
    for (const p of clickPoints) {
      const { x, y } = projectToScreen(p, camera, renderer, THREE);
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fillStyle = "#3b82f6";
      ctx.shadowColor = "#3b82f6";
      ctx.shadowBlur = 8;
      ctx.fill();
    }
  }, [curvePoints, clickPoints, viewerRef]);

  // Перерисовываем при каждом кадре (т.к. камера может двигаться)
  useEffect(() => {
    let raf: number;
    const loop = () => {
      drawCurve();
      raf = requestAnimationFrame(loop);
    };
    if (curvePoints.length >= 2 || clickPoints.length > 0) {
      raf = requestAnimationFrame(loop);
    }
    return () => cancelAnimationFrame(raf);
  }, [drawCurve, curvePoints.length, clickPoints.length]);

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

      if (hits.length === 0) {
        console.log("[GeodesicTest] Клик мимо меша");
        return;
      }

      const p = hits[0].point;
      const point: XYZ = [p.x, p.y, p.z];
      console.log(`[GeodesicTest] Точка ${clickPoints.length + 1}:`, point);

      const newPoints = [...clickPoints, point];
      setClickPoints(newPoints);

      if (newPoints.length >= 2) {
        setStatus("⏳ Запрос геодезической кривой...");
        const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
        const start = performance.now();

        try {
          const response = await fetch(`${apiUrl}/geometry/geodesic-curve`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scan_id: scanId, click_points: newPoints }),
          });

          const elapsed = Math.round(performance.now() - start);
          if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            const msg = (err as { detail?: string }).detail ?? response.statusText;
            setStatus(`❌ Ошибка: ${msg}`);
            console.error("[GeodesicTest] API error:", msg);
            return;
          }

          const data = (await response.json()) as { curve_points: XYZ[] };
          setCurvePoints(data.curve_points);
          setStatus(`✅ Кривая: ${data.curve_points.length} точек | ${elapsed} мс`);
          console.log(`[GeodesicTest] Запрос занял ${elapsed} мс, точек: ${data.curve_points.length}`);

          if (elapsed > 3000) {
            console.warn(
              `[GeodesicTest] ⚠️ Время ответа ${elapsed} мс > 3000 мс — зафиксировать в docs/blockers.md`
            );
          }
        } catch (err) {
          setStatus(`❌ Сеть: ${err instanceof Error ? err.message : String(err)}`);
          console.error("[GeodesicTest] fetch error:", err);
        }
      }
    },
    [enabled, viewerRef, scanId, clickPoints]
  );

  // Подписка на click на canvas
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

  const reset = () => {
    setClickPoints([]);
    setCurvePoints([]);
    setStatus("");
    const canvas = overlayRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 30 }}>
      {/* HTML5 Canvas для рисования кривой поверх 3D-сцены */}
      <canvas
        ref={overlayRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      />

      {/* Панель управления */}
      <div
        style={{
          position: "absolute",
          bottom: 12,
          right: 12,
          pointerEvents: "auto",
          background: "rgba(0,0,0,0.8)",
          color: "white",
          borderRadius: 8,
          padding: "10px 14px",
          fontSize: 12,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          backdropFilter: "blur(8px)",
          minWidth: 220,
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 13 }}>📐 GeodesicCurveTest [DEV]</span>
        <span style={{ opacity: 0.7, fontSize: 11 }}>scan: {scanId.slice(0, 8)}…</span>

        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => {
              setEnabled(e.target.checked);
              if (!e.target.checked) reset();
            }}
            style={{ pointerEvents: "auto" }}
          />
          Режим геодезической кривой
        </label>

        {enabled && (
          <p style={{ opacity: 0.75, fontSize: 11 }}>
            {clickPoints.length === 0
              ? "Кликните на поверхность (1-я точка)"
              : clickPoints.length === 1
              ? "Кликните ещё раз (2-я точка)"
              : `Опорные точки: ${clickPoints.length} — клик добавит ещё`}
          </p>
        )}

        {status && (
          <p style={{ fontSize: 11, opacity: 0.9 }}>{status}</p>
        )}

        {(clickPoints.length > 0 || curvePoints.length > 0) && (
          <button
            onClick={reset}
            style={{
              background: "rgba(255,255,255,0.15)",
              border: "none",
              color: "white",
              borderRadius: 4,
              padding: "3px 10px",
              cursor: "pointer",
              pointerEvents: "auto",
              fontSize: 11,
            }}
          >
            Сбросить
          </button>
        )}
      </div>
    </div>
  );
}
