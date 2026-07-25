"use client";

/**
 * TrimLineDrawer.tsx
 *
 * Компонент рисования геодезической линии на поверхности 3D-скана.
 *
 * Особенности реализации:
 * - Стек: нативный Three.js (без @react-three/fiber / @react-three/drei).
 *   Вместо <Line> и <Sphere> из drei используется HTML5 Canvas overlay +
 *   проекция 3D→2D через Vector3.project(camera).
 * - Overlay перерисовывается каждый requestAnimationFrame, чтобы кривая
 *   корректно отображалась при вращении камеры.
 * - Raycast подписывается на события renderer.domElement напрямую.
 * - Drag опорных точек: pointerdown/move/up на renderer.domElement;
 *   во время drag OrbitControls отключаются через setControlsEnabled().
 * - Drag завершён — fetchCurve() вызывается финально; во время движения
 *   позиция обновляется только визуально (через anchorPointsRef).
 */

import {
  useState,
  useCallback,
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";
import type { ModelViewerHandle } from "@/components/ModelViewer";
import type React from "react";

// ─── Типы ────────────────────────────────────────────────────────────────────

export type XYZ = [number, number, number];

export interface SavedLine {
  lineType: string;
  anchorPoints: XYZ[];
  curvePoints: XYZ[];
}

export interface TrimLineDrawerHandle {
  /** Удаляет последнюю опорную точку и пересчитывает кривую */
  removeLastPoint: () => void;
  /** Завершает рисование, вызывает onSave */
  finishDrawing: () => void;
  /** Сбрасывает все точки и кривую */
  reset: () => void;
}

interface TrimLineDrawerProps {
  viewerRef: React.RefObject<ModelViewerHandle | null>;
  scanId: string;
  lineType?: string;
  existingPoints?: XYZ[];
  onSave?: (data: SavedLine) => void;
  onStateChange?: (state: {
    isDrawing: boolean;
    pointsCount: number;
    loading: boolean;
  }) => void;
}

// ─── Утилиты ─────────────────────────────────────────────────────────────────

/** Проецирует 3D-координату в экранную систему Canvas-оверлея */
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

/** Синхронный raycast (Three.js уже загружен в бандл) */
function raycastSync(
  clientX: number,
  clientY: number,
  mesh: import("three").Mesh,
  camera: import("three").PerspectiveCamera,
  renderer: import("three").WebGLRenderer,
  THREE: typeof import("three")
): XYZ | null {
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObject(mesh);
  if (hits.length === 0) return null;
  const p = hits[0].point;
  return [p.x, p.y, p.z];
}

/** Создаёт debounce-функцию */
function debounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  ms: number
): T & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const debounced = (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  debounced.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return debounced as T & { cancel: () => void };
}

/** Euclidean distance в 2D */
function dist2D(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}

const DRAG_HIT_RADIUS = 14; // px вокруг точки — зона захвата drag

// ─── Компонент ───────────────────────────────────────────────────────────────

