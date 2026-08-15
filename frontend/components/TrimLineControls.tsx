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
      className="absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-jude-border bg-jude-surface/95 px-4 py-2.5 shadow-jude-lg backdrop-blur-md"
      style={{ pointerEvents: "auto" }}
    >
      {/* Статус */}
      <span className="whitespace-nowrap text-sm text-jude-muted">
        {loading ? (
          <span className="text-jude-warning">⏳ Строю кривую…</span>
        ) : isDrawing ? (
          pointsCount === 0 ? (
            "Кликните на поверхность"
          ) : (
            <>
              Точек:{" "}
              <span className="font-semibold text-jude-ink">{pointsCount}</span>
            </>
          )
        ) : (
          <span className="font-medium text-jude-success">✓ Линия завершена</span>
        )}
      </span>

      {(isDrawing || lineType) && (
        <span className="select-none text-jude-border">|</span>
      )}

      {lineType && (
        <span className="rounded bg-jude-primary-soft px-2 py-0.5 font-mono text-xs text-jude-primary">
          {lineType}
        </span>
      )}

      {isDrawing && pointsCount > 0 && (
        <button
          type="button"
          onClick={onUndo}
          disabled={loading}
          className="rounded-lg border border-jude-border bg-jude-surface px-3 py-1 text-sm font-medium text-jude-ink transition-colors hover:bg-jude-surface-muted disabled:opacity-40"
        >
          ↩ Отменить точку
        </button>
      )}

      {isDrawing && pointsCount >= 2 && (
        <button
          type="button"
          onClick={onFinish}
          disabled={loading}
          className="rounded-lg bg-jude-accent px-3 py-1 text-sm font-medium text-white transition-colors hover:bg-jude-accent-hover disabled:opacity-40"
        >
          Завершить линию
        </button>
      )}

      <button
        type="button"
        onClick={onCancel}
        className="rounded-lg px-3 py-1 text-sm font-medium text-jude-error transition-colors hover:bg-jude-error-soft"
      >
        Отменить всё
      </button>
    </div>
  );
}
