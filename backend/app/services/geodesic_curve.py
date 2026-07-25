import numpy as np
import trimesh
from pygeodesic import geodesic


def compute_geodesic_path(mesh: trimesh.Trimesh, source_vertex_idx: int, target_vertex_idx: int) -> np.ndarray:
    """
    Вычисляет кратчайший путь по поверхности mesh между двумя вершинами.
    Возвращает np.ndarray формы (N, 3).
    """
    geoalg = geodesic.PyGeodesicAlgorithmExact(mesh.vertices, mesh.faces)
    distance, path = geoalg.geodesicDistance(source_vertex_idx, target_vertex_idx)
    return path


def compute_geodesic_curve_through_points(mesh: trimesh.Trimesh, vertex_indices: list[int]) -> np.ndarray:
    """Строит непрерывную кривую по поверхности через последовательность опорных точек."""
    if len(vertex_indices) < 2:
        raise ValueError("Нужно минимум 2 опорные точки для построения кривой")

    full_path = []
    for i in range(len(vertex_indices) - 1):
        segment = compute_geodesic_path(mesh, vertex_indices[i], vertex_indices[i + 1])
        if i > 0:
            segment = segment[1:]
        full_path.append(segment)

    return np.concatenate(full_path, axis=0)


def find_nearest_vertex_index(mesh: trimesh.Trimesh, point: list[float]) -> int:
    """Находит индекс ближайшей вершины mesh к заданной 3D-точке."""
    point_arr = np.array(point).reshape(1, 3)
    distances = np.linalg.norm(mesh.vertices - point_arr, axis=1)
    return int(np.argmin(distances))
