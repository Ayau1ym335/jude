"use client";

import { ChangeEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";
import {
  fetchPatients,
  suggestPatientIdentifier,
  SIDE_LABELS,
  type Patient,
  type PatientSide,
} from "@/lib/patients";
import CreatePatientForm from "@/components/CreatePatientForm";
import PageHeader from "@/components/ui/PageHeader";
import Card, { CardTitle } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Alert from "@/components/ui/Alert";
import Spinner from "@/components/ui/Spinner";

function formatSide(side: string | null): string {
  if (!side) return "—";
  return SIDE_LABELS[side as PatientSide] ?? side;
}

export default function PatientsPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const loadPatients = useCallback(async (accessToken: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPatients(accessToken);
      setPatients(data.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, []);

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
    if (!session) return;
    void loadPatients(session.access_token);
  }, [session, loadPatients]);

  function handleSearch(e: ChangeEvent<HTMLInputElement>) {
    setSearchTerm(e.target.value);
  }

  function handlePatientCreated(patient: Patient) {
    setPatients((prev) => [patient, ...prev]);
    setShowCreateForm(false);
  }

  const filtered = patients.filter((p) =>
    p.anonymized_identifier.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  if (authLoading) {
    return <Spinner className="flex-1 py-24" />;
  }

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        title="Пациенты"
        description="Список анонимизированных карточек"
        action={
          <Button
            variant={showCreateForm ? "secondary" : "accent"}
            onClick={() => setShowCreateForm((open) => !open)}
          >
            {showCreateForm ? "Отмена" : "Добавить пациента"}
          </Button>
        }
      />

      {showCreateForm && session ? (
        <Card className="mb-6 max-w-md">
          <CardTitle className="mb-4">Новый пациент</CardTitle>
          <CreatePatientForm
            accessToken={session.access_token}
            suggestedIdentifier={suggestPatientIdentifier(patients.length)}
            onCreated={handlePatientCreated}
            onCancel={() => setShowCreateForm(false)}
          />
        </Card>
      ) : null}

      <div className="mb-4 max-w-sm">
        <Input
          placeholder="Поиск по идентификатору..."
          value={searchTerm}
          onChange={handleSearch}
        />
      </div>

      {loading && <Spinner className="py-12" />}
      {error && (
        <Alert variant="error" className="mb-4">
          {error}
        </Alert>
      )}

      {!loading && !error && (
        <Card padding="none" className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-jude-border bg-jude-surface-muted">
                <th className="px-4 py-3 text-left font-medium text-jude-muted">
                  Идентификатор
                </th>
                <th className="px-4 py-3 text-left font-medium text-jude-muted">
                  Сторона
                </th>
                <th className="px-4 py-3 text-left font-medium text-jude-muted">
                  Создан
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((patient, idx) => (
                <tr
                  key={patient.id}
                  className={`cursor-pointer transition-colors hover:bg-jude-primary-soft ${
                    idx < filtered.length - 1 ? "border-b border-jude-border" : ""
                  }`}
                  onClick={() => router.push(`/patients/${patient.id}`)}
                >
                  <td className="px-4 py-3 font-medium text-jude-ink">
                    {patient.anonymized_identifier}
                  </td>
                  <td className="px-4 py-3 text-jude-muted">
                    {formatSide(patient.side)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-jude-muted">
                    {new Date(patient.created_at).toLocaleDateString("ru-RU")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-jude-muted">
              {patients.length === 0
                ? "Пациентов пока нет. Добавьте первого."
                : "Пациенты не найдены."}
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
