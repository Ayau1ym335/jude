"use client";

/**
 * LineHintOverlay.tsx
 *
 * Визуальная подсказка примерного расположения трёх PLS-линий обрезки.
 * Рисуется поверх 3D-вьюера через HTML5 Canvas overlay — точно так же,
 * как TrimLineDrawer (нативный Three.js без R3F/drei).
 *
 * Overlay перерисовывается каждый requestAnimationFrame, чтобы полоска
 * оставалась корректной при вращении камеры.
 *
 * ───────────────────────────────────────────────────────────────────────
 * КАЛИБРОВКА КОЭФФИЦИЕНТОВ (2026-07-25)
 * ───────────────────────────────────────────────────────────────────────
 * Стартовые пропорции определены эвристически по анатомии PLS:
 *
 *   proximal  0.82  — верхний край шины, ~нижняя треть голени
 *   ankle     0.32  — уровень лодыжки, чуть выше пяточной зоны
 *   distal    0.08  — дистальный край, у основания плюсны
 *
 * Основание: пропорции взяты из типичного соотношения «высота
 * голеностопного блока : высота всей стопы» ≈ 1:3 для PLS.
 *
 * ⚠️  НЕ клинически провалидированные значения.
 * ⚠️  Требуют калибровки на реальных сканах пациентов разного роста
 *     и конституции совместно с клиническим техником.
 * ⚠️  После калибровки обновить эти комментарии: указать ID скана,
 *     ФИО техника и дату проверки.
 * ───────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, type RefObject } from "react";
import type { ModelViewerHandle } from "@/components/ModelViewer";

// ─── Типы ────────────────────────────────────────────────────────────────────

type LineType = "proximal" | "ankle" | "distal";

interface LineHintOverlayProps {
  viewerRef: RefObject<ModelViewerHandle | null>;
  activeLineType: LineType | null;
}

// ─── Конфигурация ────────────────────────────────────────────────────────────

/**
 * Коэффициенты высоты относительно bounding box модели (0 = низ, 1 = верх).
 * Эвристика для PLS; требуют клинической калибровки по реальным сканам.
 */
const HINT_Y_RATIOS: Record<LineType, number> = {
  proximal: 0.82, // ~верхний край голеностопной шины
  ankle: 0.32,    // ~уровень лодыжки
  distal: 0.08,   // ~дистальный край, основание плюсны
};

/** Ширина полосы как доля от ширины bounding box */
const BAND_HALF_WIDTH_RATIO = 0.6;

/** Визуальные свойства подсказки */
const HINT_CONFIG: Record<
  LineType,
  { fill: string; stroke: string; label: string }
> = {
  proximal: {
    fill: "rgba(139, 92, 246, 0.12)", // фиолетовый
    stroke: "rgba(139, 92, 246, 0.55)",
    label: "Проксимальная линия",
  },
  ankle: {
    fill: "rgba(59, 130, 246, 0.12)", // синий
    stroke: "rgba(59, 130, 246, 0.55)",
    label: "Линия голеностопа",
  },
  distal: {
    fill: "rgba(16, 185, 129, 0.12)", // зелёный
    stroke: "rgba(16, 185, 129, 0.55)",
    label: "Дистальная линия",
  },
};

/** Количество точек по горизонтали для построения проецируемой полосы */
const BAND_SEGMENTS = 24;
/** Полутолщина полосы в мировых единицах (относительно высоты модели) */
const BAND_HALF_HEIGHT_RATIO = 0.03;

// ─── Компонент ───────────────────────────────────────────────────────────────

