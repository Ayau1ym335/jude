"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";
import { ModelViewer } from "@/components/ModelViewer";

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
    return Promise.reject(new Error("Supabase env is not configured"));
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
      if (!event.lengthComputable || event.total === 0) {
        return;
      }
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

      let message = `Upload failed (${xhr.status})`;
      try {
        const body = JSON.parse(xhr.responseText) as {
          message?: string;
          error?: string;
        };
        message = body.message || body.error || message;
      } catch {
        // keep default message
      }
      reject(new Error(message));
    };

    xhr.onerror = () => reject(new Error("Upload failed"));
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
      setErrorMessage("Unsupported file");
      event.target.value = "";
      return;
    }

    if (selected.size > MAX_FILE_SIZE_BYTES) {
      setFile(null);
      setStatus("error");
      setErrorMessage("File too large");
      event.target.value = "";
      return;
    }

    setFile(selected);
    setStatus("idle");
    setErrorMessage(null);
    setProgress(0);
  }

  async function runUpload() {
    if (!file || !session) {
      return;
    }

    const extension = getExtension(file.name) as FileFormat;
    const path = `${patientId.trim()}/${file.name}`;

    setStatus("uploading");
    setProgress(0);
    setErrorMessage(null);
    setUploadedPath(null);

    try {
      const storedPath = await uploadToStorageWithProgress(
        path,
        file,
        session.access_token,
        setProgress,
      );

      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      if (!apiUrl) {
        throw new Error("NEXT_PUBLIC_API_URL is not configured");
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

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      setUploadedPath(storedPath);
      setProgress(100);
      setStatus("success");
    } catch {
      setStatus("error");
      setErrorMessage("Upload failed");
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runUpload();
  }

  if (authLoading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
        <p className="text-zinc-600 dark:text-zinc-400">Loading...</p>
      </div>
    );
  }

  const canUpload =
    Boolean(file) &&
    Boolean(patientId.trim()) &&
    status !== "uploading" &&
    status !== "success";

  const showRetry = status === "error" && Boolean(file);
  const buttonDisabled =
    status === "uploading" || (!showRetry && !canUpload);

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <main className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="mb-6 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
          Upload Scan
        </h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Patient ID
            <input
              type="text"
              value={patientId}
              onChange={(event) => setPatientId(event.target.value)}
              required
              placeholder="00000000-0000-0000-0000-000000000000"
              className="rounded-lg border border-zinc-300 px-3 py-2 text-base font-normal text-zinc-950 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Scan source
            <select
              value={scanSource}
              onChange={(event) =>
                setScanSource(event.target.value as ScanSource)
              }
              className="rounded-lg border border-zinc-300 px-3 py-2 text-base font-normal text-zinc-950 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            >
              <option value="patient_direct">patient_direct</option>
              <option value="cast_negative">cast_negative</option>
            </select>
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Scan file
            <input
              type="file"
              accept=".stl,.obj,.ply"
              onChange={handleFileChange}
              className="text-sm font-normal text-zinc-950 file:mr-3 file:rounded-full file:border-0 file:bg-zinc-100 file:px-4 file:py-2 file:text-sm file:font-medium dark:text-zinc-50 dark:file:bg-zinc-800"
            />
          </label>

          {file ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Selected: {file.name}
              </p>
              <ModelViewer file={file} />
            </div>
          ) : null}

          {status === "uploading" ? (
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              Uploading... {progress}%
            </p>
          ) : null}

          {status === "success" && uploadedPath ? (
            <p className="text-sm text-green-700 dark:text-green-400">
              Success: {uploadedPath}
            </p>
          ) : null}

          {errorMessage ? (
            <p className="text-sm text-red-600 dark:text-red-400">
              {errorMessage}
            </p>
          ) : null}

          {showRetry ? (
            <button
              type="button"
              onClick={() => void runUpload()}
              disabled={!patientId.trim()}
              className="mt-2 rounded-full bg-zinc-950 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              Retry
            </button>
          ) : (
            <button
              type="submit"
              disabled={buttonDisabled}
              className="mt-2 rounded-full bg-zinc-950 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              Upload
            </button>
          )}
        </form>
      </main>
    </div>
  );
}
