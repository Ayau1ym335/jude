import {
  api,
  type PatientRead,
  type PatientCreate,
  type PatientListRead,
  type PatientSide,
} from "./api";

export type { PatientSide, PatientCreate };
export type Patient = PatientRead;
export type PatientListResponse = PatientListRead;

export const SIDE_LABELS: Record<PatientSide, string> = {
  left: "Левая (пациента)",
  right: "Правая (пациента)",
  both: "Обе стороны",
};

export function suggestPatientIdentifier(total: number): string {
  const year = new Date().getFullYear();
  return `P-${year}-${String(total + 1).padStart(4, "0")}`;
}

export function calculateInfantAge(birthDateStr?: string | null): {
  weeks: number | null;
  months: number | null;
  display: string | null;
} {
  if (!birthDateStr) return { weeks: null, months: null, display: null };
  const birth = new Date(birthDateStr);
  if (isNaN(birth.getTime())) return { weeks: null, months: null, display: null };
  const now = new Date();
  if (birth > now) return { weeks: 0, months: 0, display: "0 нед." };

  const diffMs = now.getTime() - birth.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const weeks = Math.floor(days / 7);

  let months =
    (now.getFullYear() - birth.getFullYear()) * 12 +
    (now.getMonth() - birth.getMonth());
  if (now.getDate() < birth.getDate()) {
    months -= 1;
  }
  if (months < 0) months = 0;

  const display =
    months >= 1 ? `${months} мес. (${weeks} нед.)` : `${weeks} нед.`;
  return { weeks, months, display };
}

export async function fetchPatients(
  accessToken: string,
  limit = 100,
): Promise<PatientListResponse> {
  return api.patients.list(accessToken, limit, 0);
}

export async function createPatient(
  accessToken: string,
  payload: {
    anonymized_identifier: string;
    birth_date?: string | null;
    side?: PatientSide | null;
    notes?: string | null;
  },
): Promise<Patient> {
  return api.patients.create(accessToken, {
    anonymized_identifier: payload.anonymized_identifier.trim(),
    birth_date: payload.birth_date || null,
    side: payload.side ?? null,
    notes: payload.notes?.trim() || null,
  });
}
