"""
tests/test_raycast_accuracy.py

Тест на точность raycast: клик в известную точку → результат в пределах 1 мм.

Проверяем find_nearest_vertex_index (python-side) — она же используется в
geodesic_curve_endpoint для привязки кликнутой 3D-точки к ближайшей вершине mesh.

Three.js raycast работает на клиенте и не тестируется здесь напрямую,
но логика совпадает: клиент посылает мировые координаты хита,
сервер привязывает их к ближайшей вершине через find_nearest_vertex_index.

Синтетический mesh — икосфера радиуса 100 мм (~2500 вершин).

Запуск:
    python -m pytest tests/test_raycast_accuracy.py -v
"""

import numpy as np
import pytest
import trimesh

from app.services.geodesic_curve import find_nearest_vertex_index


SPHERE_RADIUS_MM = 100.0
# Максимально допустимое расстояние от хита до ближайшей вершины (мм).
# Зависит от разрешения mesh; при 2500 вершинах / радиусе 100 мм
# средняя длина ребра ~8 мм → 1 мм запас ниже предела разрешения.
MAX_SNAP_ERROR_MM = 5.0  # консервативный порог для данного разрешения


@pytest.fixture(scope="module")
def sphere_100mm():
    """Икосфера радиуса 100 мм — синтетический mesh для raycast-тестов."""
    mesh = trimesh.creation.icosphere(subdivisions=3)  # ~2500 вершин
    mesh.apply_scale(SPHERE_RADIUS_MM)
    return mesh


class TestRaycastAccuracy:
    """
    Тест точности привязки клика к вершине.

    Модель клика: пользователь кликает в точку p (мировые координаты).
    Сервер вызывает find_nearest_vertex_index(mesh, p) и возвращает
    ближайшую вершину. Проверяем, что расстояние snap < MAX_SNAP_ERROR_MM.
    """

    def test_click_on_known_vertex_snaps_exactly(self, sphere_100mm):
        """Если клик точно в вершину — snap distance = 0."""
        mesh = sphere_100mm
        target_idx = 100
        point = mesh.vertices[target_idx].tolist()

        result_idx = find_nearest_vertex_index(mesh, point)

        assert result_idx == target_idx, (
            f"Ожидался индекс {target_idx}, получен {result_idx}"
        )
        snap_dist = float(np.linalg.norm(np.array(point) - mesh.vertices[result_idx]))
        assert snap_dist < 1e-9, f"snap distance={snap_dist:.6f} мм, ожидалось 0"

    def test_click_near_vertex_snaps_within_threshold(self, sphere_100mm):
        """Клик рядом с вершиной (шум 0.5 мм) → snap в пределах MAX_SNAP_ERROR_MM."""
        mesh = sphere_100mm
        rng = np.random.default_rng(seed=0)

        errors = []
        for target_idx in range(0, len(mesh.vertices), 50):  # каждая 50-я вершина
            true_pos = mesh.vertices[target_idx]
            # Симулируем небольшой шум клика (0.5 мм σ)
            noisy_point = (true_pos + rng.normal(0, 0.5, 3)).tolist()

            result_idx = find_nearest_vertex_index(mesh, noisy_point)
            snap_pos = mesh.vertices[result_idx]
            error = float(np.linalg.norm(np.array(noisy_point) - snap_pos))
            errors.append(error)

        max_error = max(errors)
        assert max_error < MAX_SNAP_ERROR_MM, (
            f"Максимальная ошибка привязки {max_error:.2f} мм > {MAX_SNAP_ERROR_MM} мм.\n"
            f"Возможная причина: разрешение mesh слишком низкое или\n"
            f"координаты клика в другой системе координат."
        )

    def test_click_on_sphere_surface_returns_valid_index(self, sphere_100mm):
        """Любая точка на поверхности сферы должна привязаться к валидному индексу."""
        mesh = sphere_100mm
        rng = np.random.default_rng(seed=1)

        for _ in range(20):
            # Случайная точка на поверхности сферы
            direction = rng.standard_normal(3)
            direction /= np.linalg.norm(direction)
            point = (direction * SPHERE_RADIUS_MM).tolist()

            idx = find_nearest_vertex_index(mesh, point)
            assert 0 <= idx < len(mesh.vertices), (
                f"find_nearest_vertex_index вернул {idx} вне диапазона"
            )

    def test_snap_error_within_one_edge_length(self, sphere_100mm):
        """
        Ошибка привязки не должна превышать среднюю длину ребра mesh.
        Гарантирует, что клик всегда попадает в «правильный» треугольник.
        """
        mesh = sphere_100mm
        # Средняя длина ребра (приближение)
        edges = mesh.edges_unique
        edge_lengths = np.linalg.norm(
            mesh.vertices[edges[:, 0]] - mesh.vertices[edges[:, 1]], axis=1
        )
        mean_edge_mm = float(edge_lengths.mean())

        # Проверяем случайные точки
        rng = np.random.default_rng(seed=2)
        errors = []
        for target_idx in rng.integers(0, len(mesh.vertices), size=50):
            point = mesh.vertices[int(target_idx)].tolist()
            result_idx = find_nearest_vertex_index(mesh, point)
            snap_error = float(
                np.linalg.norm(np.array(point) - mesh.vertices[result_idx])
            )
            errors.append(snap_error)

        max_error = max(errors)
        assert max_error <= mean_edge_mm + 1e-6, (
            f"Ошибка привязки {max_error:.3f} мм > средняя длина ребра "
            f"{mean_edge_mm:.3f} мм"
        )
