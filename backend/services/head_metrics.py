"""
Compatibility proxy module for backend/services/head_metrics.py.
Exports all functions and constants from app.services.head_metrics.
"""

from app.services.head_metrics import (
    DEFAULT_Z_MIN_MM,
    DEFAULT_Z_MAX_MM,
    DEFAULT_STEP_MM,
    DEFAULT_DIAG_ANGLE_DEG,
    CI_TENTATIVE_REFERENCE,
    CVAI_TENTATIVE_REFERENCE,
    contour_perimeter,
    cross_section,
    best_slice_height,
    cephalic_index,
    diagonals,
    cvai,
    determine_asymmetry_direction,
    compute_head_metrics,
)

__all__ = [
    "DEFAULT_Z_MIN_MM",
    "DEFAULT_Z_MAX_MM",
    "DEFAULT_STEP_MM",
    "DEFAULT_DIAG_ANGLE_DEG",
    "CI_TENTATIVE_REFERENCE",
    "CVAI_TENTATIVE_REFERENCE",
    "contour_perimeter",
    "cross_section",
    "best_slice_height",
    "cephalic_index",
    "diagonals",
    "cvai",
    "determine_asymmetry_direction",
    "compute_head_metrics",
]
