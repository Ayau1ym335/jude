"""
Unit-тесты для app.services.local_smoothing.

Проверяет:
1. Вершины действительно смещаются после сглаживания (diff > 0).
2. Falloff: вершины далеко от центра не трогаются (вес ≈ 0).
3. На шумной сфере сглаживание снижает шум (RMS вершин уменьшается).
4. Параметр intensity=0 не меняет mesh.
5. Результат — новый объект (оригинал не мутирует).

Запуск из корня backend/:
    python -m pytest tests/test_local_smoothing.py -v
"""

import numpy as np
import pytest
import trimesh

from app.services.local_smoothing import apply_local_laplacian_smoothing


# ─── Фикстуры ────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def icosphere_small():
    """Икосфера ~640 вершин / ~1280 граней — достаточно мала для быстрых тестов."""
    return trimesh.creation.icosphere(subdivisions=2)


@pytest.fixture(scope="module")
def noisy_sphere():
    """
    Икосфера с добавленным гауссовым шумом (σ = 2 мм).
    Используется для проверки, что сглаживание снижает дисперсию.
    """
    rng = np.random.default_rng(seed=42)
    mesh = trimesh.creation.icosphere(subdivisions=3)   # ~2500 вершин
    # Масштабируем до ~100 мм радиуса (реалистичный размер скана)
    mesh.apply_scale(100.0)
    noisy = mesh.copy()
    noise_sigma_mm = 2.0
    noisy.vertices = noisy.vertices + rng.normal(0, noise_sigma_mm, size=noisy.vertices.shape)
    return noisy


# ─── Тесты ───────────────────────────────────────────────────────────────────

class TestVerticesActuallyMove:
    """BUG: не было теста, что вершины действительно сдвигаются."""

    def test_vertices_change_after_smoothing(self, icosphere_small):
        mesh = icosphere_small
        center_idx = 0
        radius = 0.5   # достаточно большой радиус на единичной сфере

        result = apply_local_laplacian_smoothing(
            mesh, center_vertex_idx=center_idx, radius=radius,
            intensity=0.8, iterations=3,
        )

        diff = np.linalg.norm(result.vertices - mesh.vertices, axis=1)
        vertices_moved = int((diff > 1e-9).sum())

        assert vertices_moved > 0, (
            "Ни одна вершина не сдвинулась — сглаживание не работает."
        )

    def test_center_vertex_moves_most(self, icosphere_small):
        """Центральная вершина должна двигаться (у неё вес 1.0)."""
        mesh = icosphere_small
        center_idx = len(mesh.vertices) // 2
        radius = 0.5

        result = apply_local_laplacian_smoothing(
            mesh, center_vertex_idx=center_idx, radius=radius,
            intensity=1.0, iterations=1,
        )

        center_diff = np.linalg.norm(
            result.vertices[center_idx] - mesh.vertices[center_idx]
        )
        assert center_diff > 1e-9, (
            f"Центральная вершина (idx={center_idx}) не сдвинулась."
        )


class TestFalloff:
    """Вершины за пределами radius должны остаться нетронутыми."""

    def test_far_vertices_unchanged(self, icosphere_small):
        mesh = icosphere_small
        # Очень маленький радиус: затрагиваем только вершины рядом с вершиной 0
        radius = 0.05   # << диаметр сферы (2.0)
        center_idx = 0

        result = apply_local_laplacian_smoothing(
            mesh, center_vertex_idx=center_idx, radius=radius,
            intensity=1.0, iterations=5,
        )

        diff = np.linalg.norm(result.vertices - mesh.vertices, axis=1)

        # Вершины дальше radius (в евклидовом смысле) не должны двигаться
        center_pos = mesh.vertices[center_idx]
        euclidean_dists = np.linalg.norm(mesh.vertices - center_pos, axis=1)
        far_mask = euclidean_dists > radius * 2.0   # двойной запас

        far_moved = diff[far_mask].max()
        assert far_moved < 1e-9, (
            f"Вершины далеко от центра сдвинулись на {far_moved:.2e} — "
            "falloff не работает."
        )


class TestSmoothingReducesNoise:
    """
    Основной функциональный тест (Шаг 5 задания).
    На шумной сфере сглаживание должно снижать шум (RMS от идеальной сферы).
    """

    def test_smoothing_reduces_rms_noise(self, noisy_sphere):
        """Проверяет, что после сглаживания RMS вершин от идеальной сферы меньше."""
        mesh = noisy_sphere
        # Идеальный радиус = 100 мм (масштаб из фикстуры)
        ideal_radius = 100.0

        # RMS до сглаживания
        r_before = np.linalg.norm(mesh.vertices, axis=1)
        rms_before = float(np.sqrt(np.mean((r_before - ideal_radius) ** 2)))

        center_idx = 0
        result = apply_local_laplacian_smoothing(
            mesh, center_vertex_idx=center_idx,
            radius=30.0,    # ~30 мм — 30% радиуса
            intensity=0.7,
            iterations=5,
        )

        # RMS после сглаживания (только по вершинам в зоне влияния)
        r_after = np.linalg.norm(result.vertices, axis=1)
        rms_after = float(np.sqrt(np.mean((r_after - ideal_radius) ** 2)))

        # RMS в зоне влияния должен снизиться
        center_pos = mesh.vertices[center_idx]
        zone_mask = np.linalg.norm(mesh.vertices - center_pos, axis=1) <= 30.0
        rms_zone_before = float(np.sqrt(np.mean(
            (r_before[zone_mask] - ideal_radius) ** 2
        )))
        rms_zone_after = float(np.sqrt(np.mean(
            (r_after[zone_mask] - ideal_radius) ** 2
        )))

        assert rms_zone_after < rms_zone_before, (
            f"Сглаживание не снизило шум в зоне влияния: "
            f"RMS до={rms_zone_before:.4f}, после={rms_zone_after:.4f}"
        )


class TestIntensityZero:
    """intensity=0 не должна менять геометрию."""

    def test_zero_intensity_no_change(self, icosphere_small):
        mesh = icosphere_small
        center_idx = 0
        radius = 0.8

        result = apply_local_laplacian_smoothing(
            mesh, center_vertex_idx=center_idx, radius=radius,
            intensity=0.0, iterations=10,
        )

        diff = np.linalg.norm(result.vertices - mesh.vertices, axis=1).max()
        assert diff < 1e-9, (
            f"intensity=0 должна не менять mesh, но max diff={diff:.2e}"
        )


class TestOriginalNotMutated:
    """Исходный mesh не должен изменяться (функция возвращает копию)."""

    def test_original_mesh_unchanged(self, icosphere_small):
        mesh = icosphere_small
        original_verts = mesh.vertices.copy()
        center_idx = 0

        apply_local_laplacian_smoothing(
            mesh, center_vertex_idx=center_idx, radius=0.5,
            intensity=1.0, iterations=5,
        )

        diff = np.linalg.norm(mesh.vertices - original_verts, axis=1).max()
        assert diff < 1e-12, (
            "Исходный mesh был изменён — функция должна работать с копией."
        )
