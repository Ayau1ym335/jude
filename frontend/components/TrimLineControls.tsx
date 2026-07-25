"use client";

/**
 * TrimLineControls.tsx
 *
 * Панель управления процессом рисования линии.
 * Отображается поверх 3D-вьюера как абсолютно позиционированный overlay.
 *
 * Связь с TrimLineDrawer:
 *   - Принимает колбэки onUndo / onFinish / onCancel, которые вызывают
 *     методы TrimLineDrawerHandle (removeLastPoint / finishDrawing / reset).
 *   - Состояние isDrawing / pointsCount / loading синхронизируется
 *     через пропс onStateChange в TrimLineDrawer.
 */

interface TrimLineControlsProps {
  isDrawing: boolean;
  pointsCount: number;
  loading?: boolean;
  lineType?: string;
  onUndo: () => void;
  onFinish: () => void;
  onCancel: () => void;
}

export default function TrimLineControls({
  isDrawing,
  pointsCount,
  loading = false,
  lineType,
  onUndo,
  onFinish,
  onCancel,
}: TrimLineControlsProps) {
  return (
    <div
      className="absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-zinc-200 bg-white/95 px-4 py-2.5 shadow-lg backdrop-blur-md dark:border-zinc-700 dark:bg-zinc-900/95"
      style={{ pointerEvents: "auto" }}
    >
      {/* Статус */}
      <span className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
        {loading ? (
          <span className="text-amber-600 dark:text-amber-400">
            ⏳ Строю кривую…
          </span>
        ) : isDrawing ? (
          pointsCount === 0 ? (
            "Кликните на поверхность"
          ) : (
            <>
              Точек:{" "}
              <span className="font-semibold text-zinc-950 dark:text-zinc-50">
                {pointsCount}
              </span>
            </>
          )
        ) : (
          <span className="text-emerald-600 dark:text-emerald-400 font-medium">
            ✓ Линия завершена
          </span>
        )}
      </span>

      {/* Разделитель */}
      {(isDrawing || lineType) && (
        <span className="text-zinc-300 dark:text-zinc-600 select-none">|</span>
      )}

      {/* Тип линии */}
      {lineType && (
        <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-mono text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
          {lineType}
        </span>
      )}

      {/* Отменить последнюю точку */}
      {isDrawing && pointsCount > 0 && (
        <button
          type="button"
          onClick={onUndo}
          disabled={loading}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-1 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 hover:text-zinc-950 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          ↩ Отменить точку
        </button>
      )}

      {/* Завершить линию */}
      {isDrawing && pointsCount >= 2 && (
        <button
          type="button"
          onClick={onFinish}
          disabled={loading}
          className="rounded-lg bg-blue-600 px-3 py-1 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-40 dark:bg-blue-500 dark:hover:bg-blue-600"
        >
          Завершить линию
        </button>
      )}

      {/* Отменить всё */}
      <button
        type="button"
        onClick={onCancel}
        className="rounded-lg px-3 py-1 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
      >
        Отменить всё
      </button>
    </div>
  );
}
