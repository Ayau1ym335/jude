"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";
import PageHeader from "@/components/ui/PageHeader";
import Card, { CardTitle } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import Alert from "@/components/ui/Alert";

interface PatientList {
  items: { id: string }[];
  total: number;
}

interface Project {
  id: string;
  patient_id: string;
  afo_type: string;
  status: string;
  scan_validation_status: string | null;
  created_at: string;
}

interface ProjectList {
  items: Project[];
  total: number;
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

export default function DashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [patientCount, setPatientCount] = useState(0);
  const [projectCount, setProjectCount] = useState(0);
  const [recentProjects, setRecentProjects] = useState<Project[]>([]);

  useEffect(() => {
    async function loadSession() {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.push("/login");
        return;
      }
      setSession(data.session);
    }
    void loadSession();
  }, [router]);

  useEffect(() => {
    if (!session) return;

    async function fetchDashboard() {
      setLoading(true);
      setError(null);
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const headers = { Authorization: `Bearer ${session!.access_token}` };

      try {
        const [patientsRes, projectsRes] = await Promise.all([
          fetch(`${apiUrl}/patients?limit=1&offset=0`, { headers }),
          fetch(`${apiUrl}/projects`, { headers }),
        ]);

        if (!patientsRes.ok) throw new Error("Не удалось загрузить пациентов");
        if (!projectsRes.ok) throw new Error("Не удалось загрузить проекты");

        const patientsData = (await patientsRes.json()) as PatientList;
        const projectsData = (await projectsRes.json()) as ProjectList;

        setPatientCount(patientsData.total ?? patientsData.items.length);
        setProjectCount(projectsData.total ?? projectsData.items.length);
        setRecentProjects((projectsData.items ?? []).slice(0, 5));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка загрузки");
      } finally {
        setLoading(false);
      }
    }

    void fetchDashboard();
  }, [session]);

  if (!session && loading) {
    return <Spinner className="flex-1 py-24" />;
  }

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        title="Главная"
        description="Обзор работы клиники"
        action={
          <Button variant="accent" onClick={() => router.push("/upload")}>
            Загрузить скан
          </Button>
        }
      />

      {error ? (
        <Alert variant="error" className="mb-6">
          {error}
        </Alert>
      ) : null}

      {loading ? (
        <Spinner className="py-16" />
      ) : (
        <>
          <div className="mb-8 grid grid-cols-2 gap-4">
            <Card padding="md" className="shadow-jude">
              <p className="text-sm text-jude-muted">Пациентов</p>
              <p className="mt-1 font-heading text-3xl text-jude-primary">
                {patientCount}
              </p>
            </Card>
            <Card padding="md" className="shadow-jude">
              <p className="text-sm text-jude-muted">Проектов</p>
              <p className="mt-1 font-heading text-3xl text-jude-accent">
                {projectCount}
              </p>
            </Card>
          </div>

          <Card padding="none" className="overflow-hidden">
            <div className="border-b border-jude-border px-6 py-4">
              <CardTitle>Недавние проекты</CardTitle>
            </div>

            {recentProjects.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-jude-muted">
                Проектов пока нет.{" "}
                <Link href="/upload" className="text-jude-accent hover:underline">
                  Загрузите первый скан
                </Link>
              </p>
            ) : (
              <ul className="divide-y divide-jude-border">
                {recentProjects.map((project) => (
                  <li key={project.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-6 py-4 text-left transition-colors hover:bg-jude-surface-muted"
                      onClick={() => router.push(`/projects/${project.id}/viewer`)}
                    >
                      <div>
                        <p className="text-sm font-medium text-jude-ink">
                          {project.afo_type}
                        </p>
                        <p className="mt-0.5 font-mono text-xs text-jude-subtle">
                          {project.id.slice(0, 8)}…
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {project.scan_validation_status === "pending" ? (
                          <Badge variant="warning">Обработка</Badge>
                        ) : null}
                        <Badge variant={STATUS_VARIANT[project.status] ?? "muted"}>
                          {STATUS_LABELS[project.status] ?? project.status}
                        </Badge>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="mt-6 flex gap-3">
            <Button variant="secondary" onClick={() => router.push("/patients")}>
              Все пациенты
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
