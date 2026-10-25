import React, { useCallback, useEffect, useMemo, useState } from "react";

/**
 * MeasurementHistory — блок «История измерений» на карточке пациента.
 *
 * Отображает:
 * - Предупреждение о сравнимости данных (ориентиры чувствительны к постановке)
 * - Таблицу измерений по дате (slice_z, ширина, длина, CI, CVAI)
 * - SVG-график CI и CVAI по дате (без внешних библиотек)
 *
 * Все значения в мм и %. Стороны «левая/правая» — всегда со стороны пациента.
 */

// ─── SVG micro-chart (inline, без библиотек) ──────────────────────────────────

interface MiniLinePoint {
  x: string | number;
  y: number;
  label: string;
}

interface MiniLineChartProps {
  points: MiniLinePoint[];
  color: string;
  width?: number;
  height?: number;
  label: string;
}

function MiniLineChart({
  points,
  color,
  width = 280,
  height = 80,
  label,
}: MiniLineChartProps) {
  if (!points || points.length < 1) return null;

  const padL = 36, padR = 16, padT = 12, padB = 28;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;

  const ys = points.map((p) => p.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const rangeY = maxY - minY || 1;

  const toSX = (i: number) => padL + (points.length === 1 ? chartW / 2 : (i / (points.length - 1)) * chartW);
  const toSY = (y: number) => padT + chartH - ((y - minY) / rangeY) * chartH;

  // Grid lines (2-3 horizontal)
  const gridVals = [];
  const step = rangeY / 2;
  for (let g = 0; g <= 2; g++) {
    gridVals.push(minY + step * g);
  }

  // Polyline path
  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${toSX(i).toFixed(1)},${toSY(p.y).toFixed(1)}`)
    .join(" ");

  // Area fill
  const areaD =
    pathD +
    ` L ${toSX(points.length - 1).toFixed(1)},${(padT + chartH).toFixed(1)}` +
    ` L ${toSX(0).toFixed(1)},${(padT + chartH).toFixed(1)} Z`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      {/* Grid */}
      {gridVals.map((v, i) => (
        <g key={i}>
          <line
            x1={padL}
            y1={toSY(v)}
            x2={padL + chartW}
            y2={toSY(v)}
            stroke="#e2e8f0"
            strokeWidth={0.8}
          />
          <text
            x={padL - 4}
            y={toSY(v) + 3.5}
            textAnchor="end"
            fontSize={9}
            fill="#94a3b8"
          >
            {v.toFixed(1)}
          </text>
        </g>
      ))}

      {/* Area */}
      <path d={areaD} fill={color} fillOpacity={0.08} />

      {/* Line */}
      <path d={pathD} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

      {/* Points */}
      {points.map((p, i) => (
        <g key={i}>
          <circle
            cx={toSX(i)}
            cy={toSY(p.y)}
            r={4}
            fill={color}
            stroke="#ffffff"
            strokeWidth={1.5}
          />
          {/* Date label on x-axis */}
          <text
            x={toSX(i)}
            y={padT + chartH + 16}
            textAnchor="middle"
            fontSize={9}
            fill="#64748b"
            style={{ fontFamily: "monospace" }}
          >
            {p.label}
          </text>
        </g>
      ))}

      {/* Y-axis label */}
      <text
        x={padL - 30}
        y={padT + chartH / 2}
        textAnchor="middle"
        fontSize={9}
        fill="#94a3b8"
        transform={`rotate(-90, ${padL - 30}, ${padT + chartH / 2})`}
      >
        {label}
      </text>
    </svg>
  );
}

// ─── Основной компонент ────────────────────────────────────────────────────────

export interface HeadMeasurement {
  id: string;
  scan_id: string;
  patient_id: string;
  measured_at: string;
  slice_z?: number | null;
  width_mm?: number | null;
  length_mm?: number | null;
  cephalic_index?: number | null;
  circumference_mm?: number | null;
  diag_a_mm?: number | null;
  diag_b_mm?: number | null;
  cva_mm?: number | null;
  cvai_percent?: number | null;
  params?: Record<string, unknown> | null;
  algorithm_version?: string | null;
}

interface MeasurementHistoryProps {
  patientId: string;
  accessToken?: string;
  className?: string;
}

function fmt(v: number | null | undefined, decimals = 1): string {
  if (v == null) return "—";
  return Number(v).toFixed(decimals);
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
  } catch {
    return iso;
  }
}

function fmtDateShort(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
  } catch {
    return "";
  }
}

export default function MeasurementHistory({
  patientId,
  accessToken = "",
  className = "",
}: MeasurementHistoryProps) {
  const [measurements, setMeasurements] = useState<HeadMeasurement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!patientId) return;
    setLoading(true);
    setError(null);
    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
      const url = `${baseUrl}/patients/${patientId}/measurements`;
      const headers: Record<string, string> = {};
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
      const res = await fetch(url, { headers });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error((body as { detail?: string }).detail ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as { items: HeadMeasurement[]; total: number };
      // API возвращает DESC по дате; для отображения таблицы — тоже DESC (новые сверху)
      setMeasurements(data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки истории");
    } finally {
      setLoading(false);
    }
  }, [patientId, accessToken]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // Хронологический порядок для графика (ASC)
  const chronoItems = useMemo(
    () => [...measurements].sort((a, b) => a.measured_at.localeCompare(b.measured_at)),
    [measurements]
  );

  // Данные для графика CI
  const ciPoints = useMemo(
    () =>
      chronoItems
        .filter((m) => m.cephalic_index != null)
        .map((m) => ({
          x: m.measured_at,
          y: m.cephalic_index as number,
          label: fmtDateShort(m.measured_at),
        })),
    [chronoItems]
  );

  // Данные для графика CVAI
  const cvaiPoints = useMemo(
    () =>
      chronoItems
        .filter((m) => m.cvai_percent != null)
        .map((m) => ({
          x: m.measured_at,
          y: m.cvai_percent as number,
          label: fmtDateShort(m.measured_at),
        })),
    [chronoItems]
  );

  const hasTrend = cvaiPoints.length >= 2;
  const cvaiImproving =
    hasTrend &&
    cvaiPoints[cvaiPoints.length - 1].y < cvaiPoints[0].y;

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      <div className="flex items-center justify-between">
        <h3 className="font-heading text-base font-semibold text-jude-ink">
          История измерений черепа
        </h3>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="text-xs text-jude-primary hover:underline disabled:opacity-50"
        >
          {loading ? "Загрузка..." : "Обновить"}
        </button>
      </div>

      {/* ─── Предупреждение о сравнимости данных ─── */}
      <div className="rounded-lg border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-800">
        <span className="font-semibold">⚠ Сравнимость визитов:</span>{" "}
        метрики инвариантны к повороту скана, но чувствительны к точности постановки ориентиров
        (переносица, козелки) — при расхождении меток между визитами цифры сравнивать осторожно.
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-2.5 text-xs text-rose-700">
          {error}
        </div>
      )}

      {!loading && measurements.length === 0 && !error && (
        <p className="text-sm text-jude-muted">
          Измерений ещё нет. Сохраните результат расчёта через кнопку «Сохранить измерение» в
          панели метрик.
        </p>
      )}

      {measurements.length > 0 && (
        <>
          {/* ─── Графики CI и CVAI ─── */}
          {(ciPoints.length >= 2 || cvaiPoints.length >= 2) && (
            <div className="rounded-xl border border-jude-border bg-jude-surface p-4">
              <p className="mb-3 text-xs font-semibold text-jude-muted uppercase tracking-wide">
                Динамика показателей
              </p>

              {hasTrend && (
                <p className="mb-3 text-[11px]">
                  {cvaiImproving ? (
                    <span className="text-emerald-700 font-medium">
                      ↓ CVAI снижается ({fmt(cvaiPoints[0].y)}% → {fmt(cvaiPoints[cvaiPoints.length - 1].y)}%) — показатель асимметрии уменьшается
                    </span>
                  ) : (
                    <span className="text-rose-700 font-medium">
                      ↑ CVAI растёт ({fmt(cvaiPoints[0].y)}% → {fmt(cvaiPoints[cvaiPoints.length - 1].y)}%) — показатель асимметрии увеличивается
                    </span>
                  )}
                </p>
              )}

              <div className="flex flex-col gap-6 sm:flex-row sm:gap-4">
                {cvaiPoints.length >= 2 && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-medium text-jude-muted uppercase tracking-wide">
                      CVAI (%)
                    </span>
                    <MiniLineChart
                      points={cvaiPoints}
                      color="#0284c7"
                      label="CVAI%"
                      width={200}
                      height={90}
                    />
                  </div>
                )}
                {ciPoints.length >= 2 && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-medium text-jude-muted uppercase tracking-wide">
                      CI (%)
                    </span>
                    <MiniLineChart
                      points={ciPoints}
                      color="#7c3aed"
                      label="CI%"
                      width={200}
                      height={90}
                    />
                  </div>
                )}
              </div>

              <p className="mt-2 text-[10px] text-jude-subtle">
                Значения ориентировочные, не клинический вывод
              </p>
            </div>
          )}

          {/* ─── Таблица измерений ─── */}
          <div className="overflow-x-auto rounded-xl border border-jude-border">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-jude-border bg-jude-surface-muted/60">
                  <th className="px-3 py-2 font-semibold text-jude-muted">Дата</th>
                  <th className="px-3 py-2 font-semibold text-jude-muted text-right">Ширина</th>
                  <th className="px-3 py-2 font-semibold text-jude-muted text-right">Длина</th>
                  <th className="px-3 py-2 font-semibold text-jude-muted text-right">CI</th>
                  <th className="px-3 py-2 font-semibold text-jude-muted text-right">CVA</th>
                  <th className="px-3 py-2 font-semibold text-jude-muted text-right">CVAI</th>
                  <th className="px-3 py-2 font-semibold text-jude-muted text-right">Срез z</th>
                  <th className="px-3 py-2 font-semibold text-jude-muted text-right">Версия</th>
                </tr>
              </thead>
              <tbody>
                {measurements.map((m, idx) => {
                  // Показываем тренд CVAI относительно предыдущего (хронологически)
                  const chronoIdx = chronoItems.findIndex((c) => c.id === m.id);
                  const prev = chronoIdx > 0 ? chronoItems[chronoIdx - 1] : null;
                  const cvaiDelta =
                    m.cvai_percent != null && prev?.cvai_percent != null
                      ? m.cvai_percent - prev.cvai_percent
                      : null;

                  return (
                    <tr
                      key={m.id}
                      className={`border-b border-jude-border/60 hover:bg-jude-surface-muted/40 ${
                        idx === 0 ? "bg-jude-surface" : ""
                      }`}
                    >
                      <td className="px-3 py-2 font-mono text-jude-ink whitespace-nowrap">
                        {fmtDate(m.measured_at)}
                        {idx === 0 && (
                          <span className="ml-1 rounded bg-sky-100 px-1 py-0.5 text-[9px] font-medium text-sky-700">
                            посл.
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-jude-ink">
                        {fmt(m.width_mm)} мм
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-jude-ink">
                        {fmt(m.length_mm)} мм
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-medium text-jude-ink">
                        {fmt(m.cephalic_index)}%
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-jude-ink">
                        {fmt(m.cva_mm)} мм
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className="font-mono font-bold text-jude-primary">
                          {fmt(m.cvai_percent)}%
                        </span>
                        {cvaiDelta != null && (
                          <span
                            className={`ml-1 text-[10px] font-medium ${
                              cvaiDelta < 0 ? "text-emerald-600" : "text-rose-600"
                            }`}
                          >
                            {cvaiDelta < 0 ? "▼" : "▲"}
                            {Math.abs(cvaiDelta).toFixed(1)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-jude-muted">
                        {fmt(m.slice_z)} мм
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-jude-subtle text-[10px]">
                        {m.algorithm_version ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-[10px] text-jude-subtle">
            Показатели ориентировочные, не клинический вывод. Сравнение визитов — только при
            идентичной методике расстановки ориентиров.
          </p>
        </>
      )}
    </div>
  );
}
