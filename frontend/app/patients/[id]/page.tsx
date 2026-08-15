"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";
import { SIDE_LABELS, type PatientSide } from "@/lib/patients";
import PageHeader from "@/components/ui/PageHeader";
import Card, { CardTitle } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Alert from "@/components/ui/Alert";
import Spinner from "@/components/ui/Spinner";
import Button from "@/components/ui/Button";

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

const STATUS_VARIANT: Record<string, "warning" | "accent" | "success" | "muted"> = {
  in_progress: "warning",
  exported: "accent",
  manufactured: "success",
};

function ScanStatusIndicator({
  status,
}: {
  status: string | null | undefined;
}) {
  if (!status || status === "valid") return null;
  if (status === "pending") {
    return <Badge variant="warning">Обработка скана...</Badge>;
  }
  if (status === "invalid") {
    return <Badge variant="error">Скан не прошёл валидацию</Badge>;
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
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка загрузки данных");
      } finally {
        setLoading(false);
      }
    }

    void fetchData();
  }, [session, patientId]);

  if (authLoading) {
    return <Spinner className="flex-1 py-24" />;
  }

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        title="Пациент"
        action={
          <Button variant="ghost" size="sm" onClick={() => router.push("/patients")}>
            ← К списку
          </Button>
        }
      />

      {loading && <Spinner className="py-12" />}
      {error && <Alert variant="error">{error}</Alert>}

      {!loading && !error && patient && (
        <>
          <Card className="mb-8">
            <h2 className="text-2xl font-semibold text-jude-ink">
              {patient.anonymized_identifier}
            </h2>
              <p className="mt-1 text-sm text-jude-muted">
                Сторона:{" "}
                {patient.side
                  ? (SIDE_LABELS[patient.side as PatientSide] ?? patient.side)
                  : "не указана"}
              </p>
            <p className="mt-0.5 font-mono text-xs text-jude-subtle">
              Создан: {new Date(patient.created_at).toLocaleDateString("ru-RU")}
            </p>
          </Card>

          <div>
            <CardTitle className="mb-3">Проекты</CardTitle>

            {projects.length === 0 ? (
              <p className="text-sm text-jude-muted">Проектов пока нет.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {projects.map((project) => (
                  <li key={project.id}>
                    <button
                      type="button"
                      className="w-full rounded-xl border border-jude-border bg-jude-surface p-4 text-left shadow-jude transition-colors hover:bg-jude-surface-muted"
                      onClick={() =>
                        router.push(`/projects/${project.id}/viewer`)
                      }
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-jude-ink">
                          {project.afo_type ?? "AFO"}
                        </span>
                        <div className="flex items-center gap-2">
                          <ScanStatusIndicator
                            status={project.scan_validation_status}
                          />
                          <Badge variant={STATUS_VARIANT[project.status] ?? "muted"}>
                            {STATUS_LABELS[project.status] ?? project.status}
                          </Badge>
                        </div>
                      </div>
                      <p className="mt-1 font-mono text-xs text-jude-subtle">
                        {new Date(project.created_at).toLocaleDateString("ru-RU")}
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
  );
}
