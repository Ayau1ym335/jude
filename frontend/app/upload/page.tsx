"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";
import { ModelViewer } from "@/components/ModelViewer";
import PatientPicker from "@/components/PatientPicker";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import Alert from "@/components/ui/Alert";
import Progress from "@/components/ui/Progress";
import Spinner from "@/components/ui/Spinner";

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(["stl", "obj", "ply"]);
const BUCKET = "scan-files";

type Status = "idle" | "uploading" | "success" | "error";
type ScanSource = "patient_direct" | "cast_negative";
type FileFormat = "stl" | "obj" | "ply";

function getExtension(filename: string): string {
  const parts = filename.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

function uploadToStorageWithProgress(
  path: string,
  file: File,
  accessToken: string,
  onProgress: (percent: number) => void,
): Promise<string> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return Promise.reject(new Error("Supabase не настроен"));
  }

  const encodedPath = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(
      "POST",
      `${supabaseUrl}/storage/v1/object/${BUCKET}/${encodedPath}`,
    );
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    xhr.setRequestHeader("apikey", anonKey);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader(
      "Content-Type",
      file.type || "application/octet-stream",
    );

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total === 0) return;
      onProgress(Math.round((event.loaded / event.total) * 100));
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const body = JSON.parse(xhr.responseText) as { Key?: string };
          const key = body.Key ?? `${BUCKET}/${path}`;
          const storedPath = key.startsWith(`${BUCKET}/`)
            ? key.slice(BUCKET.length + 1)
            : path;
          resolve(storedPath);
        } catch {
          resolve(path);
        }
        return;
      }

      let message = `Ошибка загрузки (${xhr.status})`;
      try {
        const body = JSON.parse(xhr.responseText) as {
          message?: string;
          error?: string;
        };
        message = body.message || body.error || message;
      } catch {
        // keep default
      }
      reject(new Error(message));
    };

    xhr.onerror = () => reject(new Error("Ошибка загрузки"));
    xhr.send(file);
  });
}

export default function UploadScanPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [patientId, setPatientId] = useState("");
  const [scanSource, setScanSource] = useState<ScanSource>("patient_direct");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);

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

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setUploadedPath(null);
    setCreatedProjectId(null);

    if (!selected) {
      setFile(null);
      setStatus("idle");
      setErrorMessage(null);
      return;
    }

    const extension = getExtension(selected.name);
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      setFile(null);
      setStatus("error");
      setErrorMessage("Неподдерживаемый формат файла");
      event.target.value = "";
      return;
    }

    if (selected.size > MAX_FILE_SIZE_BYTES) {
      setFile(null);
      setStatus("error");
      setErrorMessage("Файл слишком большой (макс. 100 МБ)");
      event.target.value = "";
      return;
    }

    setFile(selected);
    setStatus("idle");
    setErrorMessage(null);
    setProgress(0);
  }

  async function runUpload() {
    if (!file || !session || !patientId.trim()) return;

    const extension = getExtension(file.name) as FileFormat;
    const path = `${patientId.trim()}/${file.name}`;

    setStatus("uploading");
    setProgress(0);
    setErrorMessage(null);
    setUploadedPath(null);
    setCreatedProjectId(null);

    try {
      const storedPath = await uploadToStorageWithProgress(
        path,
        file,
        session.access_token,
        setProgress,
      );

      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      if (!apiUrl) {
        throw new Error("NEXT_PUBLIC_API_URL не настроен");
      }

      const response = await fetch(`${apiUrl}/scans`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          patient_id: patientId.trim(),
          file_url: storedPath,
          file_format: extension,
          scan_source: scanSource,
        }),
      });

      if (!response.ok) throw new Error("Не удалось сохранить скан");

      const scanData = (await response.json()) as { id: string };

      const projectResponse = await fetch(`${apiUrl}/projects`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          patient_id: patientId.trim(),
          scan_id: scanData.id,
          afo_type: "posterior_leaf_spring",
        }),
      });

      if (!projectResponse.ok) throw new Error("Не удалось создать проект");

      const projectData = (await projectResponse.json()) as { id: string };

      setUploadedPath(storedPath);
      setCreatedProjectId(projectData.id);
      setProgress(100);
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setErrorMessage(
        err instanceof Error ? err.message : "Ошибка загрузки",
      );
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runUpload();
  }

  if (authLoading) {
    return <Spinner className="flex-1 py-24" />;
  }

  const canUpload =
    Boolean(file) &&
    Boolean(patientId.trim()) &&
    status !== "uploading" &&
    status !== "success";

  const showRetry = status === "error" && Boolean(file);
  const buttonDisabled = status === "uploading" || (!showRetry && !canUpload);

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        title="Загрузка скана"
        description="STL, OBJ или PLY — до 100 МБ"
      />

      <div className="mx-auto w-full max-w-lg">
        <Card>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {session ? (
              <PatientPicker
                accessToken={session.access_token}
                value={patientId}
                onChange={setPatientId}
              />
            ) : null}

            <Select
              label="Тип скана"
              value={scanSource}
              onChange={(event) =>
                setScanSource(event.target.value as ScanSource)
              }
            >
              <option value="patient_direct">Прямой скан пациента</option>
              <option value="cast_negative">Скан гипсового слепка (негатив)</option>
            </Select>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-jude-ink">Файл скана</span>
              <input
                type="file"
                accept=".stl,.obj,.ply"
                onChange={handleFileChange}
                className="text-sm text-jude-muted file:mr-3 file:rounded-lg file:border-0 file:bg-jude-primary-soft file:px-4 file:py-2 file:text-sm file:font-medium file:text-jude-primary"
              />
            </label>

            {file ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-jude-muted">Выбран: {file.name}</p>
                <div className="overflow-hidden rounded-xl border border-jude-border bg-jude-canvas">
                  <ModelViewer file={file} />
                </div>
              </div>
            ) : null}

            {status === "uploading" ? (
              <Progress value={progress} label="Загрузка..." />
            ) : null}

            {status === "success" && uploadedPath ? (
              <Alert variant="success">
                <p>Скан загружен: {uploadedPath}</p>
                {createdProjectId ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="mt-3"
                    onClick={() =>
                      router.push(`/projects/${createdProjectId}/viewer`)
                    }
                  >
                    Открыть проект
                  </Button>
                ) : null}
              </Alert>
            ) : null}

            {errorMessage ? <Alert variant="error">{errorMessage}</Alert> : null}

            {showRetry ? (
              <Button
                type="button"
                variant="accent"
                onClick={() => void runUpload()}
                disabled={!patientId.trim()}
                className="w-full"
              >
                Повторить
              </Button>
            ) : (
              <Button
                type="submit"
                variant="accent"
                disabled={buttonDisabled}
                className="w-full"
              >
                Загрузить
              </Button>
            )}
          </form>
        </Card>
      </div>
    </div>
  );
}
