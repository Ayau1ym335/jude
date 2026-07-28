"""
backend/services/local_smoothing.py

Локальное сглаживание mesh с весами на основе геодезических расстояний.

Используется для улучшения поверхности ортеза в зоне лодыжки и других
анатомически важных областях после автоматической обрезки.

Примечания по реализации (Пересмотр Мера День 3):
- pygeodesic (MIT/BSD): алгоритм Кимелла-Сетяна. Лицензионно чист.
- compute_falloff_weights: базовая, PyGeodesicAlgorithmExact на весь mesh.
- compute_falloff_weights_optimized (День 3): евклидов префильтр +
  построение submesh (переиндексация граней) + PyGeodesicAlgorithmExact только на нём.
- Кэш PyGeodesicAlgorithmExact на уровне submesh не даёт выгоды: submesh
  меняется при каждом новом center_vertex_idx, инвалидация кэша
  свела бы выгоду к нулю. Зафиксировано, не реализовано. 
- apply_local_laplacian_smoothing: повершинная итерация с взвешенным
  смещением (intensity * weight[v]) для плавного затухания.
- Числа-константы (radius=15 мм): стартовые инженерные ориентиры, не
  клинически провалидированные значения. Требуют калибровки.
"""

import numpy as np
import trimesh
import trimesh.smoothing
from pygeodesic import geodesic


def compute_falloff_weights(
    mesh: trimesh.Trimesh,
    center_vertex_idx: int,
    radius: float,
) -> np.ndarray:
    """
    Вычисляет вес влияния сглаживания для каждой вершины mesh на основе
    геодезического расстояния от центральной точки, с линейным затуханием
    до нуля на границе radius.

    Parameters
    ----------
    mesh : trimesh.Trimesh
        Входной mesh. Должен быть валидным (connected, не вырожденным).
    center_vertex_idx : int
        Индекс вершины — центр зоны сглаживания.
        Должен быть в диапазоне [0, len(mesh.vertices)).
    radius : float
        Радиус зоны влияния в тех же единицах, что координаты mesh
        (обычно мм для клинических сканов). Вершины за пределами
        radius получают вес 0.0 и не будут сглажены.

    Returns
    -------
    np.ndarray, shape (N,), dtype float64
        Массив весов в диапазоне [0.0, 1.0] для каждой из N вершин.
        Вес 1.0 — у центральной точки, линейно убывает до 0.0 на radius.

    Raises
    ------
    IndexError
        Если center_vertex_idx выходит за пределы допустимого диапазона.
    ValueError
        Если radius <= 0.

    Notes
    -----
    Время выполнения на icosphere(subdivisions=5, ~10k вершин): ~0.1–0.3 сек.
    На клинических сканах высокого разрешения (>100k вершин) возможно > 3 сек —
    в этом случае рекомендуется передавать упрощённый preview mesh.
    """
    if not (0 <= center_vertex_idx < len(mesh.vertices)):
        raise IndexError(
            f"center_vertex_idx={center_vertex_idx} вне диапазона "
            f"[0, {len(mesh.vertices)})"
        )
    if radius <= 0:
        raise ValueError(f"radius должен быть > 0, получено: {radius}")

    # Инициализируем алгоритм точных геодезических расстояний
    # (алгоритм Кимелла-Сетяна, O(N log N))
    geoalg = geodesic.PyGeodesicAlgorithmExact(mesh.vertices, mesh.faces)

    source_indices = np.array([center_vertex_idx])
    # geodesicDistances(source_indices, target_indices=None) → (distances, nearest_source)
    # target_indices=None означает «до всех вершин»
    distances, _ = geoalg.geodesicDistances(source_indices, None)

    # Линейное затухание: weight = max(0, 1 - dist / radius)
    weights = np.clip(1.0 - (distances / radius), 0.0, 1.0)
    return weights


def apply_local_smoothing(
    mesh: trimesh.Trimesh,
    center_vertex_idx: int,
    radius: float = 15.0,
    iterations: int = 5,
    lamb: float = 0.5,
) -> trimesh.Trimesh:
    """
    Применяет локальное Лапласово сглаживание к mesh в зоне вокруг
    указанной вершины. Вершины вне зоны влияния (weight == 0) заморожены.

    Parameters
    ----------
    mesh : trimesh.Trimesh
        Входной mesh. Изменения вносятся в копию — оригинал не модифицируется.
    center_vertex_idx : int
        Центр зоны сглаживания (индекс вершины).
    radius : float
        Радиус зоны влияния в единицах координат mesh (обычно мм).
        Стартовое значение 15 мм — инженерный ориентир, не клинически
        провалидированная константа.
    iterations : int
        Количество итераций Лапласова сглаживания.
    lamb : float
        Скорость диффузии (0 = нет сглаживания, 1 = максимум).

    Returns
    -------
    trimesh.Trimesh
        Новый mesh с локально сглаженной геометрией.
    """
    # Копируем mesh чтобы не мутировать входной объект
    result = mesh.copy()

    # Вычисляем веса (геодезическое затухание)
    weights = compute_falloff_weights(result, center_vertex_idx, radius)

    # Индексы вершин вне зоны влияния → pinned (заморожены)
    pinned = np.where(weights == 0.0)[0].tolist()

    # Вычисляем оператор Лапласа с заморозкой внешних вершин
    laplacian_op = trimesh.smoothing.laplacian_calculation(
        result,
        equal_weight=True,
        pinned_vertices=pinned,
    )

    # Применяем сглаживание (in-place на копии)
    trimesh.smoothing.filter_laplacian(
        result,
        lamb=lamb,
        iterations=iterations,
        laplacian_operator=laplacian_op,
    )

    return result


