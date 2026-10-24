import React, { useCallback, useEffect, useMemo, useState } from "react";

/**
 * HeadDynamicsChart — график динамики асимметрии черепа (CVAI) по визитам
 * и аналитическая таблица изменения формы головы.
 *
 * Требования:
 * - График динамики CVAI по визитам (чистый SVG, без сторонних библиотек).
 * - Точки на графике: дата визита, значение CVAI (%).
 * - Пороговые линии: норма (<3.5%), лёгкая (3.5-7%), средняя (7-10%), тяжёлая (>10%).
 * - Таблица под графиком: дата, CI, CVAI, разница с прошлым визитом
 *   (зелёным если улучшение — CVAI снизился, красным если ухудшение — CVAI вырос).
 * - Пометка: «значения ориентировочные, не клинический вывод».
 */

export const CVAI_THRESHOLDS = {
  NORMAL_MAX: 3.5,
  MILD_MAX: 7.0,
  MODERATE_MAX: 10.0,
};

export function getSeverityInfo(cvai) {
  if (cvai == null || Number.isNaN(cvai)) {
    return {
      key: "unknown",
      label: "Не определено",
      shortLabel: "—",
      color: "#94a3b8",
      fillColor: "rgba(148, 163, 184, 0.15)",
      bgClass: "bg-slate-100",
      textClass: "text-slate-600",
      borderClass: "border-slate-200",
    };
  }
  const val = Number(cvai);
  if (val < CVAI_THRESHOLDS.NORMAL_MAX) {
    return {
      key: "normal",
      label: "Норма (<3.5%)",
      shortLabel: "Норма",
      color: "#10b981",
      fillColor: "rgba(16, 185, 129, 0.12)",
      bgClass: "bg-emerald-50",
      textClass: "text-emerald-700",
      borderClass: "border-emerald-200",
    };
  }
  if (val < CVAI_THRESHOLDS.MILD_MAX) {
    return {
      key: "mild",
      label: "Лёгкая (3.5–7%)",
      shortLabel: "Лёгкая",
      color: "#f59e0b",
      fillColor: "rgba(245, 158, 11, 0.12)",
      bgClass: "bg-amber-50",
      textClass: "text-amber-800",
      borderClass: "border-amber-200",
    };
  }
  if (val < CVAI_THRESHOLDS.MODERATE_MAX) {
    return {
      key: "moderate",
      label: "Средняя (7–10%)",
      shortLabel: "Средняя",
      color: "#f97316",
      fillColor: "rgba(249, 115, 22, 0.12)",
      bgClass: "bg-orange-50",
      textClass: "text-orange-800",
      borderClass: "border-orange-200",
    };
  }
  return {
    key: "severe",
    label: "Тяжёлая (>10%)",
    shortLabel: "Тяжёлая",
    color: "#ef4444",
    fillColor: "rgba(239, 68, 68, 0.12)",
    bgClass: "bg-rose-50",
    textClass: "text-rose-800",
    borderClass: "border-rose-200",
  };
}

export function formatDate(isoStr) {
  if (!isoStr) return "—";
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return isoStr;
  }
}

export function formatDateShort(isoStr) {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = String(d.getFullYear()).slice(-2);
    return `${day}.${month}.${year}`;
  } catch {
    return "";
  }
}

/**
 * Векторный SVG график динамики CVAI с пороговыми зонами
 */
