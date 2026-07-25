"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";
import { ModelViewer, type ModelViewerHandle } from "@/components/ModelViewer";
import TrimLineDrawer, { type TrimLineDrawerHandle, type SavedLine } from "@/components/TrimLineDrawer";
import TrimLineControls from "@/components/TrimLineControls";

interface ScanData {
  id: string;
  file_url: string;
  preview_mesh_url: string | null;
  file_format: "stl" | "obj" | "ply";
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
  const drawerRef = useRef<TrimLineDrawerHandle>(null);

  // activeTool: null = орбита, "draw" = рисование линии
  const [activeTool, setActiveTool] = useState<"draw" | null>(null);
  // Состояние TrimLineDrawer, синхронизируется через onStateChange
  const [drawerState, setDrawerState] = useState({
    isDrawing: true,
    pointsCount: 0,
    loading: false,
  });

  const handleDrawerStateChange = useCallback(
    (state: { isDrawing: boolean; pointsCount: number; loading: boolean }) => {
      setDrawerState(state);
    },
    []
  );

  const handleSave = useCallback((data: SavedLine) => {
    console.log("[viewer] Линия сохранена:", data);
    // TODO (Неделя 11): POST /lines { scan_id, line_type, anchor_points, curve_points }
    setActiveTool(null);
  }, []);

  const handleCancelDrawing = useCallback(() => {
    drawerRef.current?.reset();
    setActiveTool(null);
  }, []);

  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [scan, setScan] = useState<ScanData | null>(null);
  const [project, setProject] = useState<ProjectData | null>(null);
  const [scanFile, setScanFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

        // 3. Скачиваем файл из Supabase Storage (preview если есть, иначе оригинал)
        const storagePath = scanData.preview_mesh_url ?? scanData.file_url;
        const { data: fileData, error: storageError } = await supabase.storage
          .from("scan-files")
          .download(storagePath);

        if (storageError || !fileData) {
          throw new Error(`Ошибка загрузки файла скана: ${storageError?.message ?? "нет данных"}`);
        }

        // Определяем расширение из пути
        const ext = storagePath.split(".").pop()?.toLowerCase() ?? scanData.file_format;
        const file = new File([fileData], `scan.${ext}`, { type: "application/octet-stream" });
        setScanFile(file);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка загрузки скана");
      } finally {
        setLoading(false);
      }
    }

    void fetchAndPrepare();
  }, [session, projectId]);

  if (authLoading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
        <p className="text-zinc-600 dark:text-zinc-400">Загрузка...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <div className="mx-auto w-full max-w-6xl px-4 py-6">
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

          {/* Панель инструментов */}
          {!loading && !error && scanFile && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setActiveTool((t) => (t === "draw" ? null : "draw"))
                }
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeTool === "draw"
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                }`}
              >
                ✏️ Линия
              </button>
            </div>
          )}
        </div>

        {/* Viewer card */}
        <div className="relative rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950 overflow-hidden">
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
              {/* Панель метаданных — левый верхний угол поверх Canvas (задача 4.2) */}
              {scan && <ScanMetadataPanel scan={scan} />}

              {/* Кнопка сброса — правый верхний угол поверх Canvas (задача 4.1) */}
              <div className="absolute right-4 top-4 z-20">
                <button
                  type="button"
                  onClick={() => viewerRef.current?.resetView()}
                  className="rounded-full bg-zinc-900/80 px-4 py-2 text-xs font-medium text-white shadow-sm backdrop-blur-md transition-colors hover:bg-zinc-800 dark:bg-zinc-100/90 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  Сбросить вид
                </button>
              </div>

              {/* 3D-вьюер — занимает всю ширину карточки */}
              <ModelViewer ref={viewerRef} file={scanFile} />

              {/* TrimLineDrawer — активен только в режиме "draw" */}
              {activeTool === "draw" && scan && (
                <TrimLineDrawer
                  ref={drawerRef}
                  viewerRef={viewerRef}
                  scanId={scan.id}
                  lineType="trim"
                  onSave={handleSave}
                  onStateChange={handleDrawerStateChange}
                />
              )}

              {/* TrimLineControls — панель управления рисованием */}
              {activeTool === "draw" && (
                <TrimLineControls
                  isDrawing={drawerState.isDrawing}
                  pointsCount={drawerState.pointsCount}
                  loading={drawerState.loading}
                  lineType="trim"
                  onUndo={() => drawerRef.current?.removeLastPoint()}
                  onFinish={() => drawerRef.current?.finishDrawing()}
                  onCancel={handleCancelDrawing}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
