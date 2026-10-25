"""
API routers package.
"""

from app.api.geometry import router as geometry_router
from app.api.head_measurements import (
    router_patients as head_meas_patients_router,
    router_scans as head_meas_scans_router,
)
from app.api.landmarks import router as landmarks_router
from app.api.patients import router as patient_router
from app.api.projects import router as project_router
from app.api.scans import router as scan_router
from app.api.trim_lines import router as trim_lines_router

__all__ = [
    "geometry_router",
    "head_meas_patients_router",
    "head_meas_scans_router",
    "landmarks_router",
    "patient_router",
    "project_router",
    "scan_router",
    "trim_lines_router",
]
