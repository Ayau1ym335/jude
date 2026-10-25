"""
Geometry services for 3D meshes (validation, preview generation, messages).
"""

from .validator import validate_mesh, MIN_MESH_FACES, MIN_SCALE_MM, MAX_SCALE_MM
from .preview import create_preview_mesh
from .messages import VALIDATION_MESSAGES

__all__ = [
    "validate_mesh",
    "MIN_MESH_FACES",
    "MIN_SCALE_MM",
    "MAX_SCALE_MM",
    "create_preview_mesh",
    "VALIDATION_MESSAGES",
]
