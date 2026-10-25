import React from "react";
import RawHeadSectionView from "@/src/components/HeadSectionView";

export interface HeadSectionViewProps {
  contour?: number[][];
  diagPoints?: {
    center?: number[];
    diag_a?: number[][];
    diag_b?: number[][];
  } | null;
  diagAMm?: number | null;
  diagBMm?: number | null;
  diagALabel?: string;
  diagBLabel?: string;
  longerDiagonal?: string | null;
  shorterDiagonal?: string | null;
  sliceHeightMm?: number | null;
  showGrid?: boolean;
  showAxes?: boolean;
  showDiagonals?: boolean;
  width?: number;
  height?: number;
  className?: string;
}

export const HeadSectionView: React.FC<HeadSectionViewProps> = RawHeadSectionView as unknown as React.FC<HeadSectionViewProps>;
export default HeadSectionView;
export * from "@/src/components/HeadSectionView";