def compute_falloff_weights_optimized(
    mesh: trimesh.Trimesh,
    center_vertex_idx: int,
    radius: float,
) -> np.ndarray:
    """
    Оптимизированная версия (День 3, submesh-подход):
    1. Евклидов префильтр — выбираем вершины-кандидаты (dist <= 1.5*radius).
    2. Переиндексация граней — оставляем только треугольники, где
       все 3 вершины входят в множество кандидатов.
    3. PyGeodesicAlgorithmExact инициализируем на малом submesh.

    Нюанс по кэшу:
    Кэширование PyGeodesicAlgorithmExact на уровне submesh не даёт
    реального повторного использования: submesh меняется при
    каждом новом center_vertex_idx — инвалидация кэша свела бы
    выгоду к нулю. Зафиксировано, не реализовано.

    Parameters
    ----------
    mesh : trimesh.Trimesh
        Входной mesh.
    center_vertex_idx : int
        Индекс вершины — центр зоны сглаживания.
    radius : float
        Радиус зоны влияния (обычно мм).

    Returns
    -------
    np.ndarray, shape (N,), dtype float64
        Веса [0.0, 1.0] для каждой вершины входного mesh.
    """
    if not (0 <= center_vertex_idx < len(mesh.vertices)):
        raise IndexError(
            f"center_vertex_idx={center_vertex_idx} вне диапазона "
            f"[0, {len(mesh.vertices)})"
        )
    if radius <= 0:
        raise ValueError(f"radius должен быть > 0, получено: {radius}")

    center_point = mesh.vertices[center_vertex_idx]

    # Шаг 1: Евклидов префильтр — O(N), мгновенно
    euclidean_distances = np.linalg.norm(mesh.vertices - center_point, axis=1)
    candidate_mask = euclidean_distances <= radius * 1.5
    candidate_indices = np.where(candidate_mask)[0]  # индексы в исходном mesh

    weights = np.zeros(len(mesh.vertices))
    if len(candidate_indices) == 0:
        return weights

    # Шаг 2: Переиндексация граней — строим submesh
    # old_to_new[i] = новый индекс вершины i в submesh (или -1, если не входит)
    old_to_new = np.full(len(mesh.vertices), -1, dtype=np.int64)
    old_to_new[candidate_indices] = np.arange(len(candidate_indices), dtype=np.int64)

    # Отбираем треугольники, все 3 вершины которых — кандидаты
    face_mask = np.all(candidate_mask[mesh.faces], axis=1)
    sub_faces_old = mesh.faces[face_mask]   # со старыми индексами
    sub_faces_new = old_to_new[sub_faces_old]  # с новыми
    sub_vertices = mesh.vertices[candidate_indices]

    if len(sub_faces_new) == 0:
        # Кандидаты есть, но нет целых треугольников — фолбэк: вес = 1 для центра
        weights[center_vertex_idx] = 1.0
        return weights

    # Шаг 3: PyGeodesicAlgorithmExact на малом submesh
    # индекс center в submesh
    center_sub_idx = int(old_to_new[center_vertex_idx])
    source_indices = np.array([center_sub_idx])
    geoalg = geodesic.PyGeodesicAlgorithmExact(sub_vertices, sub_faces_new)
    # target_indices=None: расстояния до всех вершин submesh
    distances_sub, _ = geoalg.geodesicDistances(source_indices, None)

    candidate_weights = np.clip(1.0 - (distances_sub / radius), 0.0, 1.0)
    weights[candidate_indices] = candidate_weights
    return weights


def apply_local_laplacian_smoothing(
    mesh: trimesh.Trimesh,
    center_vertex_idx: int,
    radius: float,
    intensity: float = 0.5,
    iterations: int = 3,
) -> trimesh.Trimesh:
    """
    Применяет Laplacian smoothing локально, в радиусе от заданной вершины,
    с плавным затуханием эффекта к границе радиуса.

    Реализация: повершинная итерация с взвешенным смещением:
        new_pos = (1 - w*intensity) * old_pos + (w*intensity) * avg(neighbors)
    где w = geodesic weight in [0, 1].

    Parameters
    ----------
    mesh : trimesh.Trimesh
        Входной mesh. Не модифицируется — возвращается копия.
    center_vertex_idx : int
        Центр зоны сглаживания (индекс вершины).
    radius : float
        Радиус зоны влияния в единицах координат mesh (обычно мм).
        15 мм — инженерный ориентир, не клинически провалидированная константа.
    intensity : float
        Сила сглаживания в центральной точке (0 = нет, 1 = максимум).
    iterations : int
        Количество итераций Laplacian сглаживания.

    Returns
    -------
    trimesh.Trimesh
        Новый mesh с локально сглаженной геометрией.
    """
    smoothed_mesh = mesh.copy()
    # Используем оптимизированную версию весов (евклидов префильтр + геодезика)
    weights = compute_falloff_weights_optimized(mesh, center_vertex_idx, radius)
    adjacency = mesh.vertex_neighbors

    for _ in range(iterations):
        new_vertices = smoothed_mesh.vertices.copy()
        for vertex_idx in range(len(mesh.vertices)):
            if weights[vertex_idx] <= 0:
                continue
            neighbors = adjacency[vertex_idx]
            if len(neighbors) == 0:
                continue
            neighbor_avg = smoothed_mesh.vertices[neighbors].mean(axis=0)
            local_weight = weights[vertex_idx] * intensity
            new_vertices[vertex_idx] = (
                (1 - local_weight) * smoothed_mesh.vertices[vertex_idx]
                + local_weight * neighbor_avg
            )
        smoothed_mesh.vertices = new_vertices

    return smoothed_mesh
