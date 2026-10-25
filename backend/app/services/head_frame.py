"""
Система координат головы (head frame).

Клиническая логика привязана к ориентирам (нос, уши), а не к произвольным
осям скана. Этот модуль строит правую ортонормированную систему координат,
определённую по трём анатомическим точкам:
  - nasion (насион): кончик носа или точка переносицы
  - tragus_left / tragus_right: козелки левого и правого уха
"""

import warnings
import numpy as np
from numpy.typing import ArrayLike


# ---------------------------------------------------------------------------
# Основной построитель системы координат
# ---------------------------------------------------------------------------


def build_head_frame(
    nasion: ArrayLike,
    tragus_left: ArrayLike,
    tragus_right: ArrayLike,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Строит систему координат головы по трём анатомическим ориентирам.

    Возвращает (origin, R):
      - origin: середина между козелками (np.ndarray, shape (3,))
      - R: матрица 3×3, строки = оси головы (np.ndarray, shape (3, 3)):
          R[0] = ex — вправо (от левого козелка к правому)
          R[1] = ey — вперёд (к носу, ортогонализован относительно ex)
          R[2] = ez — вверх (ex × ey)

    Все векторы нормированы. Система правая.

    Raises:
        ValueError: если три точки почти коллинеарны (ось «вперёд» не определена).
    """
    n = np.asarray(nasion, dtype=float)
    tl = np.asarray(tragus_left, dtype=float)
    tr = np.asarray(tragus_right, dtype=float)

    if n.shape != (3,) or tl.shape != (3,) or tr.shape != (3,):
        raise ValueError("Каждая точка должна быть массивом из 3 координат [x, y, z].")

    origin = (tl + tr) / 2.0

    # ось вправо: от левого козелка к правому
    ex = tr - tl
    ex_norm = np.linalg.norm(ex)
    if ex_norm < 1e-6:
        raise ValueError(
            "Левый и правый козелки находятся в одной точке — "
            "невозможно определить ось вправо."
        )
    ex = ex / ex_norm

    # ось вперёд: от origin к носу, ортогонализована относительно ex
    ey = n - origin
    ey -= ex * np.dot(ey, ex)  # проекция Грама–Шмидта
    ey_norm = np.linalg.norm(ey)
    if ey_norm < 1e-6:
        raise ValueError(
            "Ориентиры лежат на одной линии — ось «вперёд» не определена. "
            "Проверьте, что насион не совпадает с серединой козелков."
        )
    ey = ey / ey_norm

    # ось вверх: правое произведение (правая СК)
    ez = np.cross(ex, ey)
    # ez уже нормирован, так как ex и ey единичные и ортогональные

    R = np.stack([ex, ey, ez])  # shape (3, 3)
    return origin, R


def to_head_frame(
    vertices: ArrayLike,
    origin: np.ndarray,
    R: np.ndarray,
) -> np.ndarray:
    """
    Переводит вершины из системы скана в систему координат головы.

    Args:
        vertices: массив вершин, shape (N, 3).
        origin:   начало СК головы, shape (3,).
        R:        матрица поворота 3×3 (строки = оси головы).

    Returns:
        np.ndarray, shape (N, 3) — координаты в СК головы.
    """
    v = np.asarray(vertices, dtype=float)
    return (v - origin) @ R.T


# ---------------------------------------------------------------------------
# PCA-автооценка ориентиров (запасной вариант, низкая точность)
# ---------------------------------------------------------------------------


def estimate_landmarks_pca(mesh) -> dict:
    """
    Грубая оценка осей головы через PCA облака вершин.

    ⚠️  LOW CONFIDENCE — только запасной вариант.
    PCA находит три главных оси по разбросу вершин:
      - наибольшая ось (PC1) соответствует длине головы,
      - средняя (PC2) — ширине,
      - наименьшая (PC3) — высоте.

    ВНИМАНИЕ: PCA не может различить «нос» от «затылка» — направление
    по PC1 неоднозначно. Результат ОБЯЗАТЕЛЬНО должен быть подтверждён
    врачом вручную перед клиническим использованием.

    Args:
        mesh: объект trimesh.Trimesh.

    Returns:
        dict со следующими ключами:
          - "origin": центр масс облака вершин [x, y, z]
          - "R": матрица 3×3, строки = оси (только геометрические, без клинической привязки)
          - "low_confidence": True (всегда)
          - "warning": текстовое предупреждение для отображения врачу
    """
    vertices = np.asarray(mesh.vertices, dtype=float)

    # Центрирование
    origin = vertices.mean(axis=0)
    centered = vertices - origin

    # SVD как PCA (устойчивее для больших матриц)
    _, _, Vt = np.linalg.svd(centered, full_matrices=False)
    # Vt: строки = главные компоненты в порядке убывания дисперсии
    R_pca = Vt  # shape (3, 3), строки = PC1, PC2, PC3

    # Убеждаемся, что система правая
    if np.linalg.det(R_pca) < 0:
        R_pca[2] = -R_pca[2]

    warning_text = (
        "⚠️  Оси получены методом PCA (автооценка, низкая достоверность). "
        "PCA не различает 'нос' и 'затылок': направление главной оси может быть "
        "перевёрнуто. Обязательно подтвердите ориентацию вручную, расставив "
        "анатомические ориентиры (насион и козелки) перед клиническим использованием."
    )
    warnings.warn(warning_text, UserWarning, stacklevel=2)

    return {
        "origin": origin.tolist(),
        "R": R_pca.tolist(),
        "low_confidence": True,
        "warning": warning_text,
    }
