"use client";

import { FormEvent, useState } from "react";

import {
  createPatient,
  suggestPatientIdentifier,
  type Patient,
  type PatientSide,
} from "@/lib/patients";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import Alert from "@/components/ui/Alert";

interface CreatePatientFormProps {
  accessToken: string;
  suggestedIdentifier?: string;
  onCreated: (patient: Patient) => void;
  onCancel?: () => void;
  compact?: boolean;
}

export default function CreatePatientForm({
  accessToken,
  suggestedIdentifier = suggestPatientIdentifier(0),
  onCreated,
  onCancel,
  compact = false,
}: CreatePatientFormProps) {
  const [identifier, setIdentifier] = useState(suggestedIdentifier);
  const [side, setSide] = useState<PatientSide | "">("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const patient = await createPatient(accessToken, {
        anonymized_identifier: identifier,
        side: side || null,
      });
      onCreated(patient);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка создания");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input
        label="Идентификатор"
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        required
        placeholder="P-2026-0001"
        className="font-mono text-sm"
      />

      <Select
        label="Сторона"
        value={side}
        onChange={(e) => setSide(e.target.value as PatientSide | "")}
      >
        <option value="">Не указана</option>
        <option value="left">Левая</option>
        <option value="right">Правая</option>
        <option value="both">Обе</option>
      </Select>

      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className={compact ? "flex gap-2" : "flex flex-col gap-2 sm:flex-row"}>
        <Button type="submit" variant="accent" disabled={loading} className="flex-1">
          {loading ? "Создание..." : "Создать пациента"}
        </Button>
        {onCancel ? (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Отмена
          </Button>
        ) : null}
      </div>
    </form>
  );
}
