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
import SavedLinesOverlay from "@/components/SavedLinesOverlay";
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
  embedded?: boolean;
}

// ─── Конфигурация ────────────────────────────────────────────────────────────

const LINE_LABELS: Record<LineType, string> = {
  proximal: "Верхняя линия (проксимальная)",
  ankle: "Линия голеностопа",
  distal: "Линия стопы (дистальная)",
};

const LINE_ORDER: LineType[] = ["proximal", "ankle", "distal"];

const LINE_COLORS: Record<LineType, string> = {
  proximal: "bg-jude-primary-soft text-jude-primary",
  ankle: "bg-jude-accent-soft text-jude-accent",
  distal: "bg-jude-success-soft text-jude-success",
};

// ─── Компонент ───────────────────────────────────────────────────────────────

export default function TrimLinesPanel({
  viewerRef,
  scanId,
  versionId,
  embedded = false,
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
      {/* Панель списка линий */}
      <div
        className={
          embedded
            ? "w-full rounded-xl border border-jude-border bg-jude-surface p-3 shadow-jude"
            : "absolute right-4 top-4 z-20 w-72 rounded-xl border border-jude-border bg-jude-surface/95 p-3 shadow-jude-lg backdrop-blur-md"
        }
        style={{ pointerEvents: "auto" }}
      >
        {/* Заголовок */}
        <div className="mb-2.5 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-jude-ink">
            Линии обрезки PLS
          </h3>
          <span className="text-xs font-medium text-jude-subtle">
            {completedCount}/{LINE_ORDER.length}
          </span>
        </div>

        {/* Прогресс-бар */}
        <div className="mb-3 h-1 w-full overflow-hidden rounded-full bg-jude-bg">
          <div
            className="h-full rounded-full bg-jude-accent transition-all duration-500"
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
                    ? "bg-jude-accent-soft"
                    : "hover:bg-jude-primary-soft"
                }`}
              >
                {/* Тип + метка */}
                <div className="flex items-center gap-2 min-w-0">
                  {/* Статус-индикатор */}
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${
                      isSaved
                        ? "bg-jude-success-soft text-jude-success"
                        : "bg-jude-bg text-jude-subtle"
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
                    <p className="mt-0.5 truncate text-xs text-jude-muted">
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
                      ? "bg-jude-border text-jude-ink hover:bg-jude-border-strong"
                      : isSaved
                      ? "border border-jude-border bg-jude-surface text-jude-muted hover:bg-jude-surface-muted"
                      : "bg-jude-accent text-white hover:bg-jude-accent-hover"
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
          <p className="mt-2.5 text-center text-[11px] text-jude-subtle">
            Нажмите «Нарисовать» и кликайте на поверхность меша
          </p>
        )}

        {/* Все готово */}
        {completedCount === LINE_ORDER.length && !activeLineType && (
          <p className="mt-2.5 text-center text-xs font-medium text-jude-success">
            ✓ Все линии размечены
          </p>
        )}
      </div>

      {/* LineHintOverlay — голубая/цветная полоска-подсказка на уровне активной линии */}
      <LineHintOverlay viewerRef={viewerRef} activeLineType={activeLineType} />

      {/* SavedLinesOverlay — отрисовка уже сохранённых линий */}
      <SavedLinesOverlay
        viewerRef={viewerRef}
        savedLines={Object.values(savedLines) as SavedLineRecord[]}
        activeLineType={activeLineType}
      />

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
