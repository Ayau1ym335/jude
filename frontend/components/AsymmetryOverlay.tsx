"use client";

/**
 * AsymmetryOverlay — карта асимметрии головы поверх 3D-модели.
 *
 * Цветовая схема: синий (вдавлено) → белый (симметрия) → красный (выступает).
 * Схема безопасна для дальтоников (RdBu diverging, ColorBrewer):
 * не использует зелёно-красный контраст, монотонный переход яркости к белому в нуле.
 *
 * Только для helmet_type === 'cranial_remolding' или при наличии landmarks.
 * Если ориентиры не поставлены — инструмент заблокирован с предупреждением.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { ModelViewerHandle } from "@/components/ModelViewer";

// ─── Конфигурация шкалы по умолчанию ─────────────────────────────────────────
// По умолчанию ±10 мм — стандартный диапазон клинической оценки краниальной асимметрии.
export const DEFAULT_SCALE_MM = 10.0;

export interface AsymmetryResult {
  values: number[]; // подписанное расстояние на вершину, мм
  min: number;
  max: number;
  mean_abs: number;
  percent_over_threshold: number;
  threshold_mm: number;
  vertex_count: number;
}

export interface AsymmetryOverlayProps {
  viewerRef: React.RefObject<ModelViewerHandle | null>;
  scanId: string;
  accessToken?: string;
  /** Внешний флаг активности (если контролируется родителем) */
  active?: boolean;
  /** Колбэк при изменении состояния вкл/выкл */
  onToggleActive?: (active: boolean) => void;
  /** Метки уже поставлены? Если нет — locked state с предупреждением */
  hasLandmarks: boolean;
  /** Диапазон шкалы ±scaleMm (мм) */
  scaleMm?: number;
  onScaleChange?: (scale: number) => void;
  embedded?: boolean;
}

// ─── Цветовая интерполяция: синий → белый → красный ─────────────────────────
// Безопасная для дальтоников схема (Protanopia / Deuteranopia safe):
// - синий (#2166ac: rgb 33, 102, 172) — вдавлено / уплощено
// - белый (#ffffff: rgb 255, 255, 255) — около нуля / симметрия
// - красный (#d6604d: rgb 214, 96, 77) — выступает / выпуклость

export function valueToColor(v: number, scaleMm: number): [number, number, number] {
  if (scaleMm <= 0) scaleMm = 1.0;
  // Нормализуем в [-1, 1]
  const t = Math.max(-1, Math.min(1, v / scaleMm));

  if (t >= 0) {
    // белый → красный  (t: 0→1)
    // #ffffff (1, 1, 1) → #d6604d (0.839, 0.376, 0.302)
    const r = 1.0 - t * (1.0 - 0xd6 / 255);
    const g = 1.0 - t * (1.0 - 0x60 / 255);
    const b = 1.0 - t * (1.0 - 0x4d / 255);
    return [r, g, b];
  } else {
    // синий → белый  (t: -1→0)
    const u = -t; // 1 → 0
    // #2166ac (0.129, 0.400, 0.675) → #ffffff (1, 1, 1)
    const r = 1.0 - u * (1.0 - 0x21 / 255);
    const g = 1.0 - u * (1.0 - 0x66 / 255);
    const b = 1.0 - u * (1.0 - 0xac / 255);
    return [r, g, b];
  }
}

/** Строит Float32Array (N*3) вершинных цветов из массива значений. */
export function buildColorBuffer(values: number[], scaleMm: number): Float32Array {
  const buf = new Float32Array(values.length * 3);
  for (let i = 0; i < values.length; i++) {
    const [r, g, b] = valueToColor(values[i], scaleMm);
    buf[i * 3] = r;
    buf[i * 3 + 1] = g;
    buf[i * 3 + 2] = b;
  }
  return buf;
}

// ─── Легенда: градиент + числа + метрики ────────────────────────────────────

