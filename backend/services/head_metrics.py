"""
Compatibility proxy module for backend/services/head_metrics.py.
Exports all functions and constants from app.services.head_metrics.
"""

from app.services.head_metrics import (
    DEFAULT_Z_MIN_MM,
    DEFAULT_Z_MAX_MM,
    DEFAULT_STEP_MM,
    CI_DOLICHO_MAX,
    CI_BRACHY_MIN,
    contour_perimeter,
    cross_section,
    best_slice_height,
    cephalic_index,
    compute_head_metrics,
)

__all__ = [
    "DEFAULT_Z_MIN_MM",
    "DEFAULT_Z_MAX_MM",
    "DEFAULT_STEP_MM",
    "CI_DOLICHO_MAX",
    "CI_BRACHY_MIN",
    "contour_perimeter",
    "cross_section",
    "best_slice_height",
    "cephalic_index",
    "compute_head_metrics",
]
