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
  embedded?: boolean;
}

export default function SmoothingTool({
  viewerRef,
  scanId,
  versionId,
  onApplied,
  pickedPoint,
  isPickMode,
  onTogglePickMode,
  embedded = false,
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
    <div
      className={
        embedded
          ? "w-full rounded-xl border border-jude-border bg-jude-surface p-4 shadow-jude"
          : "absolute bottom-16 right-4 z-20 w-72 rounded-xl border border-jude-border bg-jude-surface/95 p-4 shadow-jude-lg backdrop-blur-md"
      }
    >
      {/* Заголовок */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-jude-ink">
          Сглаживание
        </h3>
        <span className="text-xs font-medium text-jude-subtle">
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
              ? "border-jude-accent bg-jude-accent-soft text-jude-accent"
              : "border-jude-border bg-jude-surface-muted text-jude-muted hover:bg-jude-primary-soft"
          }`}
        >
          {isPickMode ? (
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-jude-accent" />
              Кликните на модель…
            </span>
          ) : pickedPoint ? (
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-jude-success" />
              Точка выбрана{" "}
              <span className="font-mono text-[10px] text-jude-subtle">
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
            <label className="text-xs text-jude-muted">Радиус зоны</label>
            <span className="text-xs font-medium text-jude-ink">
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
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-jude-bg"
          />
          <div className="mt-0.5 flex justify-between text-[10px] text-jude-subtle">
            <span>5</span>
            <span className="text-[9px]">⚠ не клинически провалидировано</span>
            <span>40</span>
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs text-jude-muted">Сила сглаживания</label>
            <span className="text-xs font-medium text-jude-ink">
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
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-jude-bg"
          />
        </div>
      </div>

      {/* Кнопка применения */}
      <button
        type="button"
        onClick={handleApply}
        disabled={!pickedPoint || applying}
        className="w-full rounded-lg bg-jude-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-jude-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
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
        <div className="mt-2.5 rounded-lg border border-jude-success/20 bg-jude-success-soft px-3 py-2">
          <p className="text-xs font-medium text-jude-success">
            Сглаживание применено
          </p>
          <p className="mt-0.5 text-[11px] text-jude-success/80">
            Смещено вершин: {lastResult.movedVertices}
          </p>
        </div>
      )}

      {/* Ошибка */}
      {lastError && (
        <div className="mt-2.5 rounded-lg border border-jude-error/20 bg-jude-error-soft px-3 py-2">
          <p className="text-xs font-medium text-jude-error">Ошибка</p>
          <p className="mt-0.5 text-[11px] text-jude-error/80">{lastError}</p>
        </div>
      )}
    </div>
  );
}
