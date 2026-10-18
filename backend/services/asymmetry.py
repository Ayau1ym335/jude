"""
Карта асимметрии головы.

Для каждой вершины mesh вычисляет подписанное расстояние до
зеркального отражения поверхности относительно срединно-сагиттальной
плоскости (x = 0 в системе координат головы).

Знак:
  + > 0: вершина выступает наружу относительно зеркального отражения
           (левая сторона больше правой — выпуклость).
  - < 0: вершина вдавлена относительно зеркального отражения
           (плоская / уплощённая зона).

Зачем переворачивать грани при отражении:
  Отражение x → -x меняет ориентацию граней (правосторонняя система
  координат превращается в левостороннюю). Если не перевернуть порядок
  вершин в гранях (faces[:, ::-1]), нормали отражённой модели будут
  смотреть внутрь, а не наружу. Это приведёт к неверным знакам
  подписанного расстояния (потому что closest.on_surface использует
  нормали граней для определения, с какой стороны находится точка).
"""

import numpy as np
import trimesh
from numpy.typing import NDArray

from services.head_frame import build_head_frame, to_head_frame

# ─── Клинический порог (уточнить у клиники) ──────────────────────────────────
# 3 мм — инженерный ориентир для краниальных ортезов.
# Для расчёта CVA/CVAI используется другой подход; этот порог — сугубо
# для цветовой карты на экране. Подтвердить у клиники перед релизом.
ASYMMETRY_THRESHOLD_MM: float = 3.0


def asymmetry_map(
    mesh: trimesh.Trimesh,
    origin: np.ndarray,
    R: np.ndarray,
) -> NDArray[np.float64]:
    """
    Возвращает подписанное расстояние (мм) до отражённой поверхности
    для каждой вершины mesh.

    Алгоритм:
      1. Переводим вершины в систему координат головы.
      2. Зеркалим по плоскости x = 0: mirrored[:, 0] *= -1.
      3. Строим отражённый mesh с перевёрнутыми гранями (faces[:, ::-1]),
         чтобы нормали смотрели наружу (см. комментарий к модулю).
      4. Для каждой вершины головы находим ближайшую точку на отражении.
      5. Знак = проекция вектора (вершина → ближайшая) на нормаль вершины:
         > 0 — вершина выступает наружу, < 0 — вдавлена.

    Args:
        mesh:   загруженный trimesh.Trimesh (в исходной СК скана).
        origin: начало СК головы, shape (3,).
        R:      матрица поворота 3×3 (строки = оси головы).

    Returns:
        NDArray shape (N,), N = len(mesh.vertices), значения в мм.
    """
    # 1. Переводим в СК головы
    v_head: NDArray[np.float64] = to_head_frame(mesh.vertices, origin, R)

    # 2. Зеркальное отражение (x → -x)
    mirrored = v_head.copy()
    mirrored[:, 0] *= -1

    # 3. Отражённый mesh.
    #    faces[:, ::-1] — разворот порядка вершин в гранях:
    #    без этого нормали отражённой сетки смотрели бы внутрь и знак асимметрии
    #    был бы инвертирован (подробнее — в docstring модуля).
    head_mesh = trimesh.Trimesh(vertices=v_head, faces=mesh.faces, process=False)
    mirror_mesh = trimesh.Trimesh(
        vertices=mirrored,
        faces=mesh.faces[:, ::-1],
        process=False,
    )

    # 4. Ближайшая точка на отражённой поверхности
    closest, dist, _tri = mirror_mesh.nearest.on_surface(v_head)

    # 5. Подписанное расстояние через проекцию на нормаль вершины
    normals: NDArray[np.float64] = head_mesh.vertex_normals
    direction = np.einsum("ij,ij->i", v_head - closest, normals)
    signed_dist: NDArray[np.float64] = np.sign(direction) * dist

    return signed_dist


def asymmetry_metrics(
    signed_dist: NDArray[np.float64],
    threshold_mm: float = ASYMMETRY_THRESHOLD_MM,
) -> dict:
    """
    Вычисляет сводные метрики асимметрии по массиву подписанных расстояний.

    Args:
        signed_dist:    результат asymmetry_map(), shape (N,).
        threshold_mm:   порог «клинически значимой» асимметрии.
                        По умолчанию 3 мм — уточнить у клиники.

    Returns:
        {
          "min":                  float,   # минимальное подписанное значение
          "max":                  float,   # максимальное подписанное значение
          "mean_abs":             float,   # средняя абсолютная асимметрия
          "percent_over_threshold": float, # % вершин с |δ| > threshold_mm
          "threshold_mm":        float,   # использованный порог
        }
    """
    abs_dist = np.abs(signed_dist)
    over = float((abs_dist > threshold_mm).mean() * 100.0)

    return {
        "min": float(signed_dist.min()),
        "max": float(signed_dist.max()),
        "mean_abs": float(abs_dist.mean()),
        "percent_over_threshold": over,
        "threshold_mm": threshold_mm,
    }


def compute_asymmetry(
    mesh: trimesh.Trimesh,
    nasion: list[float],
    tragus_left: list[float],
    tragus_right: list[float],
    threshold_mm: float = ASYMMETRY_THRESHOLD_MM,
) -> dict:
    """
    Полный расчёт карты асимметрии по ориентирам.

    Удобная обёртка: строит СК, считает карту и метрики.

    Returns:
        {
          "values":               list[float],  # по вершинам, мм
          "min":                  float,
          "max":                  float,
          "mean_abs":             float,
          "percent_over_threshold": float,
          "threshold_mm":        float,
        }
    """
    origin, R = build_head_frame(
        nasion=nasion,
        tragus_left=tragus_left,
        tragus_right=tragus_right,
    )
    signed_dist = asymmetry_map(mesh, origin, R)
    metrics = asymmetry_metrics(signed_dist, threshold_mm)

    return {
        "values": signed_dist.tolist(),
        **metrics,
    }
