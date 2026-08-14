"use client";

import { useState, useCallback, useEffect } from "react";
import type { ModelViewerHandle } from "@/components/ModelViewer";
import type React from "react";

/**
 * SmoothingTool — панель инструмента локального Laplacian-сглаживания.
 *
 * Интеграция в viewer/page.tsx (следующий день):
 *   <ModelViewer ref={viewerRef} file={scanFile}
 *     onMeshClick={handleMeshClick} pickMode={smoothingPickMode} />
 *   <SmoothingTool viewerRef={viewerRef} scanId={scan.id} versionId={version.id}
 *     onApplied={(newUrl) => { ... }} />
 *
 * Компонент не навешивает события напрямую на canvas — использует пропсы
 * onMeshClick/pickMode ModelViewer, который уже реализует raycasting через
 * нативный Three.js (без @react-three/fiber). Это консистентно с тем,
 * как работает TrimLineDrawer.
 *
 * Параметры сглаживания (radius, intensity) — инженерные ориентиры,
 * не клинически провалидированные значения.
 */

interface SmoothingToolProps {
  /** Ref на ModelViewerHandle — нужен для определения pick mode */
  viewerRef: React.RefObject<ModelViewerHandle | null>;
  /** UUID скана из таблицы scans */
  scanId: string;
  /** UUID родительской версии проекта */
  versionId: string;
  /** Вызывается после успешного сохранения с storage path нового mesh */
  onApplied: (newMeshUrl: string) => void;
  /** Внешний обработчик: сообщает SmoothingTool о клике на mesh из ModelViewer */
  pickedPoint: [number, number, number] | null;
  /** Флаг: активен ли режим выбора точки (для отображения состояния) */
  isPickMode: boolean;
  /** Переключить pick mode снаружи (родитель контролирует ModelViewer pickMode) */
  onTogglePickMode: (active: boolean) => void;
}

export default function SmoothingTool({
  viewerRef,
  scanId,
  versionId,
  onApplied,
  pickedPoint,
  isPickMode,
  onTogglePickMode,
}: SmoothingToolProps) {
  const [radius, setRadius] = useState(15);
  const [intensity, setIntensity] = useState(0.5);
  const [applying, setApplying] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{
    movedVertices: number;
    url: string;
  } | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

  // Синхронизация preview-сферы в 3D-сцене с выбранной точкой и радиусом
  useEffect(() => {
    const viewer = viewerRef.current;
    if (pickedPoint) {
      viewer?.showPreviewSphere(pickedPoint, radius);
    } else {
      viewer?.hidePreviewSphere();
    }
    return () => {
      viewer?.hidePreviewSphere();
    };
  }, [pickedPoint, radius, viewerRef]);

  const handleApply = useCallback(async () => {
    if (!pickedPoint) return;
    setApplying(true);
    setLastError(null);
    setLastResult(null);

    try {
      const response = await fetch(`${apiUrl}/geometry/apply-smoothing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scan_id: scanId,
          version_id: versionId,
          center_point: pickedPoint,
          radius,
          intensity,
          iterations: 3,
        }),
      });

      if (!response.ok) {
        const errData = (await response.json().catch(() => null)) as {
          detail?: string;
        } | null;
        throw new Error(
          errData?.detail ?? `Ошибка API: ${response.status}`
        );
      }

      const data = (await response.json()) as {
        new_mesh_url: string;
        vertices_moved: number;
      };
      setLastResult({ movedVertices: data.vertices_moved, url: data.new_mesh_url });
      onApplied(data.new_mesh_url);
      onTogglePickMode(false);
    } catch (err) {
      setLastError(
        err instanceof Error ? err.message : "Неизвестная ошибка"
      );
    } finally {
      setApplying(false);
    }
  }, [pickedPoint, scanId, versionId, radius, intensity, apiUrl, onApplied, onTogglePickMode]);

  const handleTogglePick = useCallback(() => {
    onTogglePickMode(!isPickMode);
    // Сброс предыдущего результата при новом выборе точки
    setLastResult(null);
    setLastError(null);
  }, [isPickMode, onTogglePickMode]);

  return (
    <div className="absolute bottom-16 right-4 z-20 w-72 rounded-xl border border-zinc-200 bg-white/95 p-4 shadow-lg backdrop-blur-md dark:border-zinc-700 dark:bg-zinc-900/95">
      {/* Заголовок */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Сглаживание
        </h3>
        <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500">
          Лодыжка / зона отёка
        </span>
      </div>

      {/* Шаг 1 — выбор точки */}
      <div className="mb-3">
        <button
          type="button"
          onClick={handleTogglePick}
          className={`w-full rounded-lg border px-3 py-2 text-left text-xs font-medium transition-colors ${
            isPickMode
              ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-600 dark:bg-blue-950/40 dark:text-blue-300"
              : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
          }`}
        >
          {isPickMode ? (
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" />
              Кликните на модель…
            </span>
          ) : pickedPoint ? (
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
              Точка выбрана&nbsp;
              <span className="font-mono text-[10px] text-zinc-400">
                ({pickedPoint.map((v) => v.toFixed(1)).join(", ")})
              </span>
            </span>
          ) : (
            "① Выбрать точку на модели"
          )}
        </button>
      </div>

      {/* Слайдеры */}
      <div className="mb-3 space-y-2.5">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs text-zinc-500 dark:text-zinc-400">
              Радиус зоны
            </label>
            <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              {radius}&nbsp;мм
            </span>
          </div>
          <input
            type="range"
            min={5}
            max={40}
            step={1}
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-zinc-200 accent-blue-600 dark:bg-zinc-700"
          />
          <div className="mt-0.5 flex justify-between text-[10px] text-zinc-400 dark:text-zinc-600">
            <span>5</span>
            <span className="text-zinc-300 dark:text-zinc-700 text-[9px]">
              ⚠ не клинически провалидировано
            </span>
            <span>40</span>
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs text-zinc-500 dark:text-zinc-400">
              Сила сглаживания
            </label>
            <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              {Math.round(intensity * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0.05}
            max={1}
            step={0.05}
            value={intensity}
            onChange={(e) => setIntensity(Number(e.target.value))}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-zinc-200 accent-blue-600 dark:bg-zinc-700"
          />
        </div>
      </div>

      {/* Кнопка применения */}
      <button
        type="button"
        onClick={handleApply}
        disabled={!pickedPoint || applying}
        className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-blue-500 dark:hover:bg-blue-600"
      >
        {applying ? (
          <span className="flex items-center justify-center gap-2">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Применение…
          </span>
        ) : (
          "② Применить сглаживание"
        )}
      </button>

      {/* Результат */}
      {lastResult && (
        <div className="mt-2.5 rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2 dark:border-emerald-700/50 dark:bg-emerald-900/20">
          <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
            Сглаживание применено
          </p>
          <p className="mt-0.5 text-[11px] text-emerald-600 dark:text-emerald-500">
            Смещено вершин: {lastResult.movedVertices}
          </p>
        </div>
      )}

      {/* Ошибка */}
      {lastError && (
        <div className="mt-2.5 rounded-lg border border-red-200 bg-red-50/80 px-3 py-2 dark:border-red-700/50 dark:bg-red-900/20">
          <p className="text-xs font-medium text-red-600 dark:text-red-400">
            Ошибка
          </p>
          <p className="mt-0.5 text-[11px] text-red-500 dark:text-red-500">
            {lastError}
          </p>
        </div>
      )}
    </div>
  );
}
