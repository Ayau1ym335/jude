"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";
import { ModelViewer, type ModelViewerHandle } from "@/components/ModelViewer";
import TrimLinesPanel from "@/components/TrimLinesPanel";
import SmoothingTool from "@/components/SmoothingTool";
import InversionStep from "@/components/InversionStep";

interface ScanData {
  id: string;
  file_url: string;
  preview_mesh_url: string | null;
  file_format: "stl" | "obj" | "ply";
  scan_source: "patient_direct" | "cast_negative";
  uploaded_at: string;
  validation_status: "pending" | "valid" | "invalid";
}

interface ProjectData {
  id: string;
  patient_id: string;
  scan_id: string;
  afo_type: string;
  status: string;
}

interface ProjectVersionData {
  id: string;
  project_id: string;
  parent_version_id: string | null;
  mesh_url: string;
  created_at: string;
}

function ScanMetadataPanel({ scan }: { scan: ScanData }) {
  return (
    <div className="absolute left-4 top-4 z-20 rounded-xl border border-zinc-200 bg-white/90 px-3 py-2 shadow-sm backdrop-blur-md dark:border-zinc-700 dark:bg-zinc-900/90">
      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
        Загружен:{" "}
        <span className="text-zinc-950 dark:text-zinc-50">
          {new Date(scan.uploaded_at).toLocaleDateString("ru-RU")}
        </span>
      </p>
      <p className="mt-0.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
        Формат:{" "}
        <span className="text-zinc-950 dark:text-zinc-50">
          {scan.file_format.toUpperCase()}
        </span>
      </p>
      {scan.preview_mesh_url && (
        <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-600">
          Превью-меш
        </p>
      )}
    </div>
  );
}

