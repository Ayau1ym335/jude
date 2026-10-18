import logging
from pathlib import Path
from typing import Any

from .loader import load_mesh

logger = logging.getLogger(__name__)

# Пороговые значения валидации 3D-скана
MIN_MESH_FACES: int = 1000
MIN_SCALE_MM: float = 50.0
MAX_SCALE_MM: float = 5000.0


def validate_mesh(filepath: str | Path) -> dict[str, Any]:
    """
    Проверяет 3D-модель по ряду критериев качества:
    - валидность формата и парсинг
    - пустота геометрии
    - замкнутость (watertightness)
    - согласованность нормалей (winding consistency)
    - отсутствие несвязных компонентов (multiple components)
    - минимальное разрешение полигональной сетки
    - адекватность масштаба (габариты в мм)

    Args:
        filepath: Путь к файлу с мешем.

    Returns:
        Словарь с результатами проверки:
        {
            "valid": bool,
            "errors": list[str]
        }
    """
    errors: list[str] = []

    try:
        mesh = load_mesh(filepath)
    except Exception as exc:
        logger.warning("Не удалось загрузить меш для валидации (%s): %s", filepath, exc)
        return {
            "valid": False,
            "errors": ["INVALID_FORMAT"],
        }

    if mesh.is_empty:
        errors.append("EMPTY_MESH")
        return {
            "valid": False,
            "errors": errors,
        }

    if not mesh.is_watertight:
        errors.append("NOT_WATERTIGHT")

    if not mesh.is_winding_consistent:
        errors.append("INVALID_NORMALS")

    try:
        components = mesh.split()
        if len(components) > 1:
            errors.append("MULTIPLE_COMPONENTS")
    except Exception as exc:
        logger.warning("Ошибка при анализе компонент связности меша: %s", exc)

    if len(mesh.faces) < MIN_MESH_FACES:
        errors.append("LOW_RESOLUTION")

    try:
        extents = mesh.bounding_box.extents
        max_extent = max(extents)

        # Если максимальный габарит меньше MIN_SCALE_MM (экспорт в метрах)
        # или больше MAX_SCALE_MM (слишком огромный)
        if max_extent < MIN_SCALE_MM or max_extent > MAX_SCALE_MM:
            errors.append("INVALID_SCALE")
    except Exception as exc:
        logger.warning("Ошибка при проверке масштаба bounding_box: %s", exc)

    return {
        "valid": len(errors) == 0,
        "errors": errors,
    }
