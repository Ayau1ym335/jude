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

export async function fetchPatients(
  accessToken: string,
  limit = 100,
): Promise<PatientListResponse> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) throw new Error("NEXT_PUBLIC_API_URL не настроен");

  const response = await fetch(`${apiUrl}/patients?limit=${limit}&offset=0`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Ошибка загрузки пациентов (${response.status})`);
  }

  return (await response.json()) as PatientListResponse;
}

export async function createPatient(
  accessToken: string,
  payload: {
    anonymized_identifier: string;
    side?: PatientSide | null;
  },
): Promise<Patient> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) throw new Error("NEXT_PUBLIC_API_URL не настроен");

  const response = await fetch(`${apiUrl}/patients`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      anonymized_identifier: payload.anonymized_identifier.trim(),
      side: payload.side ?? null,
    }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { detail?: string };
    throw new Error(body.detail ?? `Ошибка создания пациента (${response.status})`);
  }

  return (await response.json()) as Patient;
}
