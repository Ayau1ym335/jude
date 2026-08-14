"""
backend/services/inversion.py

Инверсия mesh (негатив → позитив) и offset-операция (учёт толщины материала).

Используется для обработки сканов гипсовых слепков (scan_source == 'cast_negative'):
  1. Инверсия нормалей — превращает слепок-негатив в позитивную форму стопы.
  2. Offset — смещение поверхности на толщину материала ортеза.
  3. Детекция и исправление самопересечений — пост-обработка зон высокой кривизны
     (пятка, лодыжка), где наивный vertex-normal offset даёт некорректный результат.

Архитектурное решение (неделя 14, день 2):
  Вместо замены offset на voxel-based/Minkowski (архитектурно правильно, но ~2 недели)
  используется пост-обработка: детекция проблемных зон по отклонению point-to-surface
  distance от заданного offset_distance, затем локальное constrained smoothing именно
  в них. Корректные зоны не трогаются.

Ограничения:
  - В зонах экстремальной кривизны форма будет чуть отличаться от идеального
    параллельного смещения — допустимо для PLS AFO (техник всё равно ректифицирует).
  - tolerance=0.3 и порог warning 0.02 — эмпирические ориентиры, требуют калибровки
    по фидбеку пилотной клиники.
  - Если diagnostics["fixed"] == False после fix_offset_self_intersections —
    вызывающий код ДОЛЖЕН вернуть 422, не отдавать невалидный mesh молча.

Числовые константы (material_thickness=4.0 мм, smoothing_iterations=5):
  инженерные ориентиры, не клинически провалидированные значения.
"""

import logging
from typing import Any

import numpy as np
import trimesh

logger = logging.getLogger(__name__)


