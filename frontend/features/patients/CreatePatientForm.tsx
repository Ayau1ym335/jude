"use client";

import { FormEvent, useState } from "react";

import {
  calculateInfantAge,
  createPatient,
  suggestPatientIdentifier,
  type Patient,
  type PatientSide,
} from "@/lib/patients";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";

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
  const [birthDate, setBirthDate] = useState("");
  const [side, setSide] = useState<PatientSide | "">("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calculatedAge = calculateInfantAge(birthDate);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const patient = await createPatient(accessToken, {
        anonymized_identifier: identifier,
        birth_date: birthDate || null,
        side: side || null,
        notes: notes || null,
      });
      onCreated(patient);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка создания пациента");
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

      <div className="flex flex-col gap-1.5">
        <Input
          label="Дата рождения младенца"
          type="date"
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
        />
        {calculatedAge.display ? (
          <div className="flex items-center gap-2 pt-1 text-xs">
            <span className="text-jude-muted">Возраст:</span>
            <Badge variant="accent">{calculatedAge.display}</Badge>
            {calculatedAge.months !== null &&
              calculatedAge.months >= 4 &&
              calculatedAge.months <= 8 && (
                <span className="text-emerald-600 font-medium text-[11px]">
                  (оптимальный период для шлема)
                </span>
              )}
          </div>
        ) : null}
      </div>

      <Select
        label="Сторона заметок (левое/правое пациента)"
        value={side}
        onChange={(e) => setSide(e.target.value as PatientSide | "")}
      >
        <option value="">Не указана</option>
        <option value="left">Левая сторона (пациента)</option>
        <option value="right">Правая сторона (пациента)</option>
        <option value="both">Обе стороны</option>
      </Select>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-jude-ink">
          Клинические заметки
        </span>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Локализация уплощения (плагиоцефалия/брахицефалия), особенности позы..."
          className="rounded-xl border border-jude-border bg-jude-surface p-3 text-sm text-jude-ink placeholder-jude-muted shadow-jude transition-colors focus:border-jude-primary focus:outline-none focus:ring-1 focus:ring-jude-primary"
        />
      </label>

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
