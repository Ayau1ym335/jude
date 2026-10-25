import React, { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import HeadSectionView from "./HeadSectionView";

/**
 * HeadMetricsPanel — панель метрик поперечного сечения головы (CI, CVAI, диагонали)
 * и синхронизированный 2D/3D просмотр среза.
 *
 * Требования:
 * - Запрос POST /api/geometry/head-metrics при открытии, кнопка «Пересчитать»
 * - Таблица: ширина, длина, CI, окружность, диагональ A, диагональ B, CVA (мм), CVAI (%), сторона асимметрии
 * - Подписи сторон: «левая/правая сторона пациента»
 * - Слайдер уровня сечения (по умолчанию авто, при изменении — пересчёт)
 * - Пометка: «значения ориентировочные, не клинический вывод»
 * - Отрисовка 3D-линии сечения на модели в Three.js на заданной высоте
 */

export const DEFAULT_DIAG_ANGLE_DEG = 30.0;
export const DEFAULT_MANUAL_H_SLICE = 30.0;
export const H_SLICE_MIN = 10.0;
export const H_SLICE_MAX = 80.0;

function buildHeadFrame(nasion, tl, tr) {
  const n = new THREE.Vector3(...nasion);
  const tlV = new THREE.Vector3(...tl);
  const trV = new THREE.Vector3(...tr);
  const origin = new THREE.Vector3().addVectors(tlV, trV).multiplyScalar(0.5);

  const ex = new THREE.Vector3().subVectors(trV, tlV);
  const exLen = ex.length();
  if (exLen < 1e-6) return null;
  ex.divideScalar(exLen);

  const ey = new THREE.Vector3().subVectors(n, origin);
  ey.addScaledVector(ex, -ey.dot(ex));
  const eyLen = ey.length();
  if (eyLen < 1e-6) return null;
  ey.divideScalar(eyLen);

  const ez = new THREE.Vector3().crossVectors(ex, ey);
  return { origin, ex, ey, ez };
}

export default function HeadMetricsPanel({
  viewerRef,
  scanId,
  patientId = null,
  accessToken = "",
  hasLandmarks = false,
  initialMetrics = null,
  embedded = false,
  className = "",
  onMetricsLoaded = null,
  onMeasurementSaved = null,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [metrics, setMetrics] = useState(initialMetrics);
  const [savingMeasurement, setSavingMeasurement] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // Режим высоты среза
  const [autoSlice, setAutoSlice] = useState(true);
  const [manualSliceHeight, setManualSliceHeight] = useState(DEFAULT_MANUAL_H_SLICE);
  const [diagAngle, setDiagAngle] = useState(DEFAULT_DIAG_ANGLE_DEG);

  // Отображение в 3D
  const [show3DLine, setShow3DLine] = useState(true);

  // Видимость 2D контура (раскрыт/свернут)
  const [show2DSection, setShow2DSection] = useState(true);

  // Сохраненные ориентиры для построения 3D линии
  const landmarksRef = useRef(null);
  const sceneObjectsRef = useRef([]);

  // Получить сцену из viewer
  const getScene = useCallback(() => {
    const handle = viewerRef?.current;
    if (!handle) return null;
    const mesh = handle.getMesh?.();
    if (mesh?.parent) return mesh.parent;
    return null;
  }, [viewerRef]);

  // Очистить объекты 3D-сечения
  const clear3DSectionObjects = useCallback(() => {
    sceneObjectsRef.current.forEach((obj) => {
      obj.parent?.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      const mat = obj.material;
      if (mat) {
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      }
    });
    sceneObjectsRef.current = [];
  }, []);

  // Очистка при размонтировании
  useEffect(() => {
    return () => {
      clear3DSectionObjects();
    };
  }, [clear3DSectionObjects]);

  // Загрузка ориентиров
  const loadLandmarks = useCallback(async () => {
    if (!scanId) return null;
    if (landmarksRef.current) return landmarksRef.current;

    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
      const url = `${baseUrl}/scans/${scanId}/landmarks`;
      const headers = {};
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }
      const res = await fetch(url, { headers });
      if (!res.ok) return null;
      const data = await res.json();
      landmarksRef.current = data;
      return data;
    } catch {
      return null;
    }
  }, [scanId, accessToken]);

  // Отрисовка 3D-линии сечения на модели
  const update3DSection = useCallback(
    async (currentMetrics) => {
      clear3DSectionObjects();
      if (!show3DLine || !currentMetrics || !currentMetrics.contour || currentMetrics.contour.length < 3) {
        return;
      }

      const scene = getScene();
      if (!scene) return;

      const lm = await loadLandmarks();
      if (!lm || !lm.nasion || !lm.tragus_left || !lm.tragus_right) return;

      const frame = buildHeadFrame(lm.nasion, lm.tragus_left, lm.tragus_right);
      if (!frame) return;

      const { origin, ex, ey, ez } = frame;
      const zMm = currentMetrics.slice_height_mm;

      // 1. Замкнутый контур сечения в 3D
      const worldPoints = currentMetrics.contour.map(([x, y]) => {
        return new THREE.Vector3()
          .copy(origin)
          .addScaledVector(ex, x)
          .addScaledVector(ey, y)
          .addScaledVector(ez, zMm);
      });

      const lineGeo = new THREE.BufferGeometry().setFromPoints(worldPoints);
      const lineMat = new THREE.LineBasicMaterial({
        color: 0x06b6d4, // Циан/бирюзовый
        linewidth: 2,
        depthTest: true,
      });
      const lineLoop = new THREE.LineLoop(lineGeo, lineMat);
      lineLoop.name = "head_section_3d_contour";

      scene.add(lineLoop);
      sceneObjectsRef.current.push(lineLoop);

      // 2. Диагонали в 3D
      if (currentMetrics.diag_points) {
        const { diag_a, diag_b } = currentMetrics.diag_points;
        if (diag_a && diag_a.length === 2) {
          const ptA1 = new THREE.Vector3()
            .copy(origin)
            .addScaledVector(ex, diag_a[0][0])
            .addScaledVector(ey, diag_a[0][1])
            .addScaledVector(ez, zMm);
          const ptA2 = new THREE.Vector3()
            .copy(origin)
            .addScaledVector(ex, diag_a[1][0])
            .addScaledVector(ey, diag_a[1][1])
            .addScaledVector(ez, zMm);
          const geoA = new THREE.BufferGeometry().setFromPoints([ptA1, ptA2]);
          const matA = new THREE.LineBasicMaterial({ color: 0x0284c7, linewidth: 2 });
          const lineA = new THREE.Line(geoA, matA);
          lineA.name = "head_section_3d_diag_a";
          scene.add(lineA);
          sceneObjectsRef.current.push(lineA);
        }

        if (diag_b && diag_b.length === 2) {
          const ptB1 = new THREE.Vector3()
            .copy(origin)
            .addScaledVector(ex, diag_b[0][0])
            .addScaledVector(ey, diag_b[0][1])
            .addScaledVector(ez, zMm);
          const ptB2 = new THREE.Vector3()
            .copy(origin)
            .addScaledVector(ex, diag_b[1][0])
            .addScaledVector(ey, diag_b[1][1])
            .addScaledVector(ez, zMm);
          const geoB = new THREE.BufferGeometry().setFromPoints([ptB1, ptB2]);
          const matB = new THREE.LineBasicMaterial({ color: 0xea580c, linewidth: 2 });
          const lineB = new THREE.Line(geoB, matB);
          lineB.name = "head_section_3d_diag_b";
          scene.add(lineB);
          sceneObjectsRef.current.push(lineB);
        }
      }
    },
    [clear3DSectionObjects, getScene, loadLandmarks, show3DLine]
  );

  // Вызов API для расчета метрик
  const fetchMetrics = useCallback(
    async (isAuto = autoSlice, hVal = manualSliceHeight, angle = diagAngle) => {
      if (!scanId || !hasLandmarks) {
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
        const url = `${baseUrl}/geometry/head-metrics`;

        const headers = {
          "Content-Type": "application/json",
        };
        if (accessToken) {
          headers.Authorization = `Bearer ${accessToken}`;
        }

        const bodyPayload = {
          scan_id: scanId,
          h_slice: isAuto ? null : Number(hVal),
          diag_angle_deg: Number(angle),
        };

        const res = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(bodyPayload),
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({ detail: res.statusText }));
          throw new Error(errBody.detail ?? `HTTP ${res.status}`);
        }

        const data = await res.json();
        setMetrics(data);
        if (isAuto && data.slice_height_mm != null) {
          setManualSliceHeight(data.slice_height_mm);
        }
        onMetricsLoaded?.(data);
        await update3DSection(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка расчёта метрик");
      } finally {
        setLoading(false);
      }
    },
    [scanId, hasLandmarks, autoSlice, manualSliceHeight, diagAngle, accessToken, onMetricsLoaded, update3DSection]
  );

  // Сохранить текущее измерение в историю визитов (POST /scans/{id}/measurements)
  const handleSaveMeasurement = useCallback(async () => {
    if (!scanId || !metrics) return;
    setSavingMeasurement(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
      const url = `${baseUrl}/scans/${scanId}/measurements`;
      const headers = {
        "Content-Type": "application/json",
      };
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }

      const bodyPayload = {
        slice_z: metrics.slice_height_mm,
        width_mm: metrics.width_mm,
        length_mm: metrics.length_mm,
        cephalic_index: metrics.cephalic_index,
        circumference_mm: metrics.circumference_mm,
        diag_a_mm: metrics.diag_a_mm,
        diag_b_mm: metrics.diag_b_mm,
        cva_mm: metrics.cva_mm,
        cvai_percent: metrics.cvai_percent,
        params: {
          diag_angle_deg: diagAngle,
          slice_height_mm: metrics.slice_height_mm,
          auto_slice: autoSlice,
          manual_slice_height: manualSliceHeight,
        },
        algorithm_version: "v0.1",
      };
      if (patientId) {
        bodyPayload.patient_id = patientId;
      }

      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(bodyPayload),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(errBody.detail ?? `HTTP ${res.status}`);
      }

      const savedData = await res.json();
      setSaveSuccess(true);
      onMeasurementSaved?.(savedData);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Ошибка сохранения замера");
    } finally {
      setSavingMeasurement(false);
    }
  }, [scanId, metrics, patientId, diagAngle, autoSlice, manualSliceHeight, accessToken, onMeasurementSaved]);

  // Первоначальный запрос при открытии или изменении hasLandmarks
  useEffect(() => {
    if (hasLandmarks && scanId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void fetchMetrics();
    }
  }, [hasLandmarks, scanId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Обновление 3D при переключении чекбокса show3DLine
  useEffect(() => {
    if (metrics) {
      void update3DSection(metrics);
    }
  }, [show3DLine]); // eslint-disable-line react-hooks/exhaustive-deps

  // Обработчик переключения Авто / Ручной
  const handleAutoToggle = (e) => {
    const isAuto = e.target.checked;
    setAutoSlice(isAuto);
    void fetchMetrics(isAuto, manualSliceHeight, diagAngle);
  };

  // Обработчик изменения слайдера уровня сечения
  const handleSliderChange = (e) => {
    const val = parseFloat(e.target.value);
    setManualSliceHeight(val);
  };

  const handleSliderCommit = () => {
    if (!autoSlice) {
      void fetchMetrics(false, manualSliceHeight, diagAngle);
    }
  };

  return (
    <div
      className={`rounded-xl border border-jude-border bg-jude-surface p-4 shadow-jude ${className}`}
    >
      {/* ─── Заголовок и статус ─── */}
      <div className="flex items-center justify-between border-b border-jude-border pb-3">
        <div>
          <h3 className="font-heading text-sm font-semibold text-jude-ink">
            Сечение и метрики головы
          </h3>
          <p className="text-[11px] text-jude-muted">
            Ширина, длина, CI, окружность, диагонали A/B и CVAI (левая/правая сторона указаны со стороны пациента)
          </p>
        </div>
        <button
          type="button"
          onClick={() => void fetchMetrics(autoSlice, manualSliceHeight, diagAngle)}
          disabled={loading || !hasLandmarks}
          className="inline-flex items-center gap-1.5 rounded-lg border border-jude-border bg-jude-surface px-2.5 py-1 text-xs font-medium text-jude-ink transition-colors hover:bg-jude-surface-muted disabled:opacity-50"
        >
          {loading ? (
            <svg
              className="h-3.5 w-3.5 animate-spin text-jude-primary"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              />
            </svg>
          ) : (
            <svg
              className="h-3.5 w-3.5 text-jude-muted"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          )}
          <span>Пересчитать</span>
        </button>
      </div>

      {/* ─── Блокировка при отсутствии ориентиров ─── */}
      {!hasLandmarks && (
        <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-700">
          <p className="font-medium">Требуется расстановка анатомических ориентиров</p>
          <p className="mt-0.5 text-amber-600/90">
            Для определения системы координат головы и расчёта сечения установите переносицу и козелки ушей в инструменте ориентиров.
          </p>
        </div>
      )}

      {/* ─── Ошибка запроса ─── */}
      {error && (
        <div className="mt-3 rounded-lg border border-rose-500/20 bg-rose-500/10 p-2.5 text-xs text-rose-700">
          {error}
        </div>
      )}

      {hasLandmarks && (
        <>
          {/* ─── Обязательная пометка: не клинический диагноз ─── */}
          <div className="mt-3 rounded-lg border border-sky-500/20 bg-sky-500/5 px-3 py-2 text-[11px] text-sky-800">
            <span className="font-semibold">Примечание:</span> значения ориентировочные, не клинический вывод. Показатели требуют подтверждения врачом согласно клиническому протоколу.
          </div>

          {/* ─── Управление уровнем сечения ─── */}
          <div className="mt-3 rounded-lg border border-jude-border bg-jude-surface-muted/40 p-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-medium text-jude-ink">Уровень сечения:</span>
              <label className="flex items-center gap-1.5 cursor-pointer text-jude-muted select-none">
                <input
                  type="checkbox"
                  checked={autoSlice}
                  onChange={handleAutoToggle}
                  className="rounded border-jude-border text-jude-primary focus:ring-jude-primary"
                />
                <span>Авто (макс. окружность)</span>
              </label>
            </div>

            {/* Слайдер высоты */}
            <div className="mt-2.5 flex flex-col gap-1">
              <div className="flex justify-between text-[11px] text-jude-muted">
                <span>{H_SLICE_MIN} мм</span>
                <span className="font-mono font-medium text-jude-ink">
                  {autoSlice && metrics?.slice_height_mm != null
                    ? `${Number(metrics.slice_height_mm).toFixed(1)} мм (авто)`
                    : `${Number(manualSliceHeight).toFixed(1)} мм`}
                </span>
                <span>{H_SLICE_MAX} мм</span>
              </div>
              <input
                type="range"
                min={H_SLICE_MIN}
                max={H_SLICE_MAX}
                step={1}
                value={manualSliceHeight}
                disabled={autoSlice || loading}
                onChange={handleSliderChange}
                onMouseUp={handleSliderCommit}
                onTouchEnd={handleSliderCommit}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-jude-border accent-jude-primary disabled:opacity-40"
              />
              <p className="text-[10px] text-jude-subtle">
                Высота горизонтального среза над плоскостью козелков (мм)
              </p>
            </div>

            {/* Чекбокс отображения 3D линии */}
            <div className="mt-2.5 flex items-center justify-between border-t border-jude-border/50 pt-2 text-[11px]">
              <label className="flex items-center gap-1.5 cursor-pointer text-jude-muted select-none">
                <input
                  type="checkbox"
                  checked={show3DLine}
                  onChange={(e) => setShow3DLine(e.target.checked)}
                  className="rounded border-jude-border text-jude-primary focus:ring-jude-primary"
                />
                <span>Показывать линию сечения на 3D-модели</span>
              </label>

              <button
                type="button"
                onClick={() => setShow2DSection((prev) => !prev)}
                className="text-jude-primary hover:underline text-[11px]"
              >
                {show2DSection ? "Скрыть 2D-вид" : "Показать 2D-вид"}
              </button>
            </div>
          </div>

          {/* ─── Таблица метрик ─── */}
          {metrics && (
            <div className="mt-3 overflow-hidden rounded-lg border border-jude-border bg-jude-surface text-xs">
              <table className="w-full text-left border-collapse">
                <tbody>
                  <tr className="border-b border-jude-border/60 hover:bg-jude-surface-muted/50">
                    <td className="px-3 py-1.5 text-jude-muted">Ширина головы</td>
                    <td className="px-3 py-1.5 text-right font-mono font-medium text-jude-ink">
                      {metrics.width_mm} мм
                    </td>
                  </tr>
                  <tr className="border-b border-jude-border/60 hover:bg-jude-surface-muted/50">
                    <td className="px-3 py-1.5 text-jude-muted">Длина головы</td>
                    <td className="px-3 py-1.5 text-right font-mono font-medium text-jude-ink">
                      {metrics.length_mm} мм
                    </td>
                  </tr>
                  <tr className="border-b border-jude-border/60 hover:bg-jude-surface-muted/50">
                    <td className="px-3 py-1.5 text-jude-muted">
                      Цефалический индекс (CI)
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono font-semibold text-jude-ink">
                      {metrics.cephalic_index}%
                    </td>
                  </tr>
                  <tr className="border-b border-jude-border/60 hover:bg-jude-surface-muted/50">
                    <td className="px-3 py-1.5 text-jude-muted">Окружность (периметр)</td>
                    <td className="px-3 py-1.5 text-right font-mono font-medium text-jude-ink">
                      {metrics.circumference_mm} мм
                    </td>
                  </tr>
                  <tr className="border-b border-jude-border/60 hover:bg-jude-surface-muted/50">
                    <td className="px-3 py-1.5 text-jude-muted">
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-[#0284c7]" />
                        Диагональ A (L-зад / R-перед)
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono font-medium text-jude-ink">
                      {metrics.diag_a_mm} мм
                    </td>
                  </tr>
                  <tr className="border-b border-jude-border/60 hover:bg-jude-surface-muted/50">
                    <td className="px-3 py-1.5 text-jude-muted">
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-[#ea580c]" />
                        Диагональ B (R-зад / L-перед)
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono font-medium text-jude-ink">
                      {metrics.diag_b_mm} мм
                    </td>
                  </tr>
                  <tr className="border-b border-jude-border/60 hover:bg-jude-surface-muted/50">
                    <td className="px-3 py-1.5 text-jude-muted">
                      Разность диагоналей (CVA)
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono font-semibold text-jude-ink">
                      {metrics.cva_mm} мм
                    </td>
                  </tr>
                  <tr className="border-b border-jude-border/60 hover:bg-jude-surface-muted/50 bg-jude-surface-muted/30">
                    <td className="px-3 py-1.5 font-medium text-jude-ink">
                      Индекс асимметрии (CVAI)
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono font-bold text-jude-primary">
                      {metrics.cvai_percent}%
                    </td>
                  </tr>
                  <tr className="hover:bg-jude-surface-muted/50">
                    <td className="px-3 py-2 text-jude-muted" colSpan={2}>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[11px] font-medium text-jude-ink">
                          Сторона асимметрии:
                        </span>
                        <span className="text-[11px] text-jude-ink font-semibold">
                          {metrics.asymmetry_direction}
                        </span>
                        <span className="text-[10px] text-jude-subtle mt-0.5">
                          ⚠️ Левая и правая стороны указаны со стороны пациента (L/R)
                        </span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* ─── Кнопка «Сохранить замер» в историю визитов ─── */}
          {metrics && (
            <div className="mt-3 flex flex-col gap-1.5">
              <button
                type="button"
                onClick={handleSaveMeasurement}
                disabled={savingMeasurement || loading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-jude-primary px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-jude-primary/90 transition-colors disabled:opacity-50"
              >
                {savingMeasurement ? (
                  <>
                    <svg
                      className="h-3.5 w-3.5 animate-spin text-white"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                      />
                    </svg>
                    <span>Сохранение замера...</span>
                  </>
                ) : (
                  <>
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
                      />
                    </svg>
                    <span>Сохранить замер</span>
                  </>
                )}
              </button>

              {saveSuccess && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-center text-xs font-medium text-emerald-800">
                  ✓ Замер сохранён в историю визитов пациента
                </div>
              )}

              {saveError && (
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-700">
                  {saveError}
                </div>
              )}
            </div>
          )}

          {/* ─── 2D-вид сечения головы (SVG) ─── */}
          {metrics && show2DSection && (
            <div className="mt-4 flex flex-col items-center">
              <HeadSectionView
                contour={metrics.contour}
                diagPoints={metrics.diag_points}
                diagAMm={metrics.diag_a_mm}
                diagBMm={metrics.diag_b_mm}
                diagALabel={metrics.diag_a_label}
                diagBLabel={metrics.diag_b_label}
                longerDiagonal={metrics.longer_diagonal}
                shorterDiagonal={metrics.shorter_diagonal}
                sliceHeightMm={metrics.slice_height_mm}
                width={308}
                height={308}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