def invert_mesh_normals(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    """
    Инвертирует ориентацию нормалей mesh (позитив ↔ негатив).

    Использует trimesh.invert(), который разворачивает порядок вершин
    в каждом треугольнике (winding order) и пересчитывает нормали.

    Parameters
    ----------
    mesh : trimesh.Trimesh
        Входной mesh. Не модифицируется — возвращается копия.

    Returns
    -------
    trimesh.Trimesh
        Копия mesh с инвертированными нормалями.
    """
    inverted = mesh.copy()
    inverted.invert()
    return inverted


def offset_surface(
    mesh: trimesh.Trimesh,
    offset_distance: float,
) -> trimesh.Trimesh:
    """
    Смещает поверхность mesh вдоль vertex normals на заданное расстояние.

    ⚠️  Наивная реализация: vertex_normals * distance.
    Создаёт самопересечения в зонах, где локальный радиус кривизны
    меньше offset_distance. Используйте fix_offset_self_intersections()
    для пост-обработки.

    Parameters
    ----------
    mesh : trimesh.Trimesh
        Входной mesh. Не модифицируется — возвращается копия.
    offset_distance : float
        Расстояние смещения в единицах координат mesh (обычно мм).
        Положительное — наружу (по нормалям), отрицательное — внутрь.

    Returns
    -------
    trimesh.Trimesh
        Копия mesh со смещёнными вершинами.
    """
    offset_mesh = mesh.copy()
    vertex_normals = mesh.vertex_normals
    offset_mesh.vertices = mesh.vertices + vertex_normals * offset_distance
    return offset_mesh


def detect_problematic_offset_zones(
    original_mesh: trimesh.Trimesh,
    offset_mesh: trimesh.Trimesh,
    offset_distance: float,
    tolerance: float = 0.3,
) -> np.ndarray:
    """
    Детектирует вершины offset_mesh, где offset дал некорректный результат.

    Принцип (специфичен для задачи — проще и надёжнее общей collision-детекции):
    В зоне корректного offset расстояние от новой поверхности до оригинальной
    должно быть ≈ offset_distance везде. Если фактическое расстояние
    существенно меньше — в этой зоне поверхность "схлопнулась" из-за высокой
    кривизны оригинала (что и вызывает самопересечение).

    Тот же диагностический принцип, что compute_falloff_weights в сглаживании:
    point-to-surface distance как сигнал о проблемной зоне.

    Parameters
    ----------
    original_mesh : trimesh.Trimesh
        Оригинальный mesh ДО offset (инвертированный, но до смещения).
    offset_mesh : trimesh.Trimesh
        Результат offset_surface().
    offset_distance : float
        Заданное расстояние смещения.
    tolerance : float
        Порог отклонения [0, 1]. 0.3 = 30%: вершины, у которых расстояние
        до оригинала < offset_distance * (1 - tolerance), считаются
        проблемными. Эмпирический ориентир, требует калибровки.

    Returns
    -------
    np.ndarray
        Boolean массив формы (N,). True = проблемная вершина.
    """
    _, distances, _ = original_mesh.nearest.on_surface(offset_mesh.vertices)

    threshold = offset_distance * (1.0 - tolerance)
    problematic: np.ndarray = distances < threshold
    return problematic


def fix_offset_self_intersections(
    offset_mesh: trimesh.Trimesh,
    original_mesh: trimesh.Trimesh,
    offset_distance: float,
    tolerance: float = 0.3,
    smoothing_iterations: int = 5,
) -> tuple[trimesh.Trimesh, dict[str, Any]]:
    """
    Исправляет проблемные зоны offset-результата через локальное constrained smoothing.

    Сглаживание применяется ТОЛЬКО к вершинам, где offset не дал корректного
    результата (problematic_mask == True). Корректные зоны не трогаются.

    Parameters
    ----------
    offset_mesh : trimesh.Trimesh
        Результат offset_surface().
    original_mesh : trimesh.Trimesh
        Оригинальный mesh ДО offset (для детекции проблемных зон).
    offset_distance : float
        Заданное расстояние смещения.
    tolerance : float
        Порог для detect_problematic_offset_zones (см. её docstring).
    smoothing_iterations : int
        Число итераций локального сглаживания. 5 — эмпирический ориентир.

    Returns
    -------
    tuple[trimesh.Trimesh, dict]
        (исправленный mesh, диагностика).
        Диагностика ОБЯЗАТЕЛЬНО должна попадать в лог/ответ API, не теряться молча.

        Ключи diagnostics:
          - total_vertices: int
          - problematic_vertices: int — до исправления
          - problematic_ratio: float — доля проблемных вершин [0, 1]
          - problematic_vertices_after: int — после исправления
          - fixed: bool — True если после исправления проблем < 50% от исходных
    """
    problematic_mask = detect_problematic_offset_zones(
        original_mesh, offset_mesh, offset_distance, tolerance
    )
    problematic_count = int(problematic_mask.sum())
    total = len(offset_mesh.vertices)

    diagnostics: dict[str, Any] = {
        "total_vertices": total,
        "problematic_vertices": problematic_count,
        "problematic_ratio": float(problematic_count / total) if total > 0 else 0.0,
        "problematic_vertices_after": problematic_count,
        "fixed": problematic_count == 0,
    }

    if problematic_count == 0:
        logger.info("fix_offset_self_intersections: no problematic zones detected.")
        return offset_mesh, diagnostics

    logger.warning(
        "fix_offset_self_intersections: %d/%d vertices (%.1f%%) in problematic zones. "
        "Applying local constrained smoothing.",
        problematic_count, total, diagnostics["problematic_ratio"] * 100,
    )

    fixed_mesh = offset_mesh.copy()

    # ── Векторизованное сглаживание через scipy.sparse (COO, без Python-циклов) ──
    # Строим averaging-матрицу через edges_unique mesh:
    # Для каждой проблемной вершины i строка матрицы = 1/degree(i) для соседей.
    # Для остальных — строка identity (не трогаем).
    # Все операции — numpy, без Python-циклов по вершинам.
    try:
        from scipy.sparse import coo_matrix, eye as speye

        n = len(offset_mesh.vertices)
        edges = offset_mesh.edges_unique           # (E, 2) — пары вершин без дубликатов
        # Дублируем в обе стороны: (i→j) и (j→i)
        rows = np.concatenate([edges[:, 0], edges[:, 1]])
        cols = np.concatenate([edges[:, 1], edges[:, 0]])

        # Degree каждой вершины (число соседей)
        degree = np.bincount(rows, minlength=n).astype(float)
        degree_safe = np.where(degree > 0, degree, 1.0)  # избегаем деления на 0

        # Веса рёбер: 1/degree[i] для вершины i
        edge_weights = 1.0 / degree_safe[rows]

        # Строим averaging-матрицу A_full (все вершины → average соседей)
        A_full = coo_matrix((edge_weights, (rows, cols)), shape=(n, n)).tocsr()

        # Применяем только к проблемным строкам: смешиваем identity и A_full
        # результирующая матрица: A[i] = A_full[i] если i probl., else I[i]
        mask_float = problematic_mask.astype(float)          # (N,) 0 или 1
        I = speye(n, format="csr")
        # A = diag(mask) @ A_full + diag(1-mask) @ I
        # Без явного diag-умножения: просто умножаем строки через broadcasting
        from scipy.sparse import diags
        D_prob = diags(mask_float, format="csr")
        D_keep = diags(1.0 - mask_float, format="csr")
        A = D_prob @ A_full + D_keep @ I

        verts = fixed_mesh.vertices.copy()
        for _ in range(smoothing_iterations):
            verts = A @ verts
        fixed_mesh.vertices = verts

    except ImportError:
        # Fallback: медленный Python-цикл если scipy недоступен
        logger.warning("scipy not available — using slow Python loop for smoothing.")
        adjacency = offset_mesh.vertex_neighbors
        problematic_indices = np.where(problematic_mask)[0]
        for _ in range(smoothing_iterations):
            new_vertices = fixed_mesh.vertices.copy()
            for vidx in problematic_indices:
                neighbors = adjacency[vidx]
                if len(neighbors) == 0:
                    continue
                new_vertices[vidx] = fixed_mesh.vertices[neighbors].mean(axis=0)
            fixed_mesh.vertices = new_vertices

    # Финальная проверка (одна, не в цикле)
    remaining_mask = detect_problematic_offset_zones(
        original_mesh, fixed_mesh, offset_distance, tolerance
    )
    remaining_count = int(remaining_mask.sum())
    diagnostics["problematic_vertices_after"] = remaining_count
    diagnostics["fixed"] = remaining_count < problematic_count * 0.5

    logger.info(
        "fix_offset_self_intersections done: %d -> %d problematic vertices (fixed=%s).",
        problematic_count, remaining_count, diagnostics["fixed"],
    )
    return fixed_mesh, diagnostics




def apply_cast_inversion_workflow(
    mesh: trimesh.Trimesh,
    material_thickness: float = 4.0,
    smoothing_iterations: int = 5,
    tolerance: float = 0.3,
) -> tuple[trimesh.Trimesh, dict[str, Any]]:
    """
    Полный workflow для скана гипсового слепка (негатива):
      1. Инверсия нормалей (негатив → позитив)
      2. Offset на толщину материала
      3. Детекция и исправление самопересечений в зонах высокой кривизны

    Parameters
    ----------
    mesh : trimesh.Trimesh
        Скан слепка (негатив). Не модифицируется.
    material_thickness : float
        Толщина материала ортеза (мм). 4.0 мм — инженерный ориентир,
        не клинически провалидированная константа.
    smoothing_iterations : int
        Передаётся в fix_offset_self_intersections.
    tolerance : float
        Передаётся в detect_problematic_offset_zones.

    Returns
    -------
    tuple[trimesh.Trimesh, dict]
        (результирующий mesh, диагностика исправления).

        ⚠️  Вызывающий код ОБЯЗАН:
          1. Логировать diagnostics.
          2. Если diagnostics["fixed"] == False AND
             diagnostics["problematic_ratio"] > 0.05 — вернуть HTTP 422,
             не отдавать невалидный mesh молча.
    """
    inverted = invert_mesh_normals(mesh)
    offset_result = offset_surface(inverted, material_thickness)
    fixed_mesh, diagnostics = fix_offset_self_intersections(
        offset_result,
        original_mesh=inverted,
        offset_distance=material_thickness,
        tolerance=tolerance,
        smoothing_iterations=smoothing_iterations,
    )
    return fixed_mesh, diagnostics