const TrimLineDrawer = forwardRef<TrimLineDrawerHandle, TrimLineDrawerProps>(
  function TrimLineDrawer(
    {
      viewerRef,
      scanId,
      lineType = "trim",
      existingPoints = [],
      onSave,
      onStateChange,
    },
    ref
  ) {
    const [anchorPoints, setAnchorPoints] = useState<XYZ[]>(existingPoints);
    const [curvePoints, setCurvePoints] = useState<XYZ[]>([]);
    const [isDrawing, setIsDrawing] = useState(existingPoints.length === 0);
    const [loading, setLoading] = useState(false);
    // Индекс точки, которую сейчас тащат (-1 = нет)
    const [draggingIdx, setDraggingIdx] = useState(-1);

    const overlayRef = useRef<HTMLCanvasElement | null>(null);

    // Ref-копии состояний для использования в нативных event-listener'ах
    const isDrawingRef = useRef(isDrawing);
    isDrawingRef.current = isDrawing;
    const anchorPointsRef = useRef(anchorPoints);
    anchorPointsRef.current = anchorPoints;
    const draggingIdxRef = useRef(draggingIdx);
    draggingIdxRef.current = draggingIdx;

    // Кэш модуля three (загружается один раз)
    const threeRef = useRef<typeof import("three") | null>(null);
    // true если pointerdown попал на существующую точку (drag); false = клик на пустое место
    const pointerDownOnPointRef = useRef(false);

    // Уведомление родителя
    useEffect(() => {
      onStateChange?.({ isDrawing, pointsCount: anchorPoints.length, loading });
    }, [isDrawing, anchorPoints.length, loading, onStateChange]);

    // ─── Запрос кривой ────────────────────────────────────────────────────────
    const fetchCurve = useCallback(
      async (points: XYZ[]) => {
        if (points.length < 2) {
          setCurvePoints([]);
          return;
        }
        setLoading(true);
        const apiUrl =
          process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
        const start = performance.now();
        try {
          const res = await fetch(`${apiUrl}/geometry/geodesic-curve`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scan_id: scanId, click_points: points }),
          });
          const elapsed = Math.round(performance.now() - start);
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            console.error(
              "[TrimLineDrawer] API error:",
              (err as { detail?: string }).detail ?? res.statusText
            );
            return;
          }
          const data = (await res.json()) as { curve_points: XYZ[] };
          setCurvePoints(data.curve_points);
          console.log(`[TrimLineDrawer] кривая ${data.curve_points.length} pt | ${elapsed} ms`);
          if (elapsed > 3000) {
            console.warn(`[TrimLineDrawer] ⚠️ ${elapsed} ms > 3000 ms — см. docs/blockers.md`);
          }
        } catch (e) {
          console.error("[TrimLineDrawer] fetch error:", e);
        } finally {
          setLoading(false);
        }
      },
      [scanId]
    );

    // Debounced версия fetchCurve (250 мс) — для drag
    const fetchCurveDebounced = useRef(
      debounce((pts: XYZ[]) => void fetchCurve(pts), 250)
    );
    // Обновляем debounced-ссылку при смене fetchCurve
    useEffect(() => {
      fetchCurveDebounced.current = debounce(
        (pts: XYZ[]) => void fetchCurve(pts),
        250
      );
    }, [fetchCurve]);

    // ─── Вспомогательный: получить Three и нативные объекты вьюера ───────────
    const getThreeAndViewer = useCallback(async () => {
      const viewer = viewerRef.current;
      if (!viewer) return null;
      const mesh = viewer.getMesh();
      const camera = viewer.getCamera();
      const renderer = viewer.getRenderer();
      if (!mesh || !camera || !renderer) return null;
      if (!threeRef.current) {
        threeRef.current = await import("three");
      }
      return { THREE: threeRef.current, mesh, camera, renderer, viewer };
    }, [viewerRef]);

    // ─── Клик: добавление новой точки ────────────────────────────────────────
    const handlePointerDown = useCallback(
      async (event: PointerEvent) => {
        pointerDownOnPointRef.current = false;
        const ctx = await getThreeAndViewer();
        if (!ctx) return;
        const { THREE, camera, renderer } = ctx;

        const currentPoints = anchorPointsRef.current;
        const rect = renderer.domElement.getBoundingClientRect();
        const localX = event.clientX - rect.left;
        const localY = event.clientY - rect.top;

        // Проверяем, попали ли в зону захвата существующей точки
        for (let i = 0; i < currentPoints.length; i++) {
          const { x, y } = projectToScreen(currentPoints[i], camera, renderer, THREE);
          if (dist2D(localX, localY, x, y) <= DRAG_HIT_RADIUS) {
            event.preventDefault();
            event.stopPropagation();
            pointerDownOnPointRef.current = true;
            draggingIdxRef.current = i;
            setDraggingIdx(i);
            viewerRef.current?.setControlsEnabled(false);
            renderer.domElement.setPointerCapture(event.pointerId);
            return;
          }
        }
      },
      [getThreeAndViewer, viewerRef]
    );

    const handlePointerMove = useCallback(
      async (event: PointerEvent) => {
        const idx = draggingIdxRef.current;
        if (idx === -1) return;

        const ctx = await getThreeAndViewer();
        if (!ctx) return;
        const { THREE, mesh, camera, renderer } = ctx;

        const newPos = raycastSync(
          event.clientX,
          event.clientY,
          mesh,
          camera,
          renderer,
          THREE
        );
        if (!newPos) return; // промахнулись мимо mesh — держим последнюю позицию

        // Обновляем точку немедленно через ref (без setState — избегаем re-render на каждый пиксель)
        const updated = [...anchorPointsRef.current];
        updated[idx] = newPos;
        anchorPointsRef.current = updated;
        // React state обновляем тоже, но только чтобы тригернуть перерисовку overlay
        setAnchorPoints([...updated]);

        // fetchCurve с debounce
        fetchCurveDebounced.current(updated);
      },
      [getThreeAndViewer]
    );

    const handlePointerUp = useCallback(
      async (event: PointerEvent) => {
        const idx = draggingIdxRef.current;

        if (idx !== -1) {
          // Завершаем drag существующей точки
          draggingIdxRef.current = -1;
          setDraggingIdx(-1);
          viewerRef.current?.setControlsEnabled(true);
          fetchCurveDebounced.current.cancel();
          void fetchCurve(anchorPointsRef.current);
          return;
        }

        // Обычный клик — добавляем новую точку только если pointerdown НЕ попал на точку
        if (pointerDownOnPointRef.current) return;
        if (!isDrawingRef.current) return;

        const ctx = await getThreeAndViewer();
        if (!ctx) return;
        const { THREE, mesh, camera, renderer } = ctx;
        const newPos = raycastSync(event.clientX, event.clientY, mesh, camera, renderer, THREE);
        if (!newPos) return;

        const newPoints = [...anchorPointsRef.current, newPos];
        setAnchorPoints(newPoints);
        void fetchCurve(newPoints);
      },
      [getThreeAndViewer, fetchCurve, viewerRef]
    );

    // Подписка на pointer-события WebGL canvas
    useEffect(() => {
      const viewer = viewerRef.current;
      if (!viewer) return;
      const renderer = viewer.getRenderer();
      if (!renderer) return;
      const el = renderer.domElement;

      el.addEventListener("pointerdown", handlePointerDown);
      el.addEventListener("pointermove", handlePointerMove);
      el.addEventListener("pointerup", handlePointerUp);

      return () => {
        el.removeEventListener("pointerdown", handlePointerDown);
        el.removeEventListener("pointermove", handlePointerMove);
        el.removeEventListener("pointerup", handlePointerUp);
        // Восстанавливаем controls при размонтировании
        viewer.setControlsEnabled(true);
      };
    }, [viewerRef, handlePointerDown, handlePointerMove, handlePointerUp]);

    // ─── Рисование overlay ───────────────────────────────────────────────────
    const drawOverlay = useCallback(async () => {
      const canvas = overlayRef.current;
      const viewer = viewerRef.current;
      if (!canvas || !viewer) return;

      const camera = viewer.getCamera();
      const renderer = viewer.getRenderer();
      if (!camera || !renderer) return;

      if (!threeRef.current) {
        threeRef.current = await import("three");
      }
      const THREE = threeRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const rect = renderer.domElement.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // — Геодезическая кривая —
      if (curvePoints.length >= 2) {
        ctx.beginPath();
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth = 3;
        ctx.shadowColor = "rgba(239,68,68,0.6)";
        ctx.shadowBlur = 6;
        for (let i = 0; i < curvePoints.length; i++) {
          const { x, y } = projectToScreen(curvePoints[i], camera, renderer, THREE);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // — Опорные точки —
      for (let i = 0; i < anchorPoints.length; i++) {
        const { x, y } = projectToScreen(anchorPoints[i], camera, renderer, THREE);
        const isDragging = i === draggingIdx;

        // Внешнее свечение
        ctx.beginPath();
        ctx.arc(x, y, isDragging ? 14 : 9, 0, Math.PI * 2);
        ctx.fillStyle = isDragging
          ? "rgba(251,146,60,0.3)"   // оранжевое при drag
          : "rgba(234,179,8,0.25)";
        ctx.fill();

        // Заливка
        ctx.beginPath();
        ctx.arc(x, y, isDragging ? 9 : 6, 0, Math.PI * 2);
        ctx.fillStyle = isDragging
          ? "#f97316"   // оранжевая при drag
          : i === anchorPoints.length - 1 ? "#eab308" : "#fde047";
        ctx.strokeStyle = "white";
        ctx.lineWidth = isDragging ? 2.5 : 1.5;
        ctx.fill();
        ctx.stroke();

        // Номер точки
        ctx.fillStyle = "#1a1a1a";
        ctx.font = `bold ${isDragging ? 10 : 9}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(i + 1), x, y);
      }

      // — Курсор-подсказка "захват" над точками (при isDrawing) —
      // (реализовано на уровне CSS cursor, см. style overlay canvas ниже)

      // — Индикатор загрузки —
      if (loading) {
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(canvas.width / 2 - 90, canvas.height / 2 - 14, 180, 28);
        ctx.fillStyle = "white";
        ctx.font = "12px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("Строю кривую...", canvas.width / 2, canvas.height / 2);
      }
    }, [curvePoints, anchorPoints, loading, draggingIdx, viewerRef]);

    // RAF-loop
    useEffect(() => {
      let raf: number;
      const loop = () => {
        drawOverlay();
        raf = requestAnimationFrame(loop);
      };
      if (anchorPoints.length > 0 || curvePoints.length > 0) {
        raf = requestAnimationFrame(loop);
      }
      return () => cancelAnimationFrame(raf);
    }, [drawOverlay, anchorPoints.length, curvePoints.length]);

    // ─── Публичные методы ─────────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      removeLastPoint: () => {
        setAnchorPoints((prev) => {
          const newPoints = prev.slice(0, -1);
          void fetchCurve(newPoints);
          return newPoints;
        });
      },
      finishDrawing: () => {
        setIsDrawing(false);
        onSave?.({
          lineType,
          anchorPoints: anchorPointsRef.current,
          curvePoints,
        });
        console.log("[TrimLineDrawer] сохранено:", {
          lineType,
          points: anchorPointsRef.current.length,
          curveLen: curvePoints.length,
        });
      },
      reset: () => {
        fetchCurveDebounced.current.cancel();
        setAnchorPoints([]);
        setCurvePoints([]);
        setDraggingIdx(-1);
        setIsDrawing(true);
        viewerRef.current?.setControlsEnabled(true);
        const canvas = overlayRef.current;
        if (canvas) {
          const ctx2d = canvas.getContext("2d");
          ctx2d?.clearRect(0, 0, canvas.width, canvas.height);
        }
      },
    }));

    // ─── Render ───────────────────────────────────────────────────────────────
    return (
      <canvas
        ref={overlayRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          // Overlay не перехватывает события — pointer-события идут на renderer.domElement
          pointerEvents: "none",
          zIndex: 25,
          // Изменяем курсор через CSS на элементе-контейнере в зависимости от состояния drag
          cursor: draggingIdx !== -1 ? "grabbing" : "crosshair",
        }}
      />
    );
  }
);

TrimLineDrawer.displayName = "TrimLineDrawer";
export default TrimLineDrawer;
