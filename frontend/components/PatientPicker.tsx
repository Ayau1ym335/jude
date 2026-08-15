"use client";

import { useEffect, useState } from "react";

import CreatePatientForm from "@/components/CreatePatientForm";
import Select from "@/components/ui/Select";
import Alert from "@/components/ui/Alert";
import Spinner from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";
import {
  fetchPatients,
  suggestPatientIdentifier,
  SIDE_LABELS,
  type Patient,
} from "@/lib/patients";

type PickerMode = "existing" | "new";

interface PatientPickerProps {
  accessToken: string;
  value: string;
  onChange: (patientId: string) => void;
}

export default function PatientPicker({
  accessToken,
  value,
  onChange,
}: PatientPickerProps) {
  const [mode, setMode] = useState<PickerMode>("existing");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchPatients(accessToken);
        setPatients(data.items);
        if (data.items.length === 0) {
          setMode("new");
        } else if (!value) {
          onChange(data.items[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка загрузки");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [accessToken, value, onChange]);

  function handlePatientCreated(patient: Patient) {
    setPatients((prev) => [patient, ...prev]);
    onChange(patient.id);
    setMode("existing");
  }

  if (loading) {
    return <Spinner className="py-6" label="Загрузка пациентов..." />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex rounded-lg border border-jude-border bg-jude-surface-muted p-1">
        <button
          type="button"
          disabled={patients.length === 0}
          onClick={() => setMode("existing")}
          className={cn(
            "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            mode === "existing"
              ? "bg-jude-surface text-jude-ink shadow-jude-sm"
              : "text-jude-muted hover:text-jude-ink disabled:opacity-40",
          )}
        >
          Выбрать пациента
        </button>
        <button
          type="button"
          onClick={() => setMode("new")}
          className={cn(
            "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            mode === "new"
              ? "bg-jude-surface text-jude-ink shadow-jude-sm"
              : "text-jude-muted hover:text-jude-ink",
          )}
        >
          Новый пациент
        </button>
      </div>

      {error ? <Alert variant="error">{error}</Alert> : null}

      {mode === "existing" && patients.length > 0 ? (
        <Select
          label="Пациент"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
        >
          {patients.map((patient) => (
            <option key={patient.id} value={patient.id}>
              {patient.anonymized_identifier}
              {patient.side ? ` — ${SIDE_LABELS[patient.side]}` : ""}
            </option>
          ))}
        </Select>
      ) : null}

      {mode === "new" ? (
        <CreatePatientForm
          accessToken={accessToken}
          suggestedIdentifier={suggestPatientIdentifier(patients.length)}
          onCreated={handlePatientCreated}
          compact
        />
      ) : null}
    </div>
  );
}
