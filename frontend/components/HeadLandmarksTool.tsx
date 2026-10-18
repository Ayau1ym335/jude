"use client";

/**
 * HeadLandmarksTool — инструмент расстановки анатомических ориентиров головы.
 *
 * Врач ставит три точки на поверхности скана:
 *   1. Насион (переносица)
 *   2. Козелок ЛЕВОГО уха (левый со стороны пациента, т.е. справа на экране при стандартном виде)
 *   3. Козелок ПРАВОГО уха (правый со стороны пациента)
 *
 * После трёх точек рисуются оси головы прямо в сцене Three.js.
 * Метки сохраняются через PUT /scans/{id}/landmarks и подгружаются при монтировании.
 *
 * Интегрировать только для helmet_type === 'cranial_remolding'.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { ModelViewerHandle } from "@/components/ModelViewer";

// ─── Клинические константы (уточнить диапазоны у клиники) ──────────────────
// Расстояние между козелками для детей старшего возраста / взрослых.
// ВАЖНО: для младенцев (0–6 мес.) нормальный диапазон отличается (~80–120 мм).
// Уточните правильные пороги у клинических специалистов перед релизом.
const TRAGUS_DIST_MIN_MM = 40;   // мм — если меньше, возможна ошибка постановки
const TRAGUS_DIST_MAX_MM = 150;  // мм — если больше, возможна ошибка постановки

// ─── Цвета осей ─────────────────────────────────────────────────────────────
const AXIS_COLOR_X = 0xe74c3c;  // красный  — вправо
const AXIS_COLOR_Y = 0x27ae60;  // зелёный  — вперёд
const AXIS_COLOR_Z = 0x2980b9;  // синий    — вверх

// ─── Шаги мастера ───────────────────────────────────────────────────────────
const STEPS = [
  {
    key: "nasion" as const,
    title: "Переносица (насион)",
    hint: "Кликните на кончик носа или точку переносицы.",
    colorHex: "#f39c12",
    colorInt: 0xf39c12,
  },
  {
    key: "tragus_left" as const,
    title: "Козелок левого уха пациента",
    hint: "Кликните на хрящевой выступ у входа в левый слуховой проход. ⚠️ «Левое» — это сторона пациента, а не ваша. При виде спереди левое ухо пациента находится справа от вас.",
    colorHex: "#8e44ad",
    colorInt: 0x8e44ad,
  },
  {
    key: "tragus_right" as const,
    title: "Козелок правого уха пациента",
    hint: "Кликните на хрящевой выступ у входа в правый слуховой проход. ⚠️ «Правое» — это сторона пациента. При виде спереди правое ухо пациента находится слева от вас.",
    colorHex: "#16a085",
    colorInt: 0x16a085,
  },
] as const;

type LandmarkKey = (typeof STEPS)[number]["key"];

interface Landmarks {
  nasion: [number, number, number] | null;
  tragus_left: [number, number, number] | null;
  tragus_right: [number, number, number] | null;
}

interface HeadLandmarksToolProps {
  viewerRef: React.RefObject<ModelViewerHandle | null>;
  scanId: string;
  accessToken: string;
  pickedPoint: [number, number, number] | null;
  isPickMode: boolean;
  onTogglePickMode: (active: boolean) => void;
  onLandmarksSaved?: (hasLandmarks: boolean) => void;
  embedded?: boolean;
}

// ─── Вычисление рамки головы ─────────────────────────────────────────────────

function buildHeadFrame(
  nasion: [number, number, number],
  tl: [number, number, number],
  tr: [number, number, number],
): { origin: THREE.Vector3; ex: THREE.Vector3; ey: THREE.Vector3; ez: THREE.Vector3 } | null {
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

function createMarkerSphere(color: number, radius = 4): THREE.Mesh {
  const geo = new THREE.SphereGeometry(radius, 16, 12);
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.3,
    roughness: 0.4,
    metalness: 0.1,
  });
  return new THREE.Mesh(geo, mat);
}

function createTextSprite(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 256, 64);
  ctx.font = "bold 26px Inter, Arial, sans-serif";
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 128, 32);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(30, 8, 1);
  return sprite;
}

// ─── Компонент ───────────────────────────────────────────────────────────────

export default function HeadLandmarksTool({
  viewerRef,
  scanId,
  accessToken,
  pickedPoint,
  isPickMode,
  onTogglePickMode,
  onLandmarksSaved,
  embedded = false,
}: HeadLandmarksToolProps) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "";

  const [landmarks, setLandmarks] = useState<Landmarks>({
    nasion: null,
    tragus_left: null,
    tragus_right: null,
  });
  const [currentStep, setCurrentStep] = useState<number>(-1); // -1 = не начали
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const sceneObjectsRef = useRef<THREE.Object3D[]>([]);
  const prevPickedRef = useRef<[number, number, number] | null>(null);

  // ─── Загрузка существующих меток при монтировании ─────────────────────────
  useEffect(() => {
    if (!scanId || !accessToken) return;
    async function fetchLandmarks() {
      try {
        const res = await fetch(`${apiUrl}/scans/${scanId}/landmarks`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (res.status === 404) return;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as {
          nasion: [number, number, number];
          tragus_left: [number, number, number];
          tragus_right: [number, number, number];
        };
        setLandmarks({ nasion: data.nasion, tragus_left: data.tragus_left, tragus_right: data.tragus_right });
        setCurrentStep(3);
        setSaveSuccess(true);
        onLandmarksSaved?.(true);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Ошибка загрузки меток");
      }
    }
    void fetchLandmarks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanId, accessToken]);

  // ─── Приём кликнутой точки ────────────────────────────────────────────────
  useEffect(() => {
    if (!pickedPoint || pickedPoint === prevPickedRef.current) return;
    if (!isPickMode || currentStep < 0 || currentStep >= 3) return;
    prevPickedRef.current = pickedPoint;

    const pt = pickedPoint;
    const step = currentStep;
    queueMicrotask(() => {
      const key = STEPS[step].key;
      setLandmarks((prev) => ({ ...prev, [key]: pt }));
      onTogglePickMode(false);

      const next = step + 1;
      setCurrentStep(next);
      if (next < 3) {
        // Авто-переход к следующей точке
        setTimeout(() => onTogglePickMode(true), 50);
      }
    });
  }, [pickedPoint, isPickMode, currentStep, onTogglePickMode]);

  // ─── Получить сцену из viewer ─────────────────────────────────────────────
  const getScene = useCallback((): THREE.Scene | null => {
    const handle = viewerRef.current;
    if (!handle) return null;
    const mesh = handle.getMesh();
    if (mesh?.parent) return mesh.parent as THREE.Scene;
    return null;
  }, [viewerRef]);

  // ─── Отрисовка маркеров и осей ────────────────────────────────────────────
  useEffect(() => {
    const scene = getScene();
    if (!scene) return;

    // Очистка старых
    sceneObjectsRef.current.forEach((obj) => {
      obj.parent?.remove(obj);
      if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
      const mat = (obj as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (mat) {
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      }
    });
    sceneObjectsRef.current = [];

    const add = (obj: THREE.Object3D) => {
      scene.add(obj);
      sceneObjectsRef.current.push(obj);
    };

    // Маркеры
    STEPS.forEach(({ key, colorInt }) => {
      const pt = landmarks[key];
      if (pt) {
        const s = createMarkerSphere(colorInt);
        s.position.set(...pt);
        add(s);
      }
    });

    const { nasion, tragus_left, tragus_right } = landmarks;
    if (nasion && tragus_left && tragus_right) {
      const frame = buildHeadFrame(nasion, tragus_left, tragus_right);
      if (frame) {
        const { origin, ex, ey, ez } = frame;
        const span = new THREE.Vector3(...tragus_right).distanceTo(new THREE.Vector3(...tragus_left));
        const len = Math.max(span * 0.4, 30);

        const axes = [
          { dir: ex, color: AXIS_COLOR_X, label: "→ Вправо",  labelColor: "#e74c3c" },
          { dir: ey, color: AXIS_COLOR_Y, label: "↗ Вперёд",  labelColor: "#27ae60" },
          { dir: ez, color: AXIS_COLOR_Z, label: "↑ Вверх",   labelColor: "#2980b9" },
        ];

        axes.forEach(({ dir, color, label, labelColor }) => {
          const arrow = new THREE.ArrowHelper(dir, origin, len, color, len * 0.15, len * 0.1);
          add(arrow);
          const sprite = createTextSprite(label, labelColor);
          sprite.position.copy(origin).addScaledVector(dir, len * 1.2);
          add(sprite);
        });

        const originDot = createMarkerSphere(0xffffff, 3);
        originDot.position.copy(origin);
        add(originDot);
      }
    }

    // Форсируем рендер
    const renderer = viewerRef.current?.getRenderer();
    const camera = viewerRef.current?.getCamera();
    if (renderer && camera) renderer.render(scene, camera);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landmarks]);

  // ─── Cleanup при unmount ──────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      sceneObjectsRef.current.forEach((obj) => obj.parent?.remove(obj));
      sceneObjectsRef.current = [];
    };
  }, []);

  // ─── Валидация расстояния ─────────────────────────────────────────────────
  const distanceWarning = React.useMemo(() => {
    if (!landmarks.tragus_left || !landmarks.tragus_right) return null;
    const d = new THREE.Vector3(...landmarks.tragus_right)
      .distanceTo(new THREE.Vector3(...landmarks.tragus_left));
    if (d < TRAGUS_DIST_MIN_MM || d > TRAGUS_DIST_MAX_MM) {
      return `Расстояние между козелками ${d.toFixed(1)} мм выходит за пределы допустимого диапазона (${TRAGUS_DIST_MIN_MM}–${TRAGUS_DIST_MAX_MM} мм). Проверьте правильность постановки точек.`;
    }
    return null;
  }, [landmarks]);

  // ─── Сохранение ───────────────────────────────────────────────────────────
  async function handleSave() {
    const { nasion, tragus_left, tragus_right } = landmarks;
    if (!nasion || !tragus_left || !tragus_right) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const res = await fetch(`${apiUrl}/scans/${scanId}/landmarks`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ nasion, tragus_left, tragus_right, source: "manual" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText })) as { detail?: string };
        throw new Error(err.detail ?? `HTTP ${res.status}`);
      }
      setSaveSuccess(true);
      onLandmarksSaved?.(true);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  function handleResetPoint(key: LandmarkKey) {
    setLandmarks((prev) => ({ ...prev, [key]: null }));
    const stepIdx = STEPS.findIndex((s) => s.key === key);
    setCurrentStep(stepIdx);
    setSaveSuccess(false);
    onLandmarksSaved?.(false);
    onTogglePickMode(true);
  }

  function handleRestart() {
    setLandmarks({ nasion: null, tragus_left: null, tragus_right: null });
    setCurrentStep(0);
    setSaveSuccess(false);
    setSaveError(null);
    onLandmarksSaved?.(false);
    onTogglePickMode(true);
  }

  const allSet = !!(landmarks.nasion && landmarks.tragus_left && landmarks.tragus_right);
  const activeStep = currentStep >= 0 && currentStep < 3 ? STEPS[currentStep] : null;

  return (
    <div className={`flex flex-col gap-3 ${embedded ? "" : "rounded-xl border border-jude-border bg-jude-surface p-4 shadow-jude"}`}>
      {/* Заголовок */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-jude-ink">🎯 Ориентиры головы</h3>
        {(allSet || currentStep >= 0) && (
          <button type="button" className="text-xs text-jude-subtle hover:text-jude-error transition-colors" onClick={handleRestart}>
            Начать заново
          </button>
        )}
      </div>

      {loadError && (
        <p className="rounded-lg bg-jude-error-soft px-3 py-2 text-xs text-jude-error">
          ⚠ Не удалось загрузить метки: {loadError}
        </p>
      )}

      {/* Подсказка активного шага */}
      {activeStep && (
        <div className="rounded-xl border px-3 py-2.5" style={{ borderColor: `${activeStep.colorHex}44` }}>
          <p className="text-xs font-semibold" style={{ color: activeStep.colorHex }}>
            Шаг {currentStep + 1} из 3: {activeStep.title}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-jude-muted">{activeStep.hint}</p>
        </div>
      )}

      {/* Список точек */}
      <ul className="flex flex-col gap-1.5">
        {STEPS.map((step, i) => {
          const pt = landmarks[step.key];
          const isActive = currentStep === i;
          const isDone = !!pt;
          return (
            <li key={step.key} className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs transition-colors ${isActive ? "border border-jude-primary/20 bg-jude-surface-muted" : isDone ? "bg-jude-surface" : "bg-jude-canvas opacity-50"}`}>
              <span className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: step.colorHex }} />
                <span className={isDone ? "font-medium text-jude-ink" : "text-jude-muted"}>{step.title}</span>
              </span>
              {isDone ? (
                <span className="flex items-center gap-1.5">
                  <span className="font-mono text-jude-subtle">{pt.map((v) => v.toFixed(1)).join(", ")}</span>
                  <button type="button" className="ml-1 text-jude-subtle hover:text-jude-error transition-colors" title="Переставить точку" onClick={() => handleResetPoint(step.key)}>✕</button>
                </span>
              ) : isActive ? (
                <span className="animate-pulse font-medium text-jude-primary">Кликните на модель</span>
              ) : (
                <span className="text-jude-subtle">—</span>
              )}
            </li>
          );
        })}
      </ul>

      {/* Предупреждение о расстоянии */}
      {distanceWarning && (
        <div className="rounded-lg border border-jude-warning/40 bg-jude-warning-soft px-3 py-2">
          <p className="text-xs font-medium text-jude-warning">⚠️ {distanceWarning}</p>
          <p className="mt-0.5 text-xs text-jude-warning/70">Диапазон указан для детей старшего возраста. Для младенцев уточните нормы у клиники.</p>
        </div>
      )}

      {/* Легенда осей */}
      {allSet && !distanceWarning && (
        <div className="rounded-lg bg-jude-surface-muted px-3 py-2">
          <p className="text-xs text-jude-muted">
            Оси в 3D:&nbsp;
            <span className="font-medium" style={{ color: "#e74c3c" }}>→ Вправо</span>
            {" · "}
            <span className="font-medium" style={{ color: "#27ae60" }}>↗ Вперёд</span>
            {" · "}
            <span className="font-medium" style={{ color: "#2980b9" }}>↑ Вверх</span>
          </p>
        </div>
      )}

      {/* Кнопка Сохранить */}
      {allSet && (
        <button
          type="button"
          disabled={saving || !!distanceWarning}
          onClick={handleSave}
          className={`w-full rounded-lg px-4 py-2 text-sm font-semibold transition-all ${saving ? "cursor-wait bg-jude-primary/50 text-white" : distanceWarning ? "cursor-not-allowed bg-jude-subtle/30 text-jude-muted" : "bg-jude-primary text-white shadow-jude hover:bg-jude-primary/90 active:scale-95"}`}
        >
          {saving ? "Сохранение…" : "Сохранить ориентиры"}
        </button>
      )}

      {saveSuccess && (
        <p className="rounded-lg bg-jude-success-soft px-3 py-2 text-xs font-medium text-jude-success">✓ Ориентиры сохранены</p>
      )}
      {saveError && (
        <p className="rounded-lg bg-jude-error-soft px-3 py-2 text-xs text-jude-error">✕ {saveError}</p>
      )}

      {/* Кнопка «Начать расстановку» */}
      {currentStep === -1 && !allSet && (
        <button
          type="button"
          className="w-full rounded-lg bg-jude-primary px-4 py-2 text-sm font-semibold text-white shadow-jude hover:bg-jude-primary/90 transition-all"
          onClick={() => { setCurrentStep(0); onTogglePickMode(true); }}
        >
          Начать расстановку
        </button>
      )}
    </div>
  );
}