export interface LegendProps {
  scaleMm: number;
  meanAbs?: number | null;
  maxAbs?: number | null;
  percentOver?: number | null;
  thresholdMm?: number | null;
}

export function AsymmetryLegend({
  scaleMm,
  meanAbs,
  maxAbs,
  percentOver,
  thresholdMm,
}: LegendProps) {
  // 5 меток: +scale, +scale/2, 0, -scale/2, -scale
  const ticks = [scaleMm, scaleMm / 2, 0, -scaleMm / 2, -scaleMm];

  const gradient =
    "linear-gradient(to top, #2166ac, #7fbbe0, #ffffff, #e8a193, #d6604d)";

  return (
    <div
      data-testid="asymmetry-legend"
      className="flex flex-col gap-2 rounded-xl border border-jude-border bg-jude-surface/95 px-3 py-3 shadow-jude backdrop-blur-sm"
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-jude-ink">Легенда асимметрии</p>
        <span className="font-mono text-[10px] text-jude-subtle">{`±${scaleMm.toFixed(1)} мм`}</span>
      </div>

      {/* Градиентная полоска + числовые метки */}
      <div className="flex items-stretch gap-2.5">
        <div
          data-testid="asymmetry-gradient-bar"
          className="w-4 flex-shrink-0 rounded shadow-inner"
          style={{ background: gradient, minHeight: 120 }}
        />
        <div className="flex flex-col justify-between py-0.5">
          {ticks.map((v) => (
            <span key={v} className="font-mono text-[10px] leading-none text-jude-muted">
              {v > 0 ? `+${v.toFixed(1)} мм` : `${v.toFixed(1)} мм`}
            </span>
          ))}
        </div>
      </div>

      {/* Подписи значений */}
      <div className="flex justify-between text-[10px] font-medium pt-1">
        <span style={{ color: "#2166ac" }}>● вдавлено</span>
        <span className="text-jude-subtle">○ симметрия</span>
        <span style={{ color: "#d6604d" }}>● выступает</span>
      </div>

      {/* Числовые метрики */}
      {meanAbs !== undefined && meanAbs !== null && (
        <div className="mt-1 space-y-1 border-t border-jude-border pt-2 text-xs">
          <div className="flex justify-between">
            <span className="text-jude-muted">Среднее |Δ|:</span>
            <span className="font-mono font-semibold text-jude-ink">
              {`${meanAbs.toFixed(2)} мм`}
            </span>
          </div>
          {maxAbs !== undefined && maxAbs !== null && (
            <div className="flex justify-between">
              <span className="text-jude-muted">Макс |Δ|:</span>
              <span className="font-mono font-semibold text-jude-ink">
                {`${maxAbs.toFixed(2)} мм`}
              </span>
            </div>
          )}
          {percentOver !== undefined && percentOver !== null && thresholdMm !== undefined && thresholdMm !== null && (
            <div className="flex justify-between">
              <span className="text-jude-muted">{`>${thresholdMm} мм:`}</span>
              <span
                className="font-mono font-semibold"
                style={{
                  color: percentOver > 20 ? "#d6604d" : "var(--jude-ink)",
                }}
              >
                {`${percentOver.toFixed(1)}%`}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Основной компонент AsymmetryOverlay ────────────────────────────────────

export default function AsymmetryOverlay({
  viewerRef,
  scanId,
  accessToken,
  active: controlledActive,
  onToggleActive,
  hasLandmarks,
  scaleMm: controlledScaleMm,
  onScaleChange,
  embedded = false,
}: AsymmetryOverlayProps) {
  // Поддержка контролируемого и неконтролируемого состояния active
  const [internalActive, setInternalActive] = useState(false);
  const isControlled = controlledActive !== undefined;
  const active = isControlled ? controlledActive : internalActive;

  // Локальный диапазон шкалы
  const [internalScaleMm, setInternalScaleMm] = useState<number>(
    controlledScaleMm ?? DEFAULT_SCALE_MM
  );
  const scaleMm = controlledScaleMm ?? internalScaleMm;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AsymmetryResult | null>(null);

  const prevActiveRef = useRef(false);

  // ─── Применение цветов к мешу ───────────────────────────────────────────
  const applyColors = useCallback(
    (values: number[], currentScale: number) => {
      const handle = viewerRef.current;
      if (!handle) return false;

      const mesh = handle.getMesh();
      if (!mesh) return false;

      const vertexCount = mesh.geometry.attributes.position.count;
      // Проверка совпадения числа вершин
      if (values.length !== vertexCount) {
        console.error(
          `Число цветов (${values.length}) не совпадает с числом вершин (${vertexCount}). Модель была изменена, пересчитайте.`
        );
        setError("Модель была изменена, пересчитайте.");
        return false;
      }

      const colors = buildColorBuffer(values, currentScale);
      const ok = handle.applyVertexColors(colors);
      if (!ok) {
        setError("Не удалось применить цвета к мешу.");
      }
      return ok;
    },
    [viewerRef]
  );

  // ─── Запрос и отображение карты при активации ────────────────────────────
  useEffect(() => {
    // Включение
    if (active && !prevActiveRef.current) {
      prevActiveRef.current = true;

      if (!hasLandmarks) {
        return;
      }

      // Если данные уже были загружены ранее — сразу применяем цвета без повторного запроса
      if (result) {
        applyColors(result.values, scaleMm);
        return;
      }

      async function fetchAndApply() {
        setLoading(true);
        setError(null);
        try {
          const baseUrl = process.env.NEXT_PUBLIC_API_URL || "";
          const url = baseUrl ? `${baseUrl}/geometry/asymmetry-map` : "/api/geometry/asymmetry-map";

          const headers: Record<string, string> = {
            "Content-Type": "application/json",
          };
          if (accessToken) {
            headers.Authorization = `Bearer ${accessToken}`;
          }

          const res = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify({ scan_id: scanId }),
          });

          if (!res.ok) {
            const body = (await res.json().catch(() => ({ detail: res.statusText }))) as {
              detail?: string;
            };
            throw new Error(body.detail ?? `HTTP ${res.status}`);
          }

          const data = (await res.json()) as AsymmetryResult;
          setResult(data);
          applyColors(data.values, scaleMm);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Ошибка загрузки карты асимметрии");
        } finally {
          setLoading(false);
        }
      }

      void fetchAndApply();
    }

    // Выключение
    if (!active && prevActiveRef.current) {
      prevActiveRef.current = false;
      viewerRef.current?.clearVertexColors();
      setError(null);
    }
  }, [active, hasLandmarks, result, scaleMm, scanId, accessToken, viewerRef, applyColors]);

  // Очистка цветов при размонтировании
  useEffect(() => {
    const viewer = viewerRef.current;
    return () => {
      viewer?.clearVertexColors();
    };
  }, [viewerRef]);

  // ─── Изменение шкалы (перекраска без повторного запроса к бэкенду) ──────────
  const handleScaleChange = useCallback(
    (newScale: number) => {
      const clamped = Math.max(1, Math.min(50, newScale));
      setInternalScaleMm(clamped);
      onScaleChange?.(clamped);
      if (active && result) {
        applyColors(result.values, clamped);
      }
    },
    [active, result, onScaleChange, applyColors]
  );

  // ─── Переключатель вкл/выкл ───────────────────────────────────────────────
  const handleToggle = () => {
    if (!hasLandmarks) return;
    const next = !active;
    if (isControlled) {
      onToggleActive?.(next);
    } else {
      setInternalActive(next);
    }
  };

  const maxAbs = result ? Math.max(Math.abs(result.min), Math.abs(result.max)) : null;

  return (
    <div
      data-testid="asymmetry-overlay"
      className={`flex flex-col gap-3 ${
        embedded
          ? ""
          : "rounded-xl border border-jude-border bg-jude-surface p-4 shadow-jude"
      }`}
    >
      {/* Шапка инструмента */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-jude-ink">🗺 Карта асимметрии</h3>
        {active && result && (
          <span className="rounded-full bg-jude-primary-soft px-2 py-0.5 text-[10px] font-medium text-jude-primary">
            активна
          </span>
        )}
      </div>

      {/* Предупреждение если ориентиры не сохранены */}
      {!hasLandmarks && (
        <div
          data-testid="landmarks-warning"
          className="rounded-lg border border-jude-warning/30 bg-jude-warning-soft px-3 py-2.5"
        >
          <p className="text-xs font-medium text-jude-warning">
            🔒 Сначала расставьте ориентиры головы
          </p>
          <p className="mt-1 text-[11px] text-jude-warning/80 leading-snug">
            Для построения плоскости симметрии требуются 3 точки (переносица и козелки ушей).
            Используйте инструмент «Ориентиры головы» выше.
          </p>
        </div>
      )}

      {/* Кнопка включения/выключения */}
      <button
        type="button"
        data-testid="asymmetry-toggle-btn"
        onClick={handleToggle}
        disabled={!hasLandmarks || loading}
        className={`w-full rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
          active
            ? "border border-jude-primary bg-jude-primary text-white shadow-sm hover:bg-jude-primary/90"
            : "border border-jude-border bg-jude-surface text-jude-ink hover:border-jude-primary hover:text-jude-primary"
        } disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-jude-border disabled:hover:text-jude-ink`}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Вычисление карты…
          </span>
        ) : active ? (
          "✕ Скрыть карту асимметрии"
        ) : (
          "Показать карту асимметрии"
        )}
      </button>

      {/* Ошибка */}
      {error && (
        <div data-testid="asymmetry-error" className="rounded-lg bg-jude-error-soft px-3 py-2">
          <p className="text-xs text-jude-error">✕ {error}</p>
        </div>
      )}

      {/* Ползунок шкалы и легенда при активной карте */}
      {active && (
        <div className="flex flex-col gap-3 pt-1">
          {/* Настройка диапазона шкалы */}
          <div className="rounded-lg border border-jude-border/80 bg-jude-canvas/60 p-2.5">
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="asymmetry-scale-slider" className="text-xs font-medium text-jude-ink">
                Диапазон шкалы:
              </label>
              <span className="font-mono text-xs font-bold text-jude-primary">
                {`±${scaleMm.toFixed(1)} мм`}
              </span>
            </div>

            <input
              id="asymmetry-scale-slider"
              data-testid="asymmetry-scale-slider"
              type="range"
              min="2"
              max="25"
              step="0.5"
              value={scaleMm}
              onChange={(e) => handleScaleChange(parseFloat(e.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-jude-border accent-jude-primary"
            />

            <div className="mt-1 flex items-center justify-between text-[10px] text-jude-subtle">
              <span>±2 мм</span>
              <div className="flex gap-1.5">
                {maxAbs !== null && maxAbs > 0 && (
                  <button
                    type="button"
                    onClick={() => handleScaleChange(Math.max(2, Math.ceil(maxAbs)))}
                    className="text-[10px] font-medium text-jude-primary hover:underline"
                  >
                    Адаптивно ({Math.max(2, Math.ceil(maxAbs))} мм)
                  </button>
                )}
                {scaleMm !== DEFAULT_SCALE_MM && (
                  <button
                    type="button"
                    onClick={() => handleScaleChange(DEFAULT_SCALE_MM)}
                    className="text-[10px] text-jude-muted hover:underline"
                  >
                    Сброс (10 мм)
                  </button>
                )}
              </div>
              <span>±25 мм</span>
            </div>
          </div>

          {/* Легенда */}
          <AsymmetryLegend
            scaleMm={scaleMm}
            meanAbs={result?.mean_abs}
            maxAbs={maxAbs}
            percentOver={result?.percent_over_threshold}
            thresholdMm={result?.threshold_mm}
          />
        </div>
      )}
    </div>
  );
}
