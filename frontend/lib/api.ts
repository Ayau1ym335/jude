/**
 * Centralized API client for Jude Cranial Helmets platform.
 */

/** Generic JSON response from the API - typed at call site or with eslint-disable where schema is dynamic */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiResponse = Record<string, any>;

const getApiUrl = (): string => {
  return process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
};

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({})) as ApiResponse;
    const message =
      (errorBody && (errorBody["detail"] || errorBody["message"])) ||
      `HTTP error ${response.status}: ${response.statusText}`;
    throw new Error(typeof message === "string" ? message : JSON.stringify(message));
  }
  return response.json() as Promise<T>;
}

function authHeaders(token?: string, extraHeaders?: HeadersInit): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  if (extraHeaders) {
    Object.assign(headers, extraHeaders);
  }
  return headers;
}

export type PatientSide = "left" | "right" | "both";

export interface PatientRead {
  id: string;
  clinic_id?: string | null;
  anonymized_identifier: string;
  birth_date?: string | null;
  side?: PatientSide | null;
  notes?: string | null;
  anthropometric_data?: Record<string, unknown> | null;
  age_weeks?: number | null;
  age_months?: number | null;
  age_display?: string | null;
  created_at: string;
}

export interface PatientCreate {
  anonymized_identifier: string;
  birth_date?: string | null;
  side?: PatientSide | null;
  notes?: string | null;
  clinic_id?: string | null;
  anthropometric_data?: Record<string, unknown> | null;
}

export interface PatientListRead {
  items: PatientRead[];
  total: number;
  limit: number;
  offset: number;
}

export interface ScanRead {
  id: string;
  patient_id: string;
  file_url: string;
  file_format?: string | null;
  validation_status?: string | null;
  validation_errors?: unknown | null;
  uploaded_at?: string | null;
}

export interface LandmarkRead {
  scan_id: string;
  nasion?: number[] | null;
  tragus_left?: number[] | null;
  tragus_right?: number[] | null;
  landmarks_data?: Record<string, unknown> | null;
}

export interface ProjectRead {
  id: string;
  patient_id: string;
  scan_id: string;
  afo_type?: string | null;
  helmet_type?: string | null;
  product_type?: string | null;
  status: "in_progress" | "exported" | "manufactured";
  current_step?: number | null;
  workflow_state?: Record<string, unknown> | null;
  scan_validation_status?: "pending" | "valid" | "invalid" | null;
  created_at: string;
}


export interface ProjectListRead {
  items: ProjectRead[];
  total: number;
  patient_id?: string | null;
}


export interface ProjectVersionRead {
  id: string;
  project_id: string;
  mesh_url: string;
  created_at?: string | null;
}

export interface TrimLineRead {
  id: string;
  version_id: string;
  line_type: string;
  geometry_data: unknown;
}

export interface HeadMetricsRead {
  slice_height_mm: number;
  width_mm: number;
  length_mm: number;
  cephalic_index: number;
  circumference_mm: number;
  diag_a_mm: number;
  diag_b_mm: number;
  diag_a_label: string;
  diag_b_label: string;
  diag_angle_deg: number;
  cva_mm: number;
  cvai_percent: number;
  longer_diagonal: string;
  shorter_diagonal: string;
  asymmetry_direction: string;
  diag_points: {
    center: number[];
    diag_a: number[][];
    diag_b: number[][];
  };
  contour: number[][];
}

export interface AsymmetryRead {
  distances: number[];
  mesh_url?: string | null;
}

export interface MeasurementRead {
  id: string;
  scan_id: string;
  patient_id: string;
  measured_at: string;
  slice_z?: number | null;
  width_mm?: number | null;
  length_mm?: number | null;
  cephalic_index?: number | null;
  circumference_mm?: number | null;
  diag_a_mm?: number | null;
  diag_b_mm?: number | null;
  cva_mm?: number | null;
  cvai_percent?: number | null;
  params?: Record<string, unknown> | null;
  algorithm_version?: string | null;
}

export interface MeasurementListRead {
  items: MeasurementRead[];
  total: number;
  limit: number;
  offset: number;
}

export interface MeasurementCreate {
  patient_id: string;
  slice_z?: number;
  width_mm?: number;
  length_mm?: number;
  cephalic_index?: number;
  circumference_mm?: number;
  diag_a_mm?: number;
  diag_b_mm?: number;
  cva_mm?: number;
  cvai_percent?: number;
  params?: Record<string, unknown>;
  algorithm_version?: string;
}

