"""
Unit-тесты для app.services.geodesic_curve.

Запуск из корня backend/:
    python -m pytest tests/test_geodesic_curve.py -v
"""

import numpy as np
import pytest
import trimesh

from app.services.geodesic_curve import (
    compute_geodesic_curve_through_points,
    find_nearest_vertex_index,
)


@pytest.fixture(scope="module")
def icosphere():
    """Икосфера для всех тестов модуля (создаётся один раз)."""
    return trimesh.creation.icosphere()


class TestComputeGeodesicCurveThroughPoints:
    def test_three_points_returns_nonempty_array(self, icosphere):
        mesh = icosphere
        n = len(mesh.vertices)
        # три равномерно распределённых вершины
        indices = [0, n // 3, 2 * n // 3]

        result = compute_geodesic_curve_through_points(mesh, indices)

        assert isinstance(result, np.ndarray), "Результат должен быть np.ndarray"
        assert result.ndim == 2, "Массив должен быть 2D"
        assert result.shape[1] == 3, "Каждая точка должна иметь 3 координаты"
        assert len(result) > 0, "Результат не должен быть пустым"

    def test_three_points_no_gaps(self, icosphere):
        """Проверяет, что кривая не имеет разрывов — соседние точки не слишком далеко."""
        mesh = icosphere
        n = len(mesh.vertices)
        indices = [0, n // 3, 2 * n // 3]

        result = compute_geodesic_curve_through_points(mesh, indices)

        # Максимальное расстояние между соседними точками пути
        diffs = np.linalg.norm(np.diff(result, axis=0), axis=1)
        # Икосфера радиуса ~1, разрыв не должен превышать диаметр сферы
        assert np.all(diffs < 2.0), f"Обнаружен разрыв в кривой: max={diffs.max():.4f}"

    def test_one_point_raises_value_error(self, icosphere):
        with pytest.raises(ValueError, match="минимум 2"):
            compute_geodesic_curve_through_points(icosphere, [0])

    def test_two_points_returns_valid_path(self, icosphere):
        mesh = icosphere
        result = compute_geodesic_curve_through_points(mesh, [0, len(mesh.vertices) // 2])

        assert isinstance(result, np.ndarray)
        assert result.shape[1] == 3
        assert len(result) > 2, "Путь должен содержать более 2 точек"


class TestFindNearestVertexIndex:
    def test_exact_vertex_returns_correct_index(self, icosphere):
        mesh = icosphere
        target_idx = 42
        point = mesh.vertices[target_idx].tolist()

        result = find_nearest_vertex_index(mesh, point)

        assert result == target_idx, (
            f"Ожидался индекс {target_idx}, получен {result}"
        )

    def test_returns_int(self, icosphere):
        result = find_nearest_vertex_index(icosphere, [0.0, 0.0, 1.0])
        assert isinstance(result, int)

    def test_result_in_valid_range(self, icosphere):
        mesh = icosphere
        result = find_nearest_vertex_index(mesh, [0.5, 0.5, 0.5])
        assert 0 <= result < len(mesh.vertices)
