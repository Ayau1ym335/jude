"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";

interface Patient {
  id: string;
  anonymized_identifier: string;
  side: string | null;
  created_at: string;
}

interface PatientList {
  items: Patient[];
  total: number;
  limit: number;
  offset: number;
}

export default function PatientsPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
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
    if (!session) return;

    async function fetchPatients() {
      setLoading(true);
      setError(null);
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      try {
        const response = await fetch(`${apiUrl}/patients?limit=100&offset=0`, {
          headers: {
            Authorization: `Bearer ${session!.access_token}`,
          },
        });
        if (!response.ok) throw new Error(`API error: ${response.status}`);
        const data = (await response.json()) as PatientList;
        // GET /patients возвращает { items, total, limit, offset }
        setPatients(data.items ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка загрузки");
      } finally {
        setLoading(false);
      }
    }

    void fetchPatients();
  }, [session]);

  function handleSearch(e: ChangeEvent<HTMLInputElement>) {
    setSearchTerm(e.target.value);
  }

  const filtered = patients.filter((p) =>
    p.anonymized_identifier.toLowerCase().includes(searchTerm.toLowerCase()),
  );

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
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
            Пациенты
          </h1>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="text-sm font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            ← Dashboard
          </button>
        </div>

        <div className="mb-4">
          <input
            type="text"
            placeholder="Поиск по идентификатору..."
            value={searchTerm}
            onChange={handleSearch}
            className="w-full max-w-sm rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-950 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </div>

        {loading && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Загрузка списка пациентов...
          </p>
        )}
        {error && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950/20 dark:text-red-400">
            Ошибка: {error}
          </p>
        )}

        {!loading && !error && (
          <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  <th className="px-4 py-3 text-left font-medium text-zinc-500 dark:text-zinc-400">
                    Идентификатор
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-500 dark:text-zinc-400">
                    Сторона
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-500 dark:text-zinc-400">
                    Создан
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((patient, idx) => (
                  <tr
                    key={patient.id}
                    className={`cursor-pointer transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900 ${
                      idx < filtered.length - 1
                        ? "border-b border-zinc-200 dark:border-zinc-800"
                        : ""
                    }`}
                    onClick={() => router.push(`/patients/${patient.id}`)}
                  >
                    <td className="px-4 py-3 font-medium text-zinc-950 dark:text-zinc-50">
                      {patient.anonymized_identifier}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {patient.side ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {new Date(patient.created_at).toLocaleDateString("ru-RU")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filtered.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
                Пациенты не найдены.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
