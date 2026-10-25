import React from "react";
import RawHeadDynamicsChart from "@/src/components/HeadDynamicsChart";

export interface HeadMeasurementItem {
  id: string;
  scan_id?: string;
  patient_id?: string;
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

export interface HeadDynamicsChartProps {
  measurements?: HeadMeasurementItem[];
  patientId?: string;
  accessToken?: string;
  className?: string;
  onSelectVisit?: ((item: HeadMeasurementItem) => void) | null;
}

export const HeadDynamicsChart: React.FC<HeadDynamicsChartProps> =
  RawHeadDynamicsChart as unknown as React.FC<HeadDynamicsChartProps>;

export default HeadDynamicsChart;
export * from "@/src/components/HeadDynamicsChart";
