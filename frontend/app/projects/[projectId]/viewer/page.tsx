"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";
import { ModelViewer, type ModelViewerHandle } from "@/components/ModelViewer";
import TrimLinesPanel from "@/components/TrimLinesPanel";
import SmoothingTool from "@/components/SmoothingTool";
import InversionStep from "@/components/InversionStep";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import Badge from "@/components/ui/Badge";

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
    <div className="absolute left-4 top-4 z-20 rounded-xl border border-jude-border bg-jude-surface/95 px-3 py-2 shadow-jude backdrop-blur-md">
      <p className="text-xs font-medium text-jude-muted">
        Загружен:{" "}
        <span className="text-jude-ink">
          {new Date(scan.uploaded_at).toLocaleDateString("ru-RU")}
        </span>
      </p>
      <p className="mt-0.5 text-xs font-medium text-jude-muted">
        Формат:{" "}
        <span className="font-mono text-jude-ink">
          {scan.file_format.toUpperCase()}
        </span>
      </p>
      {scan.preview_mesh_url && (
        <p className="mt-0.5 text-xs text-jude-subtle">Превью-меш</p>
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
    return <Spinner className="flex-1 py-24" />;
  }

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-1">
      {/* Canvas area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-jude-border px-4 py-3">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            ← Назад
          </Button>
          {project && (
            <span className="text-sm text-jude-muted">
              {project.afo_type}
            </span>
          )}
          {scan && (
            <Badge
              variant={
                scan.validation_status === "valid"
                  ? "success"
                  : scan.validation_status === "invalid"
                    ? "error"
                    : "warning"
              }
            >
              {scan.validation_status === "valid"
                ? "Скан валиден"
                : scan.validation_status === "invalid"
                  ? "Скан невалиден"
                  : "Проверка скана"}
            </Badge>
          )}
        </div>

        <div className="relative flex-1 bg-jude-canvas">
          {loading && (
            <div className="flex h-full items-center justify-center">
              <Spinner label={scan ? "Загрузка файла скана..." : "Загрузка данных..."} />
            </div>
          )}
          {error && (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-jude-error">{error}</p>
            </div>
          )}

          {!loading && !error && scanFile && (
            <>
              {scan && <ScanMetadataPanel scan={scan} />}

              <div className="absolute bottom-4 left-4 z-20 flex items-center gap-2">
                {previousScanFile && (
                  <Button variant="secondary" size="sm" onClick={handleUndo}>
                    ↩ Отменить
                  </Button>
                )}
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => viewerRef.current?.resetView()}
                >
                  Сбросить вид
                </Button>
              </div>

              <ModelViewer
                ref={viewerRef}
                file={scanFile}
                onMeshClick={handleMeshClick}
                pickMode={smoothingPickMode}
              />
            </>
          )}
        </div>
      </div>

      {/* Right tools panel */}
      <aside className="flex w-[340px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-jude-border bg-jude-surface p-4 shadow-jude-sm">
        <h2 className="font-heading text-sm text-jude-primary">
          Инструменты
        </h2>

        {scan && version && session && (
          <InversionStep
            scanId={scan.id}
            versionId={version.id}
            scanSource={scan.scan_source}
            sessionToken={session.access_token}
            onInverted={handleSmoothingApplied}
            embedded
          />
        )}

        {scan && version ? (
          <TrimLinesPanel
            viewerRef={viewerRef}
            scanId={scan.id}
            versionId={version.id}
            embedded
          />
        ) : scan && !version ? (
          <div className="rounded-xl border border-jude-warning/30 bg-jude-warning-soft p-4 shadow-jude">
            <p className="text-sm font-medium text-jude-warning">
              Версия проекта не найдена
            </p>
            <p className="mt-1 text-xs text-jude-warning/80">
              Создайте базовую версию из скана, чтобы начать работу с разметкой линий.
            </p>
            <Button
              variant="primary"
              size="sm"
              className="mt-3 w-full"
              onClick={handleCreateVersion}
              disabled={creatingVersion}
            >
              {creatingVersion ? "Создание..." : "Создать версию"}
            </Button>
          </div>
        ) : null}

        {scan && version && (
          <SmoothingTool
            viewerRef={viewerRef}
            scanId={scan.id}
            versionId={version.id}
            onApplied={handleSmoothingApplied}
            pickedPoint={smoothingPickedPoint}
            isPickMode={smoothingPickMode}
            onTogglePickMode={setSmoothingPickMode}
            embedded
          />
        )}
      </aside>
    </div>
  );
}
