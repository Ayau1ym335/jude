/**
 * InversionStep — панель инверсии слепка.
 *
 * Рендерится ТОЛЬКО если scanSource === 'cast_negative'.
 * Предлагает технику применить инверсию + offset перед ректификацией.
 * После успешного применения вызывает onInverted(newMeshUrl).
 *
 * Если API вернул поле "warning" (> 2% поверхности требовало коррекции) —
 * показываем его технику явно, не скрываем молча.
 */

"use client";

import { useState } from "react";

interface InversionStepProps {
  scanId: string;
  versionId: string;
  scanSource: string;
  sessionToken: string;
  onInverted: (newMeshUrl: string) => void;
  embedded?: boolean;
}

export default function InversionStep({
  scanId,
  versionId,
  scanSource,
  sessionToken,
  onInverted,
  embedded = false,
}: InversionStepProps) {
  const [applying, setApplying] = useState(false);
  const [materialThickness, setMaterialThickness] = useState(4.0);
  const [warning, setWarning] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  // Не рендерим ничего для прямых сканов
  if (scanSource !== "cast_negative") return null;

  const handleApply = async () => {
    setApplying(true);
    setApiError(null);
    setWarning(null);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      if (!apiUrl) throw new Error("NEXT_PUBLIC_API_URL не настроен");

      const response = await fetch(`${apiUrl}/geometry/apply-inversion`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          scan_id: scanId,
          version_id: versionId,
          material_thickness: materialThickness,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          detail?: string;
        };
        throw new Error(
          body.detail ?? `Ошибка API: ${response.status}`
        );
      }

      const data = (await response.json()) as {
        new_mesh_url: string;
        warning?: string;
        diagnostics?: Record<string, unknown>;
      };

      // Если backend сигнализировал о зонах с коррекцией — показываем технику
      if (data.warning) {
        setWarning(data.warning);
      }

      onInverted(data.new_mesh_url);
    } catch (err) {
      setApiError(
        err instanceof Error
          ? err.message
          : "Не удалось применить инверсию"
      );
    } finally {
      setApplying(false);
    }
  };

  return (
    <div
      className={
        embedded
          ? "w-full rounded-xl border border-jude-warning/30 bg-jude-warning-soft px-4 py-3 shadow-jude"
          : "absolute left-4 top-4 z-20 w-72 rounded-xl border border-jude-warning/30 bg-jude-warning-soft/95 px-4 py-3 shadow-jude backdrop-blur-md"
      }
    >
      {/* Заголовок */}
      <p className="text-sm font-semibold text-jude-warning">
        Скан гипсового слепка
      </p>
      <p className="mt-1 text-xs text-jude-warning/80">
        Перед ректификацией необходимо инвертировать форму и учесть толщину
        материала ортеза.
      </p>

      {/* Слайдер толщины */}
      <div className="mt-3">
        <label className="flex items-center justify-between text-xs font-medium text-jude-warning">
          <span>Толщина материала</span>
          <span className="font-semibold">{materialThickness.toFixed(1)} мм</span>
        </label>
        <input
          type="range"
          min={2}
          max={8}
          step={0.5}
          value={materialThickness}
          onChange={(e) => setMaterialThickness(Number(e.target.value))}
          disabled={applying}
          className="mt-1.5 w-full disabled:opacity-50"
        />
        <div className="flex justify-between text-xs text-jude-warning/70">
          <span>2 мм</span>
          <span>8 мм</span>
        </div>
      </div>

      {/* Кнопка применения */}
      <button
        type="button"
        onClick={() => void handleApply()}
        disabled={applying}
        className="mt-3 w-full rounded-lg bg-jude-primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-jude-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {applying ? (
          <span className="flex items-center justify-center gap-2">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            Применение...
          </span>
        ) : (
          "Применить инверсию"
        )}
      </button>

      {warning && (
        <p className="mt-2 rounded-lg bg-jude-warning-soft px-2 py-1.5 text-xs text-jude-warning">
          ⚠ {warning}
        </p>
      )}

      {apiError && (
        <p className="mt-2 rounded-lg bg-jude-error-soft px-2 py-1.5 text-xs text-jude-error">
          {apiError}
        </p>
      )}
    </div>
  );
}