export const api = {
  patients: {
    async list(token: string, limit = 100, offset = 0) {
      const res = await fetch(
        `${getApiUrl()}/patients?limit=${limit}&offset=${offset}`,
        { headers: authHeaders(token) }
      );
      return handleResponse<PatientListRead>(res);
    },

    async get(token: string, id: string) {
      const res = await fetch(`${getApiUrl()}/patients/${id}`, {
        headers: authHeaders(token),
      });
      return handleResponse<PatientRead>(res);
    },

    async create(token: string, payload: PatientCreate) {
      const res = await fetch(`${getApiUrl()}/patients`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify(payload),
      });
      return handleResponse<PatientRead>(res);
    },
  },

  scans: {
    async get(token: string, id: string) {
      const res = await fetch(`${getApiUrl()}/scans/${id}`, {
        headers: authHeaders(token),
      });
      return handleResponse<ScanRead>(res);
    },

    async create(token: string, payload: { patient_id: string; file_url: string }) {
      const res = await fetch(`${getApiUrl()}/scans`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify(payload),
      });
      return handleResponse<ScanRead>(res);
    },

    async getLandmarks(token: string, scanId: string) {
      const res = await fetch(`${getApiUrl()}/scans/${scanId}/landmarks`, {
        headers: authHeaders(token),
      });
      return handleResponse<LandmarkRead>(res);
    },

    async saveLandmarks(
      token: string,
      scanId: string,
      payload: {
        nasion?: number[];
        tragus_left?: number[];
        tragus_right?: number[];
        landmarks_data?: Record<string, unknown>;
      }
    ) {
      const res = await fetch(`${getApiUrl()}/scans/${scanId}/landmarks`, {
        method: "PUT",
        headers: authHeaders(token),
        body: JSON.stringify(payload),
      });
      return handleResponse<LandmarkRead>(res);
    },
  },

  projects: {
    async list(token: string, patientId?: string) {
      const url = patientId
        ? `${getApiUrl()}/projects?patient_id=${patientId}`
        : `${getApiUrl()}/projects`;
      const res = await fetch(url, {
        headers: authHeaders(token),
      });
      return handleResponse<ProjectListRead>(res);
    },

    async get(token: string, id: string) {
      const res = await fetch(`${getApiUrl()}/projects/${id}`, {
        headers: authHeaders(token),
      });
      return handleResponse<ProjectRead>(res);
    },

    async create(
      token: string,
      payload: {
        patient_id: string;
        scan_id: string;
        afo_type?: string;
        helmet_type?: string;
        product_type?: string;
      }
    ) {
      const res = await fetch(`${getApiUrl()}/projects`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify(payload),
      });
      return handleResponse<ProjectRead>(res);
    },

    async versions(token: string, id: string) {
      const res = await fetch(`${getApiUrl()}/projects/${id}/versions`, {
        headers: authHeaders(token),
      });
      return handleResponse<ProjectVersionRead[]>(res);
    },

    async update(
      token: string,
      id: string,
      payload: {
        current_step?: number;
        workflow_state?: Record<string, unknown>;
        status?: string;
      }
    ) {
      const res = await fetch(`${getApiUrl()}/projects/${id}`, {
        method: "PATCH",
        headers: authHeaders(token),
        body: JSON.stringify(payload),
      });
      return handleResponse<ProjectRead>(res);
    },
  },



  geometry: {
    async computeHeadMetrics(
      token: string | undefined,
      payload: {
        scan_id: string;
        h_slice?: number;
        diag_angle_deg?: number;
        z_min?: number;
        z_max?: number;
        step?: number;
      }
    ) {
      const res = await fetch(`${getApiUrl()}/geometry/head-metrics`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify(payload),
      });
      return handleResponse<HeadMetricsRead>(res);
    },

    async computeAsymmetry(
      token: string | undefined,
      payload: { scan_id: string; max_distance_mm?: number }
    ) {
      const res = await fetch(`${getApiUrl()}/geometry/asymmetry`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify(payload),
      });
      return handleResponse<AsymmetryRead>(res);
    },

    async applySmoothing(
      token: string | undefined,
      payload: {
        scan_id: string;
        center_vertex_index: number;
        radius_mm?: number;
        intensity?: number;
        iterations?: number;
      }
    ) {
      const res = await fetch(`${getApiUrl()}/geometry/smooth-local`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify(payload),
      });
      return handleResponse<ScanRead>(res);
    },

    async computeGeodesicCurve(
      token: string | undefined,
      payload: { scan_id: string; landmark_points: number[][] }
    ) {
      const res = await fetch(`${getApiUrl()}/geometry/geodesic-curve`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify(payload),
      });
      return handleResponse<{ curve_points: number[][] }>(res);
    },
  },

  trimLines: {
    async save(
      token: string | undefined,
      payload: {
        project_version_id: string;
        line_type: string;
        points: number[][];
      }
    ) {
      const res = await fetch(`${getApiUrl()}/trim-lines`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify(payload),
      });
      return handleResponse<TrimLineRead>(res);
    },
  },

  measurements: {
    async save(token: string | undefined, scanId: string, payload: MeasurementCreate) {
      const res = await fetch(`${getApiUrl()}/scans/${scanId}/measurements`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify(payload),
      });
      return handleResponse<MeasurementRead>(res);
    },

    async listForPatient(
      token: string | undefined,
      patientId: string,
      limit = 50,
      offset = 0
    ) {
      const res = await fetch(
        `${getApiUrl()}/patients/${patientId}/measurements?limit=${limit}&offset=${offset}`,
        { headers: authHeaders(token) }
      );
      return handleResponse<MeasurementListRead>(res);
    },
  },
};

export default api;
