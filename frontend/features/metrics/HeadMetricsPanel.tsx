import type { MeasurementRead } from "@/lib/api";
import React from "react";
import type { ModelViewerHandle } from "@/components/ModelViewer";
import RawHeadMetricsPanel from "@/src/components/HeadMetricsPanel";

export interface HeadMetricsResponse {
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

export interface HeadMetricsPanelProps {
  viewerRef?: React.RefObject<ModelViewerHandle | null> | null;
  scanId: string;
  patientId?: string;
  accessToken?: string;
  hasLandmarks?: boolean;
  initialMetrics?: HeadMetricsResponse | null;
  embedded?: boolean;
  className?: string;
  onMetricsLoaded?: ((data: HeadMetricsResponse) => void) | null;
  onMeasurementSaved?: ((data: MeasurementRead) => void) | null;
}

export const HeadMetricsPanel: React.FC<HeadMetricsPanelProps> = RawHeadMetricsPanel as unknown as React.FC<HeadMetricsPanelProps>;
export default HeadMetricsPanel;
export * from "@/src/components/HeadMetricsPanel";