export default function ProjectViewerPage() {
  const router = useRouter();
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;

  const viewerRef = useRef<ModelViewerHandle>(null);

  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [scan, setScan] = useState<ScanData | null>(null);
  const [project, setProject] = useState<ProjectData | null>(null);
  const [version, setVersion] = useState<ProjectVersionData | null>(null);
  const [scanFile, setScanFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creatingVersion, setCreatingVersion] = useState(false);

  // ─── Smoothing state ──────────────────────────────────────────────────────
  const [smoothingPickMode, setSmoothingPickMode] = useState(false);
  const [smoothingPickedPoint, setSmoothingPickedPoint] = useState<
    [number, number, number] | null
  >(null);
  const [previousScanFile, setPreviousScanFile] = useState<File | null>(null);
  const [previousVersion, setPreviousVersion] = useState<ProjectVersionData | null>(null);

  async function handleCreateVersion() {
    if (!session || !projectId) return;
    setCreatingVersion(true);
    setError(null);
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    try {
      const res = await fetch(`${apiUrl}/projects/${projectId}/versions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      if (!res.ok) throw new Error("Не удалось создать версию");
      const data = (await res.json()) as ProjectVersionData;
      setVersion(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка создания версии");
    } finally {
      setCreatingVersion(false);
    }
  }

  // ─── Smoothing handlers ────────────────────────────────────────────────────

  function handleMeshClick(point: [number, number, number]) {
    if (smoothingPickMode) {
      setSmoothingPickedPoint(point);
      setSmoothingPickMode(false);
    }
  }

  async function handleSmoothingApplied(newMeshUrl: string) {
    // Сохраняем текущее состояние для отмены
    setPreviousScanFile(scanFile);
    setPreviousVersion(version);
    setSmoothingPickedPoint(null);

    try {
      // Скачиваем обновлённый mesh из Supabase Storage
      const { data: fileData, error: storageError } = await supabase.storage
        .from("scan-files")
        .download(newMeshUrl);

      if (storageError || !fileData) {
        throw new Error(
          `Ошибка загрузки обновлённого mesh: ${storageError?.message ?? "нет данных"}`
        );
      }

      const ext = newMeshUrl.split(".").pop()?.toLowerCase() ?? "stl";
      const file = new File([fileData], `scan.${ext}`, {
        type: "application/octet-stream",
      });
      setScanFile(file);

      // Перезагружаем последнюю версию (backend создал новую запись в project_versions)
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      if (session && projectId) {
        const headers = { Authorization: `Bearer ${session.access_token}` };
        const versionsRes = await fetch(
          `${apiUrl}/projects/${projectId}/versions`,
          { headers }
        );
        if (versionsRes.ok) {
          const versions = (await versionsRes.json()) as ProjectVersionData[];
          if (versions.length > 0) {
            const latest = versions.reduce((a, b) =>
              new Date(a.created_at) > new Date(b.created_at) ? a : b
            );
            setVersion(latest);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки обновлённого mesh");
      // Откатываем при ошибке
      setPreviousScanFile(null);
      setPreviousVersion(null);
    }
  }

  function handleUndo() {
    if (previousScanFile) {
      setScanFile(previousScanFile);
      if (previousVersion) setVersion(previousVersion);
      setPreviousScanFile(null);
      setPreviousVersion(null);
      setSmoothingPickedPoint(null);
    }
  }

  // ─── Аутентификация ────────────────────────────────────────────────────────

  useEffect(() => {
    async function loadSession() {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.push("/login");
        return;
      }
      setSession(data.session);
      setAuthLoading(false);
    }
    loadSession();
  }, [router]);

  // ─── Загрузка проекта, скана и версии ────────────────────────────────────

  useEffect(() => {
    if (!session || !projectId) return;

    async function fetchAndPrepare() {
      setLoading(true);
      setError(null);
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const headers = { Authorization: `Bearer ${session!.access_token}` };

      try {
        // 1. Загружаем проект
        const projectRes = await fetch(`${apiUrl}/projects/${projectId}`, { headers });
        if (!projectRes.ok) throw new Error(`Проект не найден (${projectRes.status})`);
        const projectData = (await projectRes.json()) as ProjectData;
        setProject(projectData);

        // 2. Загружаем метаданные скана
        const scanRes = await fetch(`${apiUrl}/scans/${projectData.scan_id}`, { headers });
        if (!scanRes.ok) throw new Error(`Скан не найден (${scanRes.status})`);
        const scanData = (await scanRes.json()) as ScanData;
        setScan(scanData);

        // 3. Загружаем последнюю версию проекта (для trim_lines)
        const versionsRes = await fetch(
          `${apiUrl}/projects/${projectId}/versions`,
          { headers }
        );
        if (versionsRes.ok) {
          const versions = (await versionsRes.json()) as ProjectVersionData[];
          if (versions.length > 0) {
            // Берём последнюю версию по created_at
            const latest = versions.reduce((a, b) =>
              new Date(a.created_at) > new Date(b.created_at) ? a : b
            );
            setVersion(latest);
          }
        }

        // 4. Скачиваем файл из Supabase Storage (preview если есть, иначе оригинал)
        const storagePath = scanData.preview_mesh_url ?? scanData.file_url;
        const { data: fileData, error: storageError } = await supabase.storage
          .from("scan-files")
          .download(storagePath);

        if (storageError || !fileData) {
          throw new Error(
            `Ошибка загрузки файла скана: ${storageError?.message ?? "нет данных"}`
          );
        }

        const ext = storagePath.split(".").pop()?.toLowerCase() ?? scanData.file_format;
        const file = new File([fileData], `scan.${ext}`, {
          type: "application/octet-stream",
        });
        setScanFile(file);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка загрузки скана");
      } finally {
        setLoading(false);
      }
    }

    void fetchAndPrepare();
  }, [session, projectId]);

  // ─── Render ───────────────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
        <p className="text-zinc-600 dark:text-zinc-400">Загрузка...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black h-[100dvh]">
      <div className="flex flex-1 flex-col w-full h-full px-4 py-4 max-w-none">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="text-sm font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              ← Назад
            </button>
            {project && (
              <span className="text-sm text-zinc-400 dark:text-zinc-600">
                / {project.afo_type}
              </span>
            )}
          </div>
        </div>

        {/* Viewer card */}
        <div className="relative flex-1 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          {loading && (
            <div className="flex h-96 items-center justify-center">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {scan ? "Загрузка файла скана..." : "Загрузка данных..."}
              </p>
            </div>
          )}
          {error && (
            <div className="flex h-48 items-center justify-center">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {!loading && !error && scanFile && (
            <>
              {/* Панель метаданных — левый верхний угол */}
              {scan && <ScanMetadataPanel scan={scan} />}

              {/* Нижняя панель кнопок */}
              <div className="absolute bottom-4 right-4 z-20 flex items-center gap-2">
                {previousScanFile && (
                  <button
                    type="button"
                    onClick={handleUndo}
                    className="rounded-full border border-zinc-300 bg-white/90 px-4 py-2 text-xs font-medium text-zinc-700 shadow-sm backdrop-blur-md transition-colors hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800/90 dark:text-zinc-300 dark:hover:bg-zinc-700"
                  >
                    ↩ Отменить
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => viewerRef.current?.resetView()}
                  className="rounded-full bg-zinc-900/80 px-4 py-2 text-xs font-medium text-white shadow-sm backdrop-blur-md transition-colors hover:bg-zinc-800 dark:bg-zinc-100/90 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  Сбросить вид
                </button>
              </div>

              {/* 3D-вьюер */}
              <ModelViewer
                ref={viewerRef}
                file={scanFile}
                onMeshClick={handleMeshClick}
                pickMode={smoothingPickMode}
              />

              {/* Панель инверсии слепка — только для cast_negative, перед ректификацией */}
              {scan && version && session && (
                <InversionStep
                  scanId={scan.id}
                  versionId={version.id}
                  scanSource={scan.scan_source}
                  sessionToken={session.access_token}
                  onInverted={handleSmoothingApplied}
                />
              )}

              {/* Панель трёх PLS-линий обрезки */}
              {scan && version ? (
                <TrimLinesPanel
                  viewerRef={viewerRef}
                  scanId={scan.id}
                  versionId={version.id}
                />
              ) : scan && !version ? (
                /* Версия ещё не создана — показываем информационную плашку с кнопкой */
                <div className="absolute right-4 top-4 z-20 rounded-xl border border-amber-200 bg-amber-50/95 px-4 py-3 shadow-sm backdrop-blur-md dark:border-amber-700/50 dark:bg-amber-900/30 max-w-xs">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                    Версия проекта не найдена
                  </p>
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                    Создайте базовую версию из скана, чтобы начать работу с разметкой линий.
                  </p>
                  <button
                    onClick={handleCreateVersion}
                    disabled={creatingVersion}
                    className="mt-3 w-full rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50 dark:bg-amber-500 dark:hover:bg-amber-600"
                  >
                    {creatingVersion ? "Создание..." : "Создать версию"}
                  </button>
                </div>
              ) : null}

              {/* Панель сглаживания */}
              {scan && version && (
                <SmoothingTool
                  viewerRef={viewerRef}
                  scanId={scan.id}
                  versionId={version.id}
                  onApplied={handleSmoothingApplied}
                  pickedPoint={smoothingPickedPoint}
                  isPickMode={smoothingPickMode}
                  onTogglePickMode={setSmoothingPickMode}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
