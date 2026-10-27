"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";
import { api, type PatientRead, type ProjectRead } from "@/lib/api";
import { SIDE_LABELS, type PatientSide } from "@/lib/patients";
import PageHeader from "@/components/ui/PageHeader";
import Card, { CardTitle } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Alert from "@/components/ui/Alert";
import Spinner from "@/components/ui/Spinner";
import Button from "@/components/ui/Button";
import HeadDynamicsChart from "@/components/HeadDynamicsChart";

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
  const [patient, setPatient] = useState<PatientRead | null>(null);
  const [projects, setProjects] = useState<ProjectRead[]>([]);
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

      try {
        const [patientData, projectsData] = await Promise.all([
          api.patients.get(session!.access_token, patientId),
          api.projects.list(session!.access_token, patientId),
        ]);

        setPatient(patientData);
        setProjects(projectsData.items ?? []);
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
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-jude-ink">
                  {patient.anonymized_identifier}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                  {patient.age_display ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-jude-muted">Возраст младенца:</span>
                      <Badge variant="accent">{patient.age_display}</Badge>
                    </div>
                  ) : null}

                  {patient.birth_date ? (
                    <span className="text-jude-muted">
                      Дата рождения:{" "}
                      <span className="font-medium text-jude-ink">
                        {new Date(patient.birth_date).toLocaleDateString("ru-RU")}
                      </span>
                    </span>
                  ) : null}

                  <span className="text-jude-muted">
                    Сторона заметок:{" "}
                    <span className="font-medium text-jude-ink">
                      {patient.side
                        ? (SIDE_LABELS[patient.side as PatientSide] ?? patient.side)
                        : "не указана"}
                    </span>
                  </span>
                </div>
              </div>

              <span className="font-mono text-xs text-jude-subtle">
                Создан: {new Date(patient.created_at).toLocaleDateString("ru-RU")}
              </span>
            </div>

            {patient.notes ? (
              <div className="mt-4 rounded-xl border border-jude-border bg-jude-surface-muted p-3 text-sm">
                <span className="font-medium text-jude-ink">Заметки врача: </span>
                <span className="text-jude-muted">{patient.notes}</span>
              </div>
            ) : null}
          </Card>

          <div>
            <CardTitle className="mb-3">Проекты краниальных шлемов</CardTitle>

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
                          {project.product_type === "cranial_helmet"
                            ? "Краниальный шлем"
                            : project.helmet_type ?? project.afo_type ?? "Краниальный шлем"}
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

          {/* ─── Динамика асимметрии черепа (CVAI) по визитам ─── */}
          <HeadDynamicsChart
            patientId={patientId}
            accessToken={session?.access_token}
          />
        </>
      )}
    </div>
  );
}
