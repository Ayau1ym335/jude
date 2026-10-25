"""
Compatibility re-export module for app.geometry.validator.
"""

from app.services.geometry.validator import (
    MAX_SCALE_MM,
    MIN_MESH_FACES,
    MIN_SCALE_MM,
    validate_mesh,
)

__all__ = ["MAX_SCALE_MM", "MIN_MESH_FACES", "MIN_SCALE_MM", "validate_mesh"]
