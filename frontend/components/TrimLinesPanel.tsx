"use client";

/**
 * TrimLinesPanel.tsx
 *
 * Панель управления тремя референсными линиями обрезки PLS:
 *   - proximal (верхняя, проксимальная)
 *   - ankle (линия голеностопа)
 *   - distal (дистальная, линия стопы)
 *
 * Отображается поверх 3D-вьюера как overlay.
 * Загружает сохранённые линии при монтировании,
 * позволяет рисовать/перерисовывать каждую линию независимо.
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type RefObject,
} from "react";

import TrimLineDrawer, {
  type TrimLineDrawerHandle,
  type SavedLine,
} from "@/components/TrimLineDrawer";
import TrimLineControls from "@/components/TrimLineControls";
import LineHintOverlay from "@/components/LineHintOverlay";
import type { ModelViewerHandle } from "@/components/ModelViewer";

// ─── Типы ────────────────────────────────────────────────────────────────────

type LineType = "proximal" | "ankle" | "distal";

interface SavedLineRecord {
  id: string;
  version_id: string;
  line_type: LineType;
  geometry_data: {
    anchor_points: [number, number, number][];
    curve_points: [number, number, number][];
  };
}

interface TrimLinesPanelProps {
  viewerRef: RefObject<ModelViewerHandle | null>;
  scanId: string;
  versionId: string;
}

// ─── Конфигурация ────────────────────────────────────────────────────────────

const LINE_LABELS: Record<LineType, string> = {
  proximal: "Верхняя линия (проксимальная)",
  ankle: "Линия голеностопа",
  distal: "Линия стопы (дистальная)",
};

const LINE_ORDER: LineType[] = ["proximal", "ankle", "distal"];

const LINE_COLORS: Record<LineType, string> = {
  proximal: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  ankle: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  distal: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
};

// ─── Компонент ───────────────────────────────────────────────────────────────

export default function TrimLinesPanel({
  viewerRef,
  scanId,
  versionId,
}: TrimLinesPanelProps) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

  // Сохранённые линии по типу
  const [savedLines, setSavedLines] = useState<
    Partial<Record<LineType, SavedLineRecord>>
  >({});
  // Какая линия сейчас рисуется
  const [activeLineType, setActiveLineType] = useState<LineType | null>(null);
  // Состояние TrimLineDrawer (синхронизируется через onStateChange)
  const [drawerState, setDrawerState] = useState({
    isDrawing: true,
    pointsCount: 0,
    loading: false,
  });

  const drawerRef = useRef<TrimLineDrawerHandle>(null);

  // ─── Загрузка сохранённых линий ──────────────────────────────────────────

  useEffect(() => {
    if (!versionId) return;

    async function loadLines() {
      try {
        const res = await fetch(`${apiUrl}/trim-lines/${versionId}`);
        if (!res.ok) return;
        const lines = (await res.json()) as SavedLineRecord[];
        const byType: Partial<Record<LineType, SavedLineRecord>> = {};
        for (const line of lines) {
          byType[line.line_type] = line;
        }
        setSavedLines(byType);
      } catch (e) {
        console.error("[TrimLinesPanel] Ошибка загрузки линий:", e);
      }
    }

    void loadLines();
  }, [versionId, apiUrl]);

  // ─── Сохранение линии ────────────────────────────────────────────────────

  const handleSaveLine = useCallback(
    async (data: SavedLine) => {
      try {
        const res = await fetch(`${apiUrl}/trim-lines`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            version_id: versionId,
            line_type: data.lineType,
            anchor_points: data.anchorPoints,
            curve_points: data.curvePoints,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          console.error("[TrimLinesPanel] Ошибка сохранения:", err);
          return;
        }

        const saved = (await res.json()) as SavedLineRecord;
        setSavedLines((prev) => ({ ...prev, [data.lineType]: saved }));
        console.log("[TrimLinesPanel] Линия сохранена:", data.lineType, saved.id);
      } catch (e) {
        console.error("[TrimLinesPanel] fetch error:", e);
      } finally {
        setActiveLineType(null);
        drawerRef.current?.reset();
      }
    },
    [versionId, apiUrl]
  );

  // ─── Отмена рисования ────────────────────────────────────────────────────

  const handleCancel = useCallback(() => {
    drawerRef.current?.reset();
    setActiveLineType(null);
  }, []);

  // ─── Синхронизация состояния Drawer ──────────────────────────────────────

  const handleDrawerStateChange = useCallback(
    (state: { isDrawing: boolean; pointsCount: number; loading: boolean }) => {
      setDrawerState(state);
    },
    []
  );

  // ─── Render ──────────────────────────────────────────────────────────────

  const completedCount = LINE_ORDER.filter((t) => !!savedLines[t]).length;

  return (
    <>
      {/* Панель списка линий — правый верхний угол */}
      <div
        className="absolute right-4 top-4 z-20 w-72 rounded-xl border border-zinc-200 bg-white/95 p-3 shadow-lg backdrop-blur-md dark:border-zinc-700 dark:bg-zinc-900/95"
        style={{ pointerEvents: "auto" }}
      >
        {/* Заголовок */}
        <div className="mb-2.5 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Линии обрезки PLS
          </h3>
          <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500">
            {completedCount}/{LINE_ORDER.length}
          </span>
        </div>

        {/* Прогресс-бар */}
        <div className="mb-3 h-1 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${(completedCount / LINE_ORDER.length) * 100}%` }}
          />
        </div>

        {/* Список линий */}
        <div className="space-y-1.5">
          {LINE_ORDER.map((lineType) => {
            const isSaved = !!savedLines[lineType];
            const isActive = activeLineType === lineType;

            return (
              <div
                key={lineType}
                className={`flex items-center justify-between rounded-lg px-2.5 py-2 transition-colors ${
                  isActive
                    ? "bg-zinc-100 dark:bg-zinc-800"
                    : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                }`}
              >
                {/* Тип + метка */}
                <div className="flex items-center gap-2 min-w-0">
                  {/* Статус-индикатор */}
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${
                      isSaved
                        ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-400"
                        : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500"
                    }`}
                  >
                    {isSaved ? "✓" : "○"}
                  </span>

                  <div className="min-w-0">
                    {/* Badge типа */}
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-mono font-medium ${LINE_COLORS[lineType]}`}
                    >
                      {lineType}
                    </span>
                    {/* Человекочитаемая метка */}
                    <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                      {LINE_LABELS[lineType]}
                    </p>
                  </div>
                </div>

                {/* Кнопка */}
                <button
                  type="button"
                  onClick={() => {
                    if (isActive) {
                      handleCancel();
                    } else {
                      drawerRef.current?.reset();
                      setActiveLineType(lineType);
                    }
                  }}
                  className={`ml-2 shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600"
                      : isSaved
                      ? "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                      : "bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                  }`}
                >
                  {isActive ? "Отменить" : isSaved ? "Перерисовать" : "Нарисовать"}
                </button>
              </div>
            );
          })}
        </div>

        {/* Подсказка — когда ничего не активно */}
        {!activeLineType && completedCount < LINE_ORDER.length && (
          <p className="mt-2.5 text-center text-[11px] text-zinc-400 dark:text-zinc-600">
            Нажмите «Нарисовать» и кликайте на поверхность меша
          </p>
        )}

        {/* Все готово */}
        {completedCount === LINE_ORDER.length && !activeLineType && (
          <p className="mt-2.5 text-center text-xs font-medium text-emerald-600 dark:text-emerald-400">
            ✓ Все линии размечены
          </p>
        )}
      </div>

      {/* LineHintOverlay — голубая/цветная полоска-подсказка на уровне активной линии */}
      <LineHintOverlay viewerRef={viewerRef} activeLineType={activeLineType} />

      {/* TrimLineDrawer — canvas overlay, рисует кривую поверх 3D */}
      {activeLineType && (
        <TrimLineDrawer
          ref={drawerRef}
          viewerRef={viewerRef}
          scanId={scanId}
          lineType={activeLineType}
          onSave={handleSaveLine}
          onStateChange={handleDrawerStateChange}
        />
      )}

      {/* TrimLineControls — панель управления рисованием (внизу по центру) */}
      {activeLineType && (
        <TrimLineControls
          isDrawing={drawerState.isDrawing}
          pointsCount={drawerState.pointsCount}
          loading={drawerState.loading}
          lineType={activeLineType}
          onUndo={() => drawerRef.current?.removeLastPoint()}
          onFinish={() => drawerRef.current?.finishDrawing()}
          onCancel={handleCancel}
        />
      )}
    </>
  );
}
