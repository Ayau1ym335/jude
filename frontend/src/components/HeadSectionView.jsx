import React, { useMemo } from "react";

/**
 * HeadSectionView — 2D-контур поперечного сечения головы (SVG).
 *
 * Ориентация:
 * - Нос сверху (+Y направлен вверх по экрану, Nasion / перед)
 * - Затылок снизу (-Y направлен вниз по экрану, Occiput / зад)
 * - Левая сторона пациента слева (-X в СК головы, Left / L)
 * - Правая сторона пациента справа (+X в СК головы, Right / R)
 *
 * Элементы:
 * - Замкнутый контур головы в масштабе
 * - Координатные оси X и Y
 * - Лёгкая сетка с шагом 10 мм
 * - Две диагонали A и B разными контрастными цветами с выносками длин в мм
 * - Чёткие анатомические подписи сторон пациента
 */

export const COLOR_DIAG_A = "#0284c7"; // Голубой / индиго (A: Лево-назад <-> Право-вперёд)
export const COLOR_DIAG_B = "#ea580c"; // Оранжевый / коралл (B: Право-назад <-> Лево-вперёд)

export default function HeadSectionView({
  contour = [],
  diagPoints = null,
  diagAMm = null,
  diagBMm = null,
  diagALabel = "Лево-назад ↔ Право-вперёд",
  diagBLabel = "Право-назад ↔ Лево-вперёд",
  longerDiagonal = null,
  shorterDiagonal = null,
  sliceHeightMm = null,
  showGrid = true,
  showAxes = true,
  showDiagonals = true,
  width = 360,
  height = 360,
  className = "",
}) {
  // Проверка наличия и замкнутости контура
  const isValidContour = Array.isArray(contour) && contour.length >= 3;

  // Вычисление геометрии и масштабных коэффициентов
  const geometry = useMemo(() => {
    if (!isValidContour) return null;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    contour.forEach(([x, y]) => {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    });

    // Учитываем точки диагоналей
    if (diagPoints) {
      if (diagPoints.center) {
        const [cx, cy] = diagPoints.center;
        minX = Math.min(minX, cx);
        maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy);
        maxY = Math.max(maxY, cy);
      }
      ["diag_a", "diag_b"].forEach((k) => {
        const pts = diagPoints[k];
        if (Array.isArray(pts)) {
          pts.forEach(([x, y]) => {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          });
        }
      });
    }

    // Симметричный охват относительно центра контура для гармоничного отображения
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const halfSpanX = Math.max(Math.abs(maxX - centerX), Math.abs(minX - centerX), 40);
    const halfSpanY = Math.max(Math.abs(maxY - centerY), Math.abs(minY - centerY), 40);

    // Добавляем отступ 22 мм для подписей осей и сетки
    const marginMm = 22;
    const rangeX = (halfSpanX + marginMm) * 2;
    const rangeY = (halfSpanY + marginMm) * 2;

    const paddingPx = 36;
    const availableW = width - paddingPx * 2;
    const availableH = height - paddingPx * 2;

    // Единый масштаб по X и Y (сохраняем пропорции 1:1)
    const scale = Math.min(availableW / rangeX, availableH / rangeY);

    // Преобразование мм в экранные координаты SVG:
    // +X -> вправо (screenX растет)
    // +Y -> вверх по экрану (screenY уменьшается, так как SVG Y растет вниз)
    const toScreenX = (xMm) => width / 2 + (xMm - centerX) * scale;
    const toScreenY = (yMm) => height / 2 - (yMm - centerY) * scale;

    // Сетка 10 мм
    const gridStepMm = 10;
    const gridMinX = Math.floor((centerX - halfSpanX - marginMm) / gridStepMm) * gridStepMm;
    const gridMaxX = Math.ceil((centerX + halfSpanX + marginMm) / gridStepMm) * gridStepMm;
    const gridMinY = Math.floor((centerY - halfSpanY - marginMm) / gridStepMm) * gridStepMm;
    const gridMaxY = Math.ceil((centerY + halfSpanY + marginMm) / gridStepMm) * gridStepMm;

    const vGridLines = [];
    for (let x = gridMinX; x <= gridMaxX; x += gridStepMm) {
      vGridLines.push({
        val: x,
        screenX: toScreenX(x),
        isMajor: x === 0,
      });
    }

    const hGridLines = [];
    for (let y = gridMinY; y <= gridMaxY; y += gridStepMm) {
      hGridLines.push({
        val: y,
        screenY: toScreenY(y),
        isMajor: y === 0,
      });
    }

    // SVG path контура
    const pathD =
      "M " +
      contour.map(([x, y]) => `${toScreenX(x).toFixed(1)},${toScreenY(y).toFixed(1)}`).join(" L ") +
      " Z";

    return {
      centerX,
      centerY,
      toScreenX,
      toScreenY,
      vGridLines,
      hGridLines,
      pathD,
      scale,
    };
  }, [contour, diagPoints, isValidContour, width, height]);

  if (!isValidContour || !geometry) {
    return (
      <div
        className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-jude-border bg-jude-surface-muted/50 p-6 text-center ${className}`}
        style={{ width, minHeight: height }}
      >
        <svg
          className="mb-2 h-10 w-10 text-jude-muted/60"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <p className="text-sm font-medium text-jude-ink">Нет данных контура сечения</p>
        <p className="mt-1 max-w-[240px] text-xs text-jude-muted">
          Контур не замкнут или сечение ещё не рассчитано. Проверьте ориентиры и запустите расчёт.
        </p>
      </div>
    );
  }

  const { toScreenX, toScreenY, vGridLines, hGridLines, pathD } = geometry;

  // Точки диагоналей
  const diagAPoints = diagPoints?.diag_a;
  const diagBPoints = diagPoints?.diag_b;
  const centerPt = diagPoints?.center;

  return (
    <div className={`relative flex flex-col items-center select-none ${className}`}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="overflow-visible rounded-xl border border-jude-border bg-jude-canvas shadow-inner"
      >
        <defs>
          <radialGradient id="section-fill-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.03" />
          </radialGradient>
        </defs>

        {/* ─── 1. Сетка с шагом 10 мм ─── */}
        {showGrid && (
          <g className="grid-layer">
            {vGridLines.map((line) => (
              <line
                key={`v-${line.val}`}
                x1={line.screenX}
                y1={24}
                x2={line.screenX}
                y2={height - 24}
                stroke={line.isMajor ? "#94a3b8" : "#cbd5e1"}
                strokeWidth={line.isMajor ? 1.0 : 0.5}
                strokeDasharray={line.isMajor ? "none" : "2 2"}
                strokeOpacity={line.isMajor ? 0.6 : 0.4}
              />
            ))}
            {hGridLines.map((line) => (
              <line
                key={`h-${line.val}`}
                x1={24}
                y1={line.screenY}
                x2={width - 24}
                y2={line.screenY}
                stroke={line.isMajor ? "#94a3b8" : "#cbd5e1"}
                strokeWidth={line.isMajor ? 1.0 : 0.5}
                strokeDasharray={line.isMajor ? "none" : "2 2"}
                strokeOpacity={line.isMajor ? 0.6 : 0.4}
              />
            ))}
          </g>
        )}

        {/* ─── 2. Оси X/Y ─── */}
        {showAxes && (
          <g className="axes-layer">
            {/* Ось Y (Вперёд-Назад) */}
            <line
              x1={toScreenX(0)}
              y1={20}
              x2={toScreenX(0)}
              y2={height - 20}
              stroke="#64748b"
              strokeWidth={1.2}
              strokeDasharray="4 3"
            />
            {/* Ось X (Влево-Вправо) */}
            <line
              x1={20}
              y1={toScreenY(0)}
              x2={width - 20}
              y2={toScreenY(0)}
              stroke="#64748b"
              strokeWidth={1.2}
              strokeDasharray="4 3"
            />
          </g>
        )}

        {/* ─── 3. Контур сечения головы ─── */}
        <g className="contour-layer">
          <path
            d={pathD}
            fill="url(#section-fill-grad)"
            stroke="#2563eb"
            strokeWidth={2.4}
            strokeLinejoin="round"
          />
        </g>

        {/* ─── 4. Диагонали сечения ─── */}
        {showDiagonals && diagPoints && (
          <g className="diagonals-layer">
            {/* Диагональ A */}
            {diagAPoints && diagAPoints.length === 2 && (
              <g>
                <line
                  x1={toScreenX(diagAPoints[0][0])}
                  y1={toScreenY(diagAPoints[0][1])}
                  x2={toScreenX(diagAPoints[1][0])}
                  y2={toScreenY(diagAPoints[1][1])}
                  stroke={COLOR_DIAG_A}
                  strokeWidth={2.2}
                  strokeLinecap="round"
                />
                <circle
                  cx={toScreenX(diagAPoints[0][0])}
                  cy={toScreenY(diagAPoints[0][1])}
                  r={3.5}
                  fill={COLOR_DIAG_A}
                  stroke="#ffffff"
                  strokeWidth={1.5}
                />
                <circle
                  cx={toScreenX(diagAPoints[1][0])}
                  cy={toScreenY(diagAPoints[1][1])}
                  r={3.5}
                  fill={COLOR_DIAG_A}
                  stroke="#ffffff"
                  strokeWidth={1.5}
                />
              </g>
            )}

            {/* Диагональ B */}
            {diagBPoints && diagBPoints.length === 2 && (
              <g>
                <line
                  x1={toScreenX(diagBPoints[0][0])}
                  y1={toScreenY(diagBPoints[0][1])}
                  x2={toScreenX(diagBPoints[1][0])}
                  y2={toScreenY(diagBPoints[1][1])}
                  stroke={COLOR_DIAG_B}
                  strokeWidth={2.2}
                  strokeLinecap="round"
                />
                <circle
                  cx={toScreenX(diagBPoints[0][0])}
                  cy={toScreenY(diagBPoints[0][1])}
                  r={3.5}
                  fill={COLOR_DIAG_B}
                  stroke="#ffffff"
                  strokeWidth={1.5}
                />
                <circle
                  cx={toScreenX(diagBPoints[1][0])}
                  cy={toScreenY(diagBPoints[1][1])}
                  r={3.5}
                  fill={COLOR_DIAG_B}
                  stroke="#ffffff"
                  strokeWidth={1.5}
                />
              </g>
            )}

            {/* Центр сечения */}
            {centerPt && (
              <g>
                <circle
                  cx={toScreenX(centerPt[0])}
                  cy={toScreenY(centerPt[1])}
                  r={3}
                  fill="#0f172a"
                  stroke="#ffffff"
                  strokeWidth={1}
                />
              </g>
            )}
          </g>
        )}

        {/* ─── 5. Анатомические подписи сторон ─── */}
        {/* Нос (сверху) */}
        <text
          x={width / 2}
          y={15}
          textAnchor="middle"
          className="fill-jude-ink font-sans text-[11px] font-semibold"
        >
          ▲ Нос (перед)
        </text>

        {/* Затылок (снизу) */}
        <text
          x={width / 2}
          y={height - 6}
          textAnchor="middle"
          className="fill-jude-muted font-sans text-[11px] font-medium"
        >
          ▼ Затылок (зад)
        </text>

        {/* Левая сторона пациента (слева на экране при виде сверху) */}
        <g transform={`translate(12, ${height / 2}) rotate(-90)`}>
          <text
            x={0}
            y={0}
            textAnchor="middle"
            className="fill-jude-muted font-sans text-[10px] font-medium tracking-wide"
          >
            ◀ Левая сторона пациента (L)
          </text>
        </g>

        {/* Правая сторона пациента (справа на экране при виде сверху) */}
        <g transform={`translate(${width - 12}, ${height / 2}) rotate(90)`}>
          <text
            x={0}
            y={0}
            textAnchor="middle"
            className="fill-jude-muted font-sans text-[10px] font-medium tracking-wide"
          >
            Правая сторона пациента (R) ▶
          </text>
        </g>
      </svg>

      {/* ─── 6. Легенда диагоналей и масштаб ─── */}
      <div className="mt-3 flex w-full flex-col gap-1.5 px-2 text-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ backgroundColor: COLOR_DIAG_A }}
            />
            <span className="font-medium text-jude-ink">Диагональ A:</span>
            <span className="font-mono font-semibold text-jude-ink">
              {diagAMm != null ? `${Number(diagAMm).toFixed(1)} мм` : "—"}
            </span>
            {shorterDiagonal === "A" && (
              <span className="rounded bg-rose-100 px-1 py-0.5 text-[10px] font-medium text-rose-700">
                короче
              </span>
            )}
            {longerDiagonal === "A" && (
              <span className="rounded bg-sky-100 px-1 py-0.5 text-[10px] font-medium text-sky-700">
                длиннее
              </span>
            )}
          </div>
          <span className="text-[11px] text-jude-subtle">L-зад ↔ R-перед</span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ backgroundColor: COLOR_DIAG_B }}
            />
            <span className="font-medium text-jude-ink">Диагональ B:</span>
            <span className="font-mono font-semibold text-jude-ink">
              {diagBMm != null ? `${Number(diagBMm).toFixed(1)} мм` : "—"}
            </span>
            {shorterDiagonal === "B" && (
              <span className="rounded bg-rose-100 px-1 py-0.5 text-[10px] font-medium text-rose-700">
                короче
              </span>
            )}
            {longerDiagonal === "B" && (
              <span className="rounded bg-sky-100 px-1 py-0.5 text-[10px] font-medium text-sky-700">
                длиннее
              </span>
            )}
          </div>
          <span className="text-[11px] text-jude-subtle">R-зад ↔ L-перед</span>
        </div>

        <div className="mt-1 flex items-center justify-between text-[11px] text-jude-muted border-t border-jude-border/50 pt-1.5">
          <span>Сетка: шаг 10 мм</span>
          {sliceHeightMm != null && (
            <span>Высота среза: <strong className="text-jude-ink">{Number(sliceHeightMm).toFixed(1)} мм</strong></span>
          )}
        </div>
      </div>
    </div>
  );
}
