export type PatientSide = "left" | "right" | "both";

export interface Patient {
  id: string;
  anonymized_identifier: string;
  side: PatientSide | null;
  created_at: string;
}

export interface PatientListResponse {
  items: Patient[];
  total: number;
  limit: number;
  offset: number;
}

export const SIDE_LABELS: Record<PatientSide, string> = {
  left: "Левая",
  right: "Правая",
  both: "Обе",
};

export function suggestPatientIdentifier(total: number): string {
  const year = new Date().getFullYear();
  return `P-${year}-${String(total + 1).padStart(4, "0")}`;
}

import { api } from "./api";

export async function fetchPatients(
  accessToken: string,
  limit = 100,
): Promise<PatientListResponse> {
  return api.patients.list(accessToken, limit, 0) as Promise<PatientListResponse>;
}

export async function createPatient(
  accessToken: string,
  payload: {
    anonymized_identifier: string;
    side?: PatientSide | null;
  },
): Promise<Patient> {
  return api.patients.create(accessToken, {
    anonymized_identifier: payload.anonymized_identifier.trim(),
    side: payload.side ?? null,
  }) as Promise<Patient>;
}
