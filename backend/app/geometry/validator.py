from pathlib import Path
from typing import Dict, Any, List
import trimesh

from .loader import load_mesh

def validate_mesh(filepath: str | Path) -> Dict[str, Any]:
    """
    Проверяет 3D-модель по ряду критериев.
    
    Args:
        filepath: Путь к файлу с мешем.
        
    Returns:
        Словарь с результатами проверки:
        {
            "valid": bool,
            "errors": List[str]
        }
    """
    errors: List[str] = []
    
    try:
        mesh = load_mesh(filepath)
    except Exception:
        return {
            "valid": False,
            "errors": ["INVALID_FORMAT"]
        }

    if mesh.is_empty:
        errors.append("EMPTY_MESH")
        return {
            "valid": False,
            "errors": errors
        }
    if not mesh.is_watertight:
        errors.append("NOT_WATERTIGHT")

    if not mesh.is_winding_consistent:
        errors.append("INVALID_NORMALS")
    try:
        components = mesh.split()
        if len(components) > 1:
            errors.append("MULTIPLE_COMPONENTS")
    except Exception:
        pass

    if len(mesh.faces) < 1000:
        errors.append("LOW_RESOLUTION")

    try:
        extents = mesh.bounding_box.extents
        max_extent = max(extents)
        
        # Если максимальный габарит меньше 50 мм (значит экспортировали в метрах: ~0.25)
        # или больше 5000 мм (слишком огромный)
        if max_extent < 50 or max_extent > 5000:
            errors.append("INVALID_SCALE")
    except Exception:
        pass

    return {
        "valid": len(errors) == 0,
        "errors": errors
    }
