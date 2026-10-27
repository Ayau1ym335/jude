"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";
import {
  api,
  type PatientRead,
  type ProjectRead,
  type ProjectVersionRead,
  type ScanRead,
} from "@/lib/api";
import { ModelViewer, type ModelViewerHandle } from "@/components/ModelViewer";
import HeadLandmarksTool from "./HeadLandmarksTool";
import AsymmetryOverlay from "./AsymmetryOverlay";
import HeadMetricsPanel from "./HeadMetricsPanel";

import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import Alert from "@/components/ui/Alert";
import { cn } from "@/lib/cn";

export interface StepDefinition {
  id: number;
  title: string;
  shortTitle: string;
  subtitle: string;
  isStub?: boolean;
}

export const HELMET_STEPS: StepDefinition[] = [
  {
    id: 1,
    title: "1. Скан",
    shortTitle: "Скан",
    subtitle: "Ориентация и проверка качества скана",
  },
  {
    id: 2,
    title: "2. Метки",
    shortTitle: "Метки",
    subtitle: "Анатомические ориентиры (насион, козелки)",
  },
  {
    id: 3,
    title: "3. Анализ",
    shortTitle: "Анализ",
    subtitle: "Карта асимметрии черепа, CI и CVAI",
  },
  {
    id: 4,
    title: "4. Коррекция",
    shortTitle: "Коррекция",
    subtitle: "Зоны роста и сглаживание выступа",
    isStub: true,
  },
  {
    id: 5,
    title: "5. Оболочка",
    shortTitle: "Оболочка",
    subtitle: "Толщина шлема, вырезы ушей и обрезка",
    isStub: true,
  },
  {
    id: 6,
    title: "6. Экспорт",
    shortTitle: "Экспорт",
    subtitle: "Генерация STL/3MF для 3D-печати",
    isStub: true,
  },
];

interface HelmetScreenProps {
  projectId: string;
  session: Session;
}