export function CvaiDynamicsSvg({
  items,
  activeId,
  onSelectPoint,
  width = 620,
  height = 240,
}) {
  if (!items || items.length === 0) return null;

  const padLeft = 46;
  const padRight = 110; // место под подписи порогов справа
  const padTop = 26;
  const padBottom = 34;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  // Диапазон по оси Y: минимум 0%, максимум не менее 12%, либо максимум из точек + 1.5%
  const cvaiValues = items
    .map((it) => (it.cvai_percent != null ? Number(it.cvai_percent) : null))
    .filter((v) => v != null && !Number.isNaN(v));
  const rawMax = cvaiValues.length > 0 ? Math.max(...cvaiValues) : 0;
  const maxVal = Math.max(12.0, rawMax + 1.5);
  const minVal = 0.0;
  const rangeY = maxVal - minVal;

  const toY = (val) => padTop + chartH - ((val - minVal) / rangeY) * chartH;
  const toX = (idx) => {
    if (items.length <= 1) return padLeft + chartW / 2;
    return padLeft + (idx / (items.length - 1)) * chartW;
  };

  // Координаты пороговых линий
  const yNormal = toY(CVAI_THRESHOLDS.NORMAL_MAX);
  const yMild = toY(CVAI_THRESHOLDS.MILD_MAX);
  const yModerate = toY(CVAI_THRESHOLDS.MODERATE_MAX);
  const yBottom = toY(0);
  const yTop = toY(maxVal);

  // Точки с валидным значением CVAI
  const validPoints = items
    .map((item, idx) => ({
      item,
      idx,
      x: toX(idx),
      y: item.cvai_percent != null ? toY(Number(item.cvai_percent)) : null,
      val: item.cvai_percent != null ? Number(item.cvai_percent) : null,
      dateLabel: formatDateShort(item.measured_at),
    }))
    .filter((p) => p.y != null);

  // Ломаная линия тренда
  const pathData = validPoints
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");

  // Градиентная заливка под линией
  const areaData =
    validPoints.length > 0
      ? `${pathData} L ${validPoints[validPoints.length - 1].x.toFixed(1)},${yBottom.toFixed(1)} L ${validPoints[0].x.toFixed(1)},${yBottom.toFixed(1)} Z`
      : "";

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-auto select-none"
      style={{ maxHeight: `${height}px` }}
    >
      <defs>
        <linearGradient id="cvaiLineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>
        <linearGradient id="cvaiAreaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#0284c7" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#0284c7" stopOpacity="0.01" />
        </linearGradient>
      </defs>

      {/* ─── Фоновые полосы порогов (Argenta classification) ─── */}
      {/* 1. Норма (< 3.5%) */}
      <rect
        x={padLeft}
        y={yNormal}
        width={chartW}
        height={Math.max(0, yBottom - yNormal)}
        fill="#10b981"
        fillOpacity="0.06"
      />
      {/* 2. Лёгкая (3.5 – 7.0%) */}
      <rect
        x={padLeft}
        y={yMild}
        width={chartW}
        height={Math.max(0, yNormal - yMild)}
        fill="#f59e0b"
        fillOpacity="0.06"
      />
      {/* 3. Средняя (7.0 – 10.0%) */}
      <rect
        x={padLeft}
        y={yModerate}
        width={chartW}
        height={Math.max(0, yMild - yModerate)}
        fill="#f97316"
        fillOpacity="0.06"
      />
      {/* 4. Тяжёлая (> 10.0%) */}
      <rect
        x={padLeft}
        y={yTop}
        width={chartW}
        height={Math.max(0, yModerate - yTop)}
        fill="#ef4444"
        fillOpacity="0.06"
      />

      {/* ─── Горизонтальные пороговые линии ─── */}
      {/* Порог: Норма 3.5% */}
      <line
        x1={padLeft}
        y1={yNormal}
        x2={padLeft + chartW}
        y2={yNormal}
        stroke="#10b981"
        strokeWidth="1.2"
        strokeDasharray="4 3"
      />
      <text
        x={padLeft + chartW + 6}
        y={yNormal + 3.5}
        fill="#059669"
        fontSize="10"
        fontWeight="600"
      >
        3.5% Норма
      </text>

      {/* Порог: Лёгкая 7.0% */}
      <line
        x1={padLeft}
        y1={yMild}
        x2={padLeft + chartW}
        y2={yMild}
        stroke="#f59e0b"
        strokeWidth="1.2"
        strokeDasharray="4 3"
      />
      <text
        x={padLeft + chartW + 6}
        y={yMild + 3.5}
        fill="#d97706"
        fontSize="10"
        fontWeight="600"
      >
        7.0% Лёгкая
      </text>

      {/* Порог: Средняя 10.0% */}
      <line
        x1={padLeft}
        y1={yModerate}
        x2={padLeft + chartW}
        y2={yModerate}
        stroke="#f97316"
        strokeWidth="1.2"
        strokeDasharray="4 3"
      />
      <text
        x={padLeft + chartW + 6}
        y={yModerate + 3.5}
        fill="#ea580c"
        fontSize="10"
        fontWeight="600"
      >
        10.0% Средняя
      </text>

      {/* Метка "Тяжёлая" в верхней зоне */}
      <text
        x={padLeft + chartW + 6}
        y={yTop + 12}
        fill="#dc2626"
        fontSize="10"
        fontWeight="600"
      >
        &gt;10% Тяжёлая
      </text>

      {/* ─── Сетка по Y (шаг 2%) ─── */}
      {[0, 2, 4, 6, 8, 10, 12].map((yTick) => {
        if (yTick > maxVal) return null;
        const tickY = toY(yTick);
        return (
          <g key={yTick}>
            <line
              x1={padLeft}
              y1={tickY}
              x2={padLeft + chartW}
              y2={tickY}
              stroke="#e2e8f0"
              strokeWidth="0.7"
            />
            <text
              x={padLeft - 6}
              y={tickY + 3.5}
              textAnchor="end"
              fontSize="9"
              fill="#94a3b8"
              fontFamily="monospace"
            >
              {yTick}%
            </text>
          </g>
        );
      })}

      {/* ─── Осевые линии ─── */}
      <line
        x1={padLeft}
        y1={padTop}
        x2={padLeft}
        y2={yBottom}
        stroke="#cbd5e1"
        strokeWidth="1.2"
      />
      <line
        x1={padLeft}
        y1={yBottom}
        x2={padLeft + chartW}
        y2={yBottom}
        stroke="#cbd5e1"
        strokeWidth="1.2"
      />

      {/* Подпись оси Y */}
      <text
        x={padLeft - 26}
        y={padTop + chartH / 2}
        textAnchor="middle"
        fontSize="10"
        fontWeight="600"
        fill="#64748b"
        transform={`rotate(-90, ${padLeft - 26}, ${padTop + chartH / 2})`}
      >
        CVAI (%)
      </text>

      {/* ─── Область и линия тренда ─── */}
      {validPoints.length > 1 && (
        <>
          <path d={areaData} fill="url(#cvaiAreaGrad)" />
          <path
            d={pathData}
            fill="none"
            stroke="url(#cvaiLineGrad)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}

      {/* ─── Вертикальные пунктиры к датам и точки измерений ─── */}
      {validPoints.map((p) => {
        const isSelected = activeId != null && p.item.id === activeId;
        const severity = getSeverityInfo(p.val);

        return (
          <g
            key={p.item.id || p.idx}
            className="cursor-pointer"
            onClick={() => onSelectPoint?.(p.item)}
          >
            {/* Вертикальная направляющая */}
            <line
              x1={p.x}
              y1={p.y}
              x2={p.x}
              y2={yBottom}
              stroke="#cbd5e1"
              strokeWidth="1"
              strokeDasharray="2 2"
            />

            {/* Дата под осью X */}
            <text
              x={p.x}
              y={yBottom + 16}
              textAnchor="middle"
              fontSize="9.5"
              fill={isSelected ? "#0f172a" : "#64748b"}
              fontWeight={isSelected ? "700" : "500"}
              fontFamily="monospace"
            >
              {p.dateLabel}
            </text>

            {/* Ореол активной точки */}
            {isSelected && (
              <circle
                cx={p.x}
                cy={p.y}
                r="9"
                fill={severity.color}
                fillOpacity="0.25"
                className="animate-pulse"
              />
            )}

            {/* Сама точка */}
            <circle
              cx={p.x}
              cy={p.y}
              r={isSelected ? 6 : 4.5}
              fill={severity.color}
              stroke="#ffffff"
              strokeWidth="2"
            />

            {/* Значение CVAI над точкой */}
            <g transform={`translate(${p.x}, ${p.y - 9})`}>
              <rect
                x="-16"
                y="-13"
                width="32"
                height="14"
                rx="3"
                fill="#0f172a"
                fillOpacity="0.85"
              />
              <text
                x="0"
                y="-3"
                textAnchor="middle"
                fontSize="9"
                fontWeight="700"
                fill="#ffffff"
                fontFamily="monospace"
              >
                {p.val.toFixed(1)}%
              </text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Основной компонент HeadDynamicsChart
 */
export default function HeadDynamicsChart({
  measurements: propMeasurements,
  patientId,
  accessToken = "",
  className = "",
  onSelectVisit = null,
}) {
  const [internalList, setInternalList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedVisitId, setSelectedVisitId] = useState(null);

  // Загрузка измерений с бэкенда, если передан patientId и measurements не задан напрямую
  const fetchMeasurements = useCallback(async () => {
    if (!patientId || propMeasurements != null) return;
    setLoading(true);
    setError(null);
    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
      const url = `${baseUrl}/patients/${patientId}/measurements`;
      const headers = {};
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

      const res = await fetch(url, { headers });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setInternalList(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить историю");
    } finally {
      setLoading(false);
    }
  }, [patientId, propMeasurements, accessToken]);

  useEffect(() => {
    void fetchMeasurements();
  }, [fetchMeasurements]);

  // Исходный список измерений
  const rawList = propMeasurements != null ? propMeasurements : internalList;

  // Хронологический список (ASC по measured_at) — для графика
  const chronoList = useMemo(() => {
    return [...rawList].sort((a, b) => {
      const ta = new Date(a.measured_at).getTime() || 0;
      const tb = new Date(b.measured_at).getTime() || 0;
      return ta - tb;
    });
  }, [rawList]);

  // Таблица: сортировка DESC (новые визиты сверху), но дельты считаем относительно хронологического предшественника
  const tableRows = useMemo(() => {
    return chronoList.map((item, idx) => {
      const prev = idx > 0 ? chronoList[idx - 1] : null;
      let cvaiDelta = null;
      let ciDelta = null;

      if (item.cvai_percent != null && prev?.cvai_percent != null) {
        cvaiDelta = Number(item.cvai_percent) - Number(prev.cvai_percent);
      }
      if (item.cephalic_index != null && prev?.cephalic_index != null) {
        ciDelta = Number(item.cephalic_index) - Number(prev.cephalic_index);
      }

      return {
        ...item,
        chronoIndex: idx + 1,
        cvaiDelta,
        ciDelta,
      };
    }).reverse(); // новые сверху для чтения врачом
  }, [chronoList]);

  // Сводка общего тренда
  const summary = useMemo(() => {
    if (chronoList.length < 2) return null;
    const first = chronoList[0];
    const last = chronoList[chronoList.length - 1];
    if (first.cvai_percent == null || last.cvai_percent == null) return null;

    const diff = Number(last.cvai_percent) - Number(first.cvai_percent);
    const isImproving = diff < -0.05; // Снижение CVAI = улучшение
    const isWorsening = diff > 0.05;  // Рост CVAI = ухудшение

    return {
      firstCvai: Number(first.cvai_percent),
      lastCvai: Number(last.cvai_percent),
      diff,
      isImproving,
      isWorsening,
      severity: getSeverityInfo(last.cvai_percent),
    };
  }, [chronoList]);

  const handlePointClick = (item) => {
    setSelectedVisitId(item.id);
    onSelectVisit?.(item);
  };

  return (
    <div className={`flex flex-col gap-4 rounded-xl border border-jude-border bg-jude-surface p-4 shadow-jude ${className}`}>
      {/* ─── Заголовок и действия ─── */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-heading text-base font-semibold text-jude-ink">
            Динамика асимметрии головы (CVAI)
          </h3>
          <p className="text-xs text-jude-muted">
            Хронология визитов и оценка динамики по индексу асимметрии черепа
          </p>
        </div>
        {patientId && (
          <button
            type="button"
            onClick={() => void fetchMeasurements()}
            disabled={loading}
            className="rounded-lg border border-jude-border px-2.5 py-1 text-xs font-medium text-jude-ink hover:bg-jude-surface-muted transition-colors disabled:opacity-50"
          >
            {loading ? "Загрузка..." : "Обновить"}
          </button>
        )}
      </div>

      {/* Ошибка */}
      {error && (
        <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-700">
          {error}
        </div>
      )}

      {/* Пустое состояние */}
      {!loading && chronoList.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-jude-border py-8 text-center">
          <p className="text-sm font-medium text-jude-ink">Замеров пока нет</p>
          <p className="mt-1 text-xs text-jude-muted max-w-sm">
            Выполните разметку ориентиров и нажмите кнопку «Сохранить замер» в панели метрик скана,
            чтобы отслеживать динамику коррекции формы головы по визитам.
          </p>
        </div>
      )}

      {/* ─── Сводная карточка тренда ─── */}
      {summary && (
        <div
          className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 ${
            summary.isImproving
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-900"
              : summary.isWorsening
              ? "border-rose-500/30 bg-rose-500/10 text-rose-900"
              : "border-sky-500/30 bg-sky-500/10 text-sky-900"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">
              {summary.isImproving ? "📉" : summary.isWorsening ? "📈" : "📊"}
            </span>
            <div>
              <p className="text-xs font-semibold">
                {summary.isImproving
                  ? "Положительная динамика (улучшение)"
                  : summary.isWorsening
                  ? "Отрицательная динамика (увеличение асимметрии)"
                  : "Стабильное состояние"}
              </p>
              <p className="text-[11px] opacity-80">
                CVAI: {summary.firstCvai.toFixed(1)}% → {summary.lastCvai.toFixed(1)}% (
                {summary.diff > 0 ? "+" : ""}
                {summary.diff.toFixed(2)}%) за {chronoList.length} визита(-ов)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-jude-muted">Текущая степень:</span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold border ${summary.severity.bgClass} ${summary.severity.textClass} ${summary.severity.borderClass}`}
            >
              {summary.severity.shortLabel} ({summary.lastCvai.toFixed(1)}%)
            </span>
          </div>
        </div>
      )}

      {/* ─── SVG График динамики с порогами ─── */}
      {chronoList.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-jude-border bg-white p-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-semibold text-jude-ink">
              График CVAI с клиническими порогами
            </span>
            <div className="flex items-center gap-3 text-[10px] text-jude-muted">
              <span className="flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500/20 border border-emerald-500" />
                Норма &lt;3.5%
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-500/20 border border-amber-500" />
                Лёгкая 3.5–7%
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 rounded-sm bg-orange-500/20 border border-orange-500" />
                Средняя 7–10%
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 rounded-sm bg-rose-500/20 border border-rose-500" />
                Тяжёлая &gt;10%
              </span>
            </div>
          </div>

          <CvaiDynamicsSvg
            items={chronoList}
            activeId={selectedVisitId}
            onSelectPoint={handlePointClick}
          />

          {chronoList.length === 1 && (
            <p className="text-center text-[11px] text-jude-muted italic py-1">
              Отображён 1 базовый замер. При сохранении замеров последующих визитов здесь будет построен график тренда.
            </p>
          )}
        </div>
      )}

      {/* ─── Таблица визитов с расчётом дельты ─── */}
      {tableRows.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-jude-ink">
              История измерений по визитам ({tableRows.length})
            </span>
            <span className="text-[11px] text-jude-subtle">
              Новые визиты сверху
            </span>
          </div>

          <div className="overflow-x-auto rounded-lg border border-jude-border">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-jude-border bg-jude-surface-muted/70 text-jude-muted">
                  <th className="px-3 py-2 font-semibold">Дата визита</th>
                  <th className="px-3 py-2 font-semibold text-right">CI (%)</th>
                  <th className="px-3 py-2 font-semibold text-right">CVAI (%)</th>
                  <th className="px-3 py-2 font-semibold text-center">Степень</th>
                  <th className="px-3 py-2 font-semibold text-right">
                    Разница с прошлым визитом
                  </th>
                  <th className="px-3 py-2 font-semibold text-right">CVA</th>
                  <th className="px-3 py-2 font-semibold text-right">Ш / Д</th>
                  <th className="px-3 py-2 font-semibold text-right">Срез z</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row, idx) => {
                  const severity = getSeverityInfo(row.cvai_percent);
                  const isSelected = selectedVisitId === row.id;

                  // Определение улучшения/ухудшения по CVAI
                  // Улучшение = CVAI снизился (delta < 0) -> зелёным
                  // Ухудшение = CVAI вырос (delta > 0) -> красным
                  const delta = row.cvaiDelta;
                  const isImprovement = delta != null && delta < -0.05;
                  const isWorsening = delta != null && delta > 0.05;

                  return (
                    <tr
                      key={row.id || idx}
                      onClick={() => handlePointClick(row)}
                      className={`border-b border-jude-border/60 cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-sky-50 font-medium"
                          : "hover:bg-jude-surface-muted/50"
                      }`}
                    >
                      {/* Дата */}
                      <td className="px-3 py-2 font-mono whitespace-nowrap text-jude-ink">
                        {formatDate(row.measured_at)}
                        {idx === 0 && (
                          <span className="ml-1.5 rounded bg-sky-100 px-1 py-0.5 text-[9px] font-semibold text-sky-700">
                            последний
                          </span>
                        )}
                      </td>

                      {/* CI */}
                      <td className="px-3 py-2 text-right font-mono text-jude-ink">
                        {row.cephalic_index != null
                          ? Number(row.cephalic_index).toFixed(1) + "%"
                          : "—"}
                      </td>

                      {/* CVAI */}
                      <td className="px-3 py-2 text-right font-mono font-bold text-jude-ink">
                        {row.cvai_percent != null
                          ? Number(row.cvai_percent).toFixed(1) + "%"
                          : "—"}
                      </td>

                      {/* Степень асимметрии */}
                      <td className="px-3 py-2 text-center whitespace-nowrap">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold border ${severity.bgClass} ${severity.textClass} ${severity.borderClass}`}
                        >
                          {severity.shortLabel}
                        </span>
                      </td>

                      {/* Разница с прошлым визитом (зелёным если улучшение, красным если ухудшение) */}
                      <td className="px-3 py-2 text-right font-mono whitespace-nowrap">
                        {delta == null ? (
                          <span className="text-jude-subtle text-[11px]">— (базовый)</span>
                        ) : isImprovement ? (
                          <span className="font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                            ↓ {Math.abs(delta).toFixed(1)}% (улучшение)
                          </span>
                        ) : isWorsening ? (
                          <span className="font-semibold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                            ↑ +{delta.toFixed(1)}% (ухудшение)
                          </span>
                        ) : (
                          <span className="text-jude-muted">
                            ±0.0% (без изм.)
                          </span>
                        )}
                      </td>

                      {/* CVA (мм) */}
                      <td className="px-3 py-2 text-right font-mono text-jude-muted">
                        {row.cva_mm != null ? Number(row.cva_mm).toFixed(1) + " мм" : "—"}
                      </td>

                      {/* Ширина / Длина */}
                      <td className="px-3 py-2 text-right font-mono text-jude-muted whitespace-nowrap">
                        {row.width_mm != null && row.length_mm != null
                          ? `${Number(row.width_mm).toFixed(0)} / ${Number(row.length_mm).toFixed(0)}`
                          : "—"}
                      </td>

                      {/* Высота среза z */}
                      <td className="px-3 py-2 text-right font-mono text-jude-subtle">
                        {row.slice_z != null ? Number(row.slice_z).toFixed(0) + " мм" : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Клинический дисклеймер и пометка ─── */}
      <div className="flex flex-col gap-1 rounded-lg border border-amber-400/25 bg-amber-400/10 p-2.5 text-[11px] text-amber-800">
        <p className="font-semibold">
          ⚠ Примечание: значения ориентировочные, не клинический вывод
        </p>
        <p className="text-amber-700/90 text-[10.5px] leading-relaxed">
          Расчёт CI и CVAI основывается на геометрическом сечении меша. Сравнение динамики между визитами
          корректно только при воспроизводимой расстановке анатомических ориентиров (переносица, козелки).
          Клиническое решение о продолжении ортезирования принимает лечащий врач.
        </p>
      </div>
    </div>
  );
}
