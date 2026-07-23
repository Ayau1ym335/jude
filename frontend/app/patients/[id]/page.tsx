"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";

interface Patient {
  id: string;
  anonymized_identifier: string;
  side: string | null;
  created_at: string;
}

interface Project {
  id: string;
  patient_id: string;
  scan_id: string;
  afo_type: string;
  status: "in_progress" | "exported" | "manufactured";
  scan_validation_status: "pending" | "valid" | "invalid" | null;
  created_at: string;
}

const STATUS_LABELS: Record<string, string> = {
  in_progress: "В работе",
  exported: "Экспортирован",
  manufactured: "Изготовлен",
};

const STATUS_COLORS: Record<string, string> = {
  in_progress: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  exported: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  manufactured: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status] ?? "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

// Показывает индикатор только если скан ещё не провалидирован или невалиден.
// Для valid — ничего не отображается, чтобы не засорять интерфейс.
function ScanStatusIndicator({
  status,
}: {
  status: string | null | undefined;
}) {
  if (!status || status === "valid") return null;
  if (status === "pending") {
    return (
      <span className="rounded px-2 py-0.5 text-xs text-yellow-700 bg-yellow-50 dark:bg-yellow-900/30 dark:text-yellow-400">
        Обработка скана...
      </span>
    );
  }
  if (status === "invalid") {
    return (
      <span className="rounded px-2 py-0.5 text-xs text-red-700 bg-red-50 dark:bg-red-900/30 dark:text-red-400">
        Скан не прошёл валидацию
      </span>
    );
  }
  return null;
}

export default function PatientDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const patientId = params.id;

  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
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
    if (!session || !patientId) return;

    async function fetchData() {
      setLoading(true);
      setError(null);
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const headers = { Authorization: `Bearer ${session!.access_token}` };

      try {
        const [patientRes, projectsRes] = await Promise.all([
          fetch(`${apiUrl}/patients/${patientId}`, { headers }),
          fetch(`${apiUrl}/projects?patient_id=${patientId}`, { headers }),
        ]);

        if (!patientRes.ok) {
          throw new Error(
            patientRes.status === 404
              ? "Пациент не найден"
              : `Ошибка загрузки пациента: ${patientRes.status}`,
          );
        }

        setPatient((await patientRes.json()) as Patient);

        if (projectsRes.ok) {
          const pData = await projectsRes.json();
          setProjects(Array.isArray(pData) ? pData : (pData.items ?? []));
        }
        // 404 для /projects?patient_id — означает просто отсутствие проектов
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка загрузки данных");
      } finally {
        setLoading(false);
      }
    }

    void fetchData();
  }, [session, patientId]);

  if (authLoading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
        <p className="text-zinc-600 dark:text-zinc-400">Загрузка...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <div className="mx-auto w-full max-w-4xl px-4 py-8">
        <h1 className="mb-4 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
          Пациент
        </h1>
        {loading && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Загрузка...</p>
        )}
        {error && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950/20 dark:text-red-400">
            {error}
          </p>
        )}

        {!loading && !error && patient && (
          <>
            <div className="mb-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                {patient.anonymized_identifier}
              </h1>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Сторона: {patient.side ?? "не указана"}
              </p>
              <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-600">
                Создан:{" "}
                {new Date(patient.created_at).toLocaleDateString("ru-RU")}
              </p>
            </div>

            <div>
              <h2 className="mb-3 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                Проекты
              </h2>

              {projects.length === 0 ? (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Проектов пока нет.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {projects.map((project) => (
                    <li key={project.id}>
                      <button
                        type="button"
                        className="w-full rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                        onClick={() =>
                          router.push(`/projects/${project.id}/viewer`)
                        }
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                            {project.afo_type ?? "AFO"}
                          </span>
                          <div className="flex items-center gap-2">
                            <ScanStatusIndicator
                              status={project.scan_validation_status}
                            />
                            <StatusBadge status={project.status} />
                          </div>
                        </div>
                        <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-600">
                          Создан:{" "}
                          {new Date(project.created_at).toLocaleDateString(
                            "ru-RU",
                          )}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