export default function HelmetScreen({ projectId, session }: HelmetScreenProps) {
  const router = useRouter();
  const viewerRef = useRef<ModelViewerHandle>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [project, setProject] = useState<ProjectRead | null>(null);
  const [patient, setPatient] = useState<PatientRead | null>(null);
  const [scan, setScan] = useState<ScanRead | null>(null);
  const [scanFile, setScanFile] = useState<File | null>(null);
  const [version, setVersion] = useState<ProjectVersionRead | null>(null);

  // Шаг мастера: 1..6
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [savingStep, setSavingStep] = useState(false);

  // ─── Landmarks state ────────────────────────────────────────────────────────
  const [landmarksPickMode, setLandmarksPickMode] = useState(false);
  const [landmarksPickedPoint, setLandmarksPickedPoint] = useState<
    [number, number, number] | null
  >(null);
  const [landmarksSaved, setLandmarksSaved] = useState(false);

  // ─── Asymmetry state ────────────────────────────────────────────────────────
  const [asymmetryActive, setAsymmetryActive] = useState(false);
  const [analysisTab, setAnalysisTab] = useState<"heatmap" | "metrics">("metrics");

  const [reloadKey, setReloadKey] = useState(0);

  const handleRetry = () => {
    setReloadKey((k) => k + 1);
  };

  // ─── Загрузка проекта, скана, версий и пациента ────────────────────────────
  useEffect(() => {
    let ignore = false;

    async function loadProject() {
      try {
        // 1. Проект
        const projectData = await api.projects.get(session.access_token, projectId);
        if (ignore) return;
        setProject(projectData);

        // Восстанавливаем шаг из проекта (перезагрузка возвращает на последний шаг)
        const savedStep = projectData.current_step ?? 1;
        setCurrentStep(Math.max(1, Math.min(6, savedStep)));

        // 2. Пациент
        try {
          const patientData = await api.patients.get(
            session.access_token,
            projectData.patient_id
          );
          if (!ignore) setPatient(patientData);
        } catch {
          // не блокирует работу, если профиль не загрузился
        }

        // 3. Скан
        const scanData = await api.scans.get(
          session.access_token,
          projectData.scan_id
        );
        if (ignore) return;
        setScan(scanData);

        // 4. Проверяем наличие меток
        try {
          const lm = await api.scans.getLandmarks(
            session.access_token,
            projectData.scan_id
          );
          const hasCoords = Boolean(lm.nasion && lm.tragus_left && lm.tragus_right);
          if (!ignore) setLandmarksSaved(hasCoords);
        } catch {
          if (!ignore) setLandmarksSaved(false);
        }

        // 5. Версии проекта
        try {
          const versions = await api.projects.versions(
            session.access_token,
            projectId
          );
          if (versions.length > 0 && !ignore) {
            const latest = versions.reduce((a, b) =>
              new Date(a.created_at || 0).getTime() >
              new Date(b.created_at || 0).getTime()
                ? a
                : b
            );
            setVersion(latest);
          }
        } catch {
          // версии создаются по мере работы
        }

        // 6. Скачиваем файл скана для ModelViewer
        const storagePath = scanData.file_url;
        let blob: Blob | null = null;

        if (storagePath.startsWith("http://") || storagePath.startsWith("https://")) {
          const fileRes = await fetch(storagePath);
          if (fileRes.ok) blob = await fileRes.blob();
        } else {
          const cleanPath = storagePath.startsWith("scan-files/")
            ? storagePath.replace("scan-files/", "")
            : storagePath;
          const { data: fileData, error: storageError } = await supabase.storage
            .from("scan-files")
            .download(cleanPath);

          if (!storageError && fileData) {
            blob = fileData;
          } else {
            // Попытка прямого скачивания через publicUrl
            const { data: pubData } = supabase.storage
              .from("scan-files")
              .getPublicUrl(cleanPath);
            if (pubData?.publicUrl) {
              const r = await fetch(pubData.publicUrl);
              if (r.ok) blob = await r.blob();
            }
          }
        }

        if (!blob) {
          throw new Error(
            "Файл 3D-скана головы недоступен в хранилище. Проверьте подключение."
          );
        }

        if (ignore) return;
        const ext = storagePath.split(".").pop()?.toLowerCase() ?? "stl";
        const file = new File([blob], `scan.${ext}`, {
          type: "application/octet-stream",
        });
        setScanFile(file);
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : "Ошибка загрузки проекта шлема");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    void loadProject();

    return () => {
      ignore = true;
    };
  }, [projectId, session.access_token, reloadKey]);

  // ─── Сохранение текущего шага на бэкенд ──────────────────────────────────────
  const handleStepChange = async (newStep: number) => {
    if (newStep < 1 || newStep > 6) return;
    setCurrentStep(newStep);
    setSavingStep(true);

    try {
      await api.projects.update(session.access_token, projectId, {
        current_step: newStep,
      });
    } catch {
      // шаг уже применён локально в UI, тихая обработка ошибки сети
    } finally {
      setSavingStep(false);
    }
  };

  // ─── Клик по 3D-сетке ───────────────────────────────────────────────────────
  const handleMeshClick = (point: [number, number, number]) => {
    if (currentStep === 2 && landmarksPickMode) {
      setLandmarksPickedPoint(point);
    }
  };

  const activeStepDef = HELMET_STEPS.find((s) => s.id === currentStep) ?? HELMET_STEPS[0];

  return (
    <div className="flex h-[calc(100vh-3.5rem)] w-full overflow-hidden bg-jude-canvas">
      {/* ─── ЛЕВАЯ КОЛОНКА: ШАГИ МАСТЕРА ШЛЕМА ─────────────────────────────── */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-jude-border bg-jude-surface p-4 shadow-jude-sm">
        <div className="mb-4">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-xs font-semibold uppercase tracking-wider text-jude-muted">
              Краниальный шлем
            </h2>
            {savingStep && (
              <span className="text-[11px] text-jude-primary animate-pulse">
                Сохранение...
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm font-medium text-jude-ink">
            {patient?.anonymized_identifier ?? "Пациент"}
          </p>
          {patient?.age_display && (
            <div className="mt-1">
              <Badge variant="accent">{patient.age_display}</Badge>
            </div>
          )}
        </div>

        {/* Список шагов 1..6 */}
        <nav className="flex flex-1 flex-col gap-1.5 overflow-y-auto">
          {HELMET_STEPS.map((step) => {
            const isActive = step.id === currentStep;
            const isCompleted =
              (step.id === 1 && Boolean(scanFile)) ||
              (step.id === 2 && landmarksSaved) ||
              (step.id < currentStep);

            return (
              <button
                key={step.id}
                type="button"
                onClick={() => handleStepChange(step.id)}
                className={cn(
                  "group relative flex items-start gap-3 rounded-xl p-3 text-left transition-all",
                  isActive
                    ? "bg-jude-primary-soft text-jude-primary border border-jude-primary/30 shadow-jude-sm"
                    : "hover:bg-jude-surface-muted text-jude-ink border border-transparent"
                )}
              >
                {/* Номер / статус шага */}
                <div
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold transition-colors",
                    isActive
                      ? "bg-jude-primary text-white shadow-jude-sm"
                      : isCompleted
                      ? "bg-emerald-500/15 text-emerald-600 border border-emerald-500/30"
                      : "bg-jude-surface-muted text-jude-muted border border-jude-border"
                  )}
                >
                  {isCompleted && !isActive ? "✓" : step.id}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "text-sm font-medium leading-tight",
                        isActive ? "text-jude-primary font-semibold" : "text-jude-ink"
                      )}
                    >
                      {step.shortTitle}
                    </span>
                    {step.isStub && (
                      <span className="rounded bg-jude-border/50 px-1 py-0.2 text-[10px] text-jude-muted">
                        Заглушка
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-xs text-jude-muted">
                    {step.subtitle}
                  </p>
                </div>
              </button>
            );
          })}
        </nav>

        {/* Нижняя часть навигации */}
        <div className="mt-auto pt-3 border-t border-jude-border">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/patients/${project?.patient_id ?? ""}`)}
            className="w-full text-xs text-jude-muted hover:text-jude-ink"
          >
            ← К карточке пациента
          </Button>
        </div>
      </aside>

      {/* ─── ЦЕНТРАЛЬНАЯ ОБЛАСТЬ: 3D MODEL VIEWER ─────────────────────────── */}
      <main className="relative flex min-w-0 flex-1 flex-col bg-jude-canvas overflow-hidden">
        {/* Верхний бар над 3D */}
        <div className="flex h-12 items-center justify-between border-b border-jude-border bg-jude-surface/80 px-4 backdrop-blur-md z-10">
          <div className="flex items-center gap-2">
            <Badge variant="accent">
              Шаг {activeStepDef.id} из 6: {activeStepDef.shortTitle}
            </Badge>
            {landmarksSaved && (
              <Badge variant="success">Ориентиры головы зафиксированы</Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => viewerRef.current?.resetView()}
            >
              Сбросить вид
            </Button>
          </div>
        </div>

        {/* 3D Canvas */}
        <div className="relative flex-1 bg-jude-canvas">
          {loading && (
            <div className="flex h-full items-center justify-center">
              <Spinner label="Загрузка 3D-модели головы младенца..." />
            </div>
          )}

          {error && (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
              <Alert variant="error" className="max-w-md">
                {error}
              </Alert>
              <Button variant="secondary" size="sm" onClick={handleRetry}>
                Повторить попытку
              </Button>
            </div>
          )}

          {!loading && !error && scanFile && (
            <ModelViewer
              ref={viewerRef}
              file={scanFile}
              onMeshClick={handleMeshClick}
              pickMode={currentStep === 2 && landmarksPickMode}
            />
          )}

          {/* Плашка метаданных скана в углу 3D сцены */}
          {scan && !loading && (
            <div className="pointer-events-none absolute bottom-4 left-4 z-10 rounded-xl border border-jude-border bg-jude-surface/90 px-3 py-2 text-xs shadow-jude backdrop-blur-md">
              <span className="font-medium text-jude-ink">Скан: </span>
              <span className="font-mono text-jude-muted">{scan.file_format?.toUpperCase()}</span>
              {landmarksSaved && (
                <span className="ml-2 text-emerald-600 font-medium">✓ Базис Jude</span>
              )}
            </div>
          )}
        </div>
      </main>

      {/* ─── ПРАВАЯ КОЛОНКА: ПАНЕЛЬ ТЕКУЩЕГО ШАГА ─────────────────────────── */}
      <aside className="flex w-[390px] shrink-0 flex-col border-l border-jude-border bg-jude-surface shadow-jude-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-jude-border px-4 py-3">
          <div>
            <h3 className="font-heading text-sm font-semibold text-jude-ink">
              {activeStepDef.title}
            </h3>
            <p className="text-xs text-jude-muted">{activeStepDef.subtitle}</p>
          </div>
        </div>

        {/* Контент активного шага */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* ─── ШАГ 1: СКАН ─── */}
          {currentStep === 1 && (
            <div className="flex flex-col gap-4">
              <Card>
                <h4 className="text-sm font-semibold text-jude-ink">Параметры 3D-скана</h4>
                <div className="mt-3 flex flex-col gap-2 text-xs">
                  <div className="flex justify-between border-b border-jude-border/50 pb-1.5">
                    <span className="text-jude-muted">Формат:</span>
                    <span className="font-mono font-medium text-jude-ink">
                      {scan?.file_format?.toUpperCase() ?? "STL"}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-jude-border/50 pb-1.5">
                    <span className="text-jude-muted">Статус валидации:</span>
                    <Badge variant={scan?.validation_status === "valid" ? "success" : "warning"}>
                      {scan?.validation_status === "valid" ? "Провалидирован" : "В обработке"}
                    </Badge>
                  </div>
                  <div className="flex justify-between border-b border-jude-border/50 pb-1.5">
                    <span className="text-jude-muted">Дата загрузки:</span>
                    <span className="text-jude-ink">
                      {scan?.uploaded_at ? new Date(scan.uploaded_at).toLocaleDateString("ru-RU") : "—"}
                    </span>
                  </div>
                  {version && (
                    <div className="flex justify-between border-b border-jude-border/50 pb-1.5">
                      <span className="text-jude-muted">Итерация:</span>
                      <span className="font-mono font-medium text-jude-ink">
                        #{version.id.slice(0, 6)}
                      </span>
                    </div>
                  )}
                </div>

                <div className="mt-4 rounded-lg bg-jude-surface-muted p-3 text-xs text-jude-muted">
                  <p className="font-medium text-jude-ink mb-1">Инструкция оператора:</p>
                  Убедитесь, что череп отображается корректно, нет разрывов сетки и дефектов.
                  Нос должен быть направлен вперёд, козелки обоих ушей различимы для расстановки меток.
                </div>
              </Card>

              <Button
                variant="accent"
                className="w-full mt-2"
                onClick={() => handleStepChange(2)}
              >
                Перейти к разметке меток (Шаг 2) →
              </Button>
            </div>
          )}

          {/* ─── ШАГ 2: МЕТКИ ─── */}
          {currentStep === 2 && scan && (
            <div className="flex flex-col gap-4">
              <HeadLandmarksTool
                viewerRef={viewerRef}
                scanId={scan.id}
                accessToken={session.access_token}
                pickedPoint={landmarksPickedPoint}
                isPickMode={landmarksPickMode}
                onTogglePickMode={setLandmarksPickMode}
                onLandmarksSaved={(saved) => {
                  setLandmarksSaved(saved);
                }}
                embedded
              />

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-jude-border">
                <Button variant="secondary" size="sm" onClick={() => handleStepChange(1)}>
                  ← Назад к скану
                </Button>
                <Button
                  variant="accent"
                  size="sm"
                  onClick={() => handleStepChange(3)}
                  disabled={!landmarksSaved}
                >
                  К анализу асимметрии →
                </Button>
              </div>
            </div>
          )}

          {/* ─── ШАГ 3: АНАЛИЗ (КАРТА АСИММЕТРИИ И МЕТРИКИ) ─── */}
          {currentStep === 3 && scan && (
            <div className="flex flex-col gap-4">
              {/* Переключатель вкладок внутри шага 3 */}
              <div className="flex rounded-lg border border-jude-border bg-jude-surface-muted p-1">
                <button
                  type="button"
                  onClick={() => setAnalysisTab("metrics")}
                  className={cn(
                    "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    analysisTab === "metrics"
                      ? "bg-jude-surface text-jude-ink shadow-jude-sm"
                      : "text-jude-muted hover:text-jude-ink"
                  )}
                >
                  Метрики (CI, CVAI)
                </button>
                <button
                  type="button"
                  onClick={() => setAnalysisTab("heatmap")}
                  className={cn(
                    "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    analysisTab === "heatmap"
                      ? "bg-jude-surface text-jude-ink shadow-jude-sm"
                      : "text-jude-muted hover:text-jude-ink"
                  )}
                >
                  Карта асимметрии
                </button>
              </div>

              {analysisTab === "metrics" && (
                <HeadMetricsPanel
                  viewerRef={viewerRef}
                  scanId={scan.id}
                  patientId={project?.patient_id}
                  accessToken={session.access_token}
                  hasLandmarks={landmarksSaved}
                  embedded
                />
              )}

              {analysisTab === "heatmap" && (
                <AsymmetryOverlay
                  viewerRef={viewerRef}
                  scanId={scan.id}
                  accessToken={session.access_token}
                  active={asymmetryActive}
                  onToggleActive={setAsymmetryActive}
                  hasLandmarks={landmarksSaved}
                  embedded
                />
              )}

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-jude-border">
                <Button variant="secondary" size="sm" onClick={() => handleStepChange(2)}>
                  ← К меткам
                </Button>
                <Button variant="accent" size="sm" onClick={() => handleStepChange(4)}>
                  К коррекции (Шаг 4) →
                </Button>
              </div>
            </div>
          )}

          {/* ─── ШАГ 4: КОРРЕКЦИЯ (ЗАГЛУШКА) ─── */}
          {currentStep === 4 && (
            <div className="flex flex-col gap-4">
              <Card>
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-jude-ink">Локальная коррекция объёма</h4>
                  <Badge variant="warning">Заглушка</Badge>
                </div>
                <p className="mt-2 text-xs text-jude-muted leading-relaxed">
                  На этом этапе моделируются зоны роста для исправления деформации:
                </p>
                <ul className="mt-2 flex flex-col gap-1.5 text-xs text-jude-muted list-disc pl-4">
                  <li>Зазор для свободного роста уплощённой зоны (4–8 мм).</li>
                  <li>Участки контактного удержания для перенаправления роста черепа.</li>
                  <li>Локальное лапласианово сглаживание выступов.</li>
                </ul>

                <div className="mt-4 rounded-xl border border-dashed border-jude-border p-4 text-center">
                  <p className="text-xs text-jude-subtle">
                    Инструмент локальной коррекции подключится на следующем этапе.
                  </p>
                </div>
              </Card>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-jude-border">
                <Button variant="secondary" size="sm" onClick={() => handleStepChange(3)}>
                  ← К анализу
                </Button>
                <Button variant="accent" size="sm" onClick={() => handleStepChange(5)}>
                  К оболочке (Шаг 5) →
                </Button>
              </div>
            </div>
          )}

          {/* ─── ШАГ 5: ОБОЛОЧКА (ЗАГЛУШКА) ─── */}
          {currentStep === 5 && (
            <div className="flex flex-col gap-4">
              <Card>
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-jude-ink">Построение оболочки шлема</h4>
                  <Badge variant="warning">Заглушка</Badge>
                </div>
                <p className="mt-2 text-xs text-jude-muted leading-relaxed">
                  Построение твердотельной геометрии шлема-реформера:
                </p>
                <ul className="mt-2 flex flex-col gap-1.5 text-xs text-jude-muted list-disc pl-4">
                  <li>Экструзия внешней оболочки заданной толщины (3.5–4.5 мм).</li>
                  <li>Геодезические вырезы под ушные раковины (ear cutouts).</li>
                  <li>Формирование лобного проёма и вентиляционных отверстий.</li>
                </ul>

                <div className="mt-4 rounded-xl border border-dashed border-jude-border p-4 text-center">
                  <p className="text-xs text-jude-subtle">
                    Модуль генерации оболочки шлема в разработке.
                  </p>
                </div>
              </Card>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-jude-border">
                <Button variant="secondary" size="sm" onClick={() => handleStepChange(4)}>
                  ← К коррекции
                </Button>
                <Button variant="accent" size="sm" onClick={() => handleStepChange(6)}>
                  К экспорту (Шаг 6) →
                </Button>
              </div>
            </div>
          )}

          {/* ─── ШАГ 6: ЭКСПОРТ (ЗАГЛУШКА) ─── */}
          {currentStep === 6 && (
            <div className="flex flex-col gap-4">
              <Card>
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-jude-ink">Экспорт на 3D-печать</h4>
                  <Badge variant="warning">Заглушка</Badge>
                </div>
                <p className="mt-2 text-xs text-jude-muted leading-relaxed">
                  Подготовка финального изделия к производству:
                </p>
                <ul className="mt-2 flex flex-col gap-1.5 text-xs text-jude-muted list-disc pl-4">
                  <li>Формирование STL/3MF файла шлема с гравировкой ID пациента.</li>
                  <li>Генерация технического паспорта с клиническими метриками (CI, CVAI).</li>
                  <li>Экспорт производственного пакета для SLS-печати (PA12 / TPU).</li>
                </ul>

                <div className="mt-4 rounded-xl border border-dashed border-jude-border p-4 text-center">
                  <p className="text-xs text-jude-subtle">
                    Экспорт на печать станет доступен после этапа оболочки.
                  </p>
                </div>
              </Card>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-jude-border">
                <Button variant="secondary" size="sm" onClick={() => handleStepChange(5)}>
                  ← К оболочке
                </Button>
                <Button
                  variant="accent"
                  size="sm"
                  onClick={() => alert("Экспорт будет активирован на следующем этапе разработки")}
                >
                  Экспортировать шлем
                </Button>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
