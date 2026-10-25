"""
Compatibility re-export module for app.geometry.loader.
Loads mesh using unified app.services.mesh_loader.
"""

from app.services.mesh_loader import SUPPORTED_EXTENSIONS, load_mesh

__all__ = ["SUPPORTED_EXTENSIONS", "load_mesh"]