export default function LineHintOverlay({
  viewerRef,
  activeLineType,
}: LineHintOverlayProps) {
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  // Кэш модуля three (загружается один раз)
  const threeRef = useRef<typeof import("three") | null>(null);

  useEffect(() => {
    if (!activeLineType) return;

    // Захватываем тип в замыкании — activeLineType гарантированно не null здесь,
    // т.к. useEffect зависит от него и мы проверили !activeLineType выше.
    const lineType = activeLineType; // LineType (not null)

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
      if (!canvas || !viewer) {
        rafId = requestAnimationFrame(drawFrame);
        return;
      }

      const camera = viewer.getCamera();
      const renderer = viewer.getRenderer();
      const box = viewer.getBoundingBox();
      if (!camera || !renderer || !box) {
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

      // ── Вычисляем Y в мировых координатах ─────────────────────────────
      const { min, max } = box;
      const height = max.y - min.y;
      const centerY = min.y + height * HINT_Y_RATIOS[lineType];
      const halfH = height * BAND_HALF_HEIGHT_RATIO;
      const halfW = (max.x - min.x) * BAND_HALF_WIDTH_RATIO;

      // ── Проецируем горизонтальную полосу ──────────────────────────────
      // Строим две горизонтальные линии (верхнюю и нижнюю кромку полосы)
      // из набора 3D-точек, проецируем каждую в 2D.
      function project(x: number, y: number, z: number): { x: number; y: number } {
        const v = new THREE.Vector3(x, y, z);
        v.project(camera!);
        return {
          x: ((v.x + 1) / 2) * domRect.width,
          y: ((-v.y + 1) / 2) * domRect.height,
        };
      }

      // Точки нижней и верхней кромки полосы
      const topPts: { x: number; y: number }[] = [];
      const botPts: { x: number; y: number }[] = [];

      // Используем среднюю Z модели для плоской полосы
      const midZ = (min.z + max.z) / 2;

      for (let i = 0; i <= BAND_SEGMENTS; i++) {
        // Равномерно от -halfW до +halfW в мировом X
        const wx = -halfW + (2 * halfW * i) / BAND_SEGMENTS;
        topPts.push(project(wx, centerY + halfH, midZ));
        botPts.push(project(wx, centerY - halfH, midZ));
      }

      const config = HINT_CONFIG[lineType];

      // Рисуем закрашенную полосу (top → bottom по периметру)
      ctx.beginPath();
      topPts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      // bottom в обратном порядке, чтобы замкнуть контур
      for (let i = botPts.length - 1; i >= 0; i--) {
        ctx.lineTo(botPts[i].x, botPts[i].y);
      }
      ctx.closePath();
      ctx.fillStyle = config.fill;
      ctx.fill();

      // Центральная линия
      const midPts = topPts.map((t, i) => ({
        x: (t.x + botPts[i].x) / 2,
        y: (t.y + botPts[i].y) / 2,
      }));
      ctx.beginPath();
      midPts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.strokeStyle = config.stroke;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Метка (по центру экрана на уровне линии)
      const midIdx = Math.floor(midPts.length / 2);
      const labelPt = midPts[midIdx];
      if (labelPt) {
        const text = config.label;
        ctx.font = "bold 11px -apple-system, system-ui, sans-serif";
        const tw = ctx.measureText(text).width;
        const px = Math.min(Math.max(labelPt.x, tw / 2 + 8), domRect.width - tw / 2 - 8);
        const py = Math.max(labelPt.y - 10, 16);

        // Фон метки
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.beginPath();
        ctx.roundRect(px - tw / 2 - 6, py - 9, tw + 12, 18, 4);
        ctx.fill();

        ctx.fillStyle = "white";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, px, py);
      }

      rafId = requestAnimationFrame(drawFrame);
    }

    void drawFrame();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      // Очищаем canvas при смене активной линии или размонтировании
      const canvas = overlayRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
  }, [activeLineType, viewerRef]);

  // Когда нет активной линии — очищаем canvas
  useEffect(() => {
    if (activeLineType) return;
    const canvas = overlayRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, [activeLineType]);

  return (
    <canvas
      ref={overlayRef}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 20, // под TrimLineDrawer (z=25), над 3D canvas
      }}
    />
  );
}
