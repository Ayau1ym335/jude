/**
 * Centralized API client for Jude Cranial Helmets platform.
 */

const getApiUrl = (): string => {
  return process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
};

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message =
      (errorBody && (errorBody.detail || errorBody.message)) ||
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

export const api = {
  patients: {
    async list(token: string, limit = 100, offset = 0) {
      const res = await fetch(
        `${getApiUrl()}/patients?limit=${limit}&offset=${offset}`,
        { headers: authHeaders(token) }
      );
      return handleResponse<{
        items: Array<{
          id: string;
          anonymized_identifier: string;
          side: string | null;
          created_at: string;
        }>;
        total: number;
        limit: number;
        offset: number;
      }>(res);
    },

    async get(token: string, id: string) {
      const res = await fetch(`${getApiUrl()}/patients/${id}`, {
        headers: authHeaders(token),
      });
      return handleResponse<{
        id: string;
        anonymized_identifier: string;
        side: string | null;
        created_at: string;
      }>(res);
    },

    async create(
      token: string,
      payload: { anonymized_identifier: string; side?: string | null }
    ) {
      const res = await fetch(`${getApiUrl()}/patients`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify(payload),
      });
      return handleResponse<{
        id: string;
        anonymized_identifier: string;
        side: string | null;
        created_at: string;
      }>(res);
    },
  },

  scans: {
    async get(token: string, id: string) {
      const res = await fetch(`${getApiUrl()}/scans/${id}`, {
        headers: authHeaders(token),
      });
      return handleResponse<any>(res);
    },

    async create(token: string, payload: { patient_id: string; file_url: string }) {
      const res = await fetch(`${getApiUrl()}/scans`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify(payload),
      });
      return handleResponse<any>(res);
    },

    async getLandmarks(token: string, scanId: string) {
      const res = await fetch(`${getApiUrl()}/scans/${scanId}/landmarks`, {
        headers: authHeaders(token),
      });
      return handleResponse<any>(res);
    },

    async saveLandmarks(
      token: string,
      scanId: string,
      payload: {
        nasion?: number[];
        tragus_left?: number[];
        tragus_right?: number[];
        landmarks_data?: Record<string, any>;
      }
    ) {
      const res = await fetch(`${getApiUrl()}/scans/${scanId}/landmarks`, {
        method: "PUT",
        headers: authHeaders(token),
        body: JSON.stringify(payload),
      });
      return handleResponse<any>(res);
    },
  },

  projects: {
    async get(token: string, id: string) {
      const res = await fetch(`${getApiUrl()}/projects/${id}`, {
        headers: authHeaders(token),
      });
      return handleResponse<any>(res);
    },

    async create(
      token: string,
      payload: {
        patient_id: string;
        scan_id: string;
        afo_type?: string;
        product_type?: string;
      }
    ) {
      const res = await fetch(`${getApiUrl()}/projects`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify(payload),
      });
      return handleResponse<any>(res);
    },

    async versions(token: string, id: string) {
      const res = await fetch(`${getApiUrl()}/projects/${id}/versions`, {
        headers: authHeaders(token),
      });
      return handleResponse<any[]>(res);
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
      return handleResponse<any>(res);
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
      return handleResponse<any>(res);
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
      return handleResponse<any>(res);
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
      return handleResponse<any>(res);
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
      return handleResponse<any>(res);
    },
  },

  measurements: {
    async save(token: string | undefined, scanId: string, payload: any) {
      const res = await fetch(`${getApiUrl()}/scans/${scanId}/measurements`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify(payload),
      });
      return handleResponse<any>(res);
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
      return handleResponse<any>(res);
    },
  },
};

export default api;
