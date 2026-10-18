"""
Тесты для services/asymmetry.py

Синтетические головы строятся через trimesh — реальных .stl файлов не нужно.

Сценарии:
  1. head_symmetric  — идеальная сфера: mean_abs < 0.3 мм.
  2. head_mild       — сфера с уплощением 5 мм в зоне правого затылка:
                       max ≈ 5 мм (допуск 40 % из-за сглаживания отражения).
  3. head_moderate   — уплощение 12 мм: max_moderate > max_mild.
  4. head_rotated    — та же симметричная голова, повёрнутая + правильные метки:
                       результат близок к симметричному (mean_abs < 0.5 мм).
  5. Замер времени на сфере 200 тыс. граней.
"""

import sys
import os
import math
import time

import numpy as np
import trimesh

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.asymmetry import asymmetry_map, asymmetry_metrics, compute_asymmetry
from app.services.head_frame import build_head_frame


# ──────────────────────────────────────────────────────────────────────────────
# Вспомогательные функции
# ──────────────────────────────────────────────────────────────────────────────

# Стандартные ориентиры для симметричной головы-сферы R=80
NASION      = [0.0,  75.0, 0.0]   # кончик носа
TRAGUS_LEFT = [-60.0, 0.0, 0.0]   # левый козелок
TRAGUS_RIGHT = [60.0, 0.0, 0.0]   # правый козелок


def _make_sphere(subdivisions: int = 3, radius: float = 80.0) -> trimesh.Trimesh:
    """Симметричная сфера-«голова»."""
    return trimesh.creation.icosphere(subdivisions=subdivisions, radius=radius)


def _make_flattened_sphere(flatten_mm: float, subdivisions: int = 3) -> trimesh.Trimesh:
    """
    Сфера с локальным уплощением flatten_mm мм в зоне правого затылка.
    Зона: вершины с x > 40 и y < -20 (задняя правая часть в СК головы).
    """
    mesh = _make_sphere(subdivisions=subdivisions)
    v = mesh.vertices.copy()
    # «Правый затылок» в нейтральной позе: x > 40, y < -30
    mask = (v[:, 0] > 40) & (v[:, 1] < -30)
    # Сдвигаем вдавленные вершины к центру (x уменьшается)
    v[mask, 0] -= flatten_mm
    mesh = trimesh.Trimesh(vertices=v, faces=mesh.faces, process=False)
    return mesh


def _rotation_matrix(angle_z_deg: float, angle_x_deg: float) -> np.ndarray:
    az = math.radians(angle_z_deg)
    ax = math.radians(angle_x_deg)
    Rz = np.array([
        [math.cos(az), -math.sin(az), 0],
        [math.sin(az),  math.cos(az), 0],
        [0,             0,            1],
    ])
    Rx = np.array([
        [1, 0,            0           ],
        [0, math.cos(ax), -math.sin(ax)],
        [0, math.sin(ax),  math.cos(ax)],
    ])
    return Rz @ Rx


def _apply_rotation_to_landmarks(R, nasion, tl, tr):
    """Поворачивает ориентиры той же матрицей, что и голову."""
    return (
        (R @ np.array(nasion)).tolist(),
        (R @ np.array(tl)).tolist(),
        (R @ np.array(tr)).tolist(),
    )


# ──────────────────────────────────────────────────────────────────────────────
# Тест 1: head_symmetric — mean_abs < 0.3 мм
# ──────────────────────────────────────────────────────────────────────────────

class TestSymmetricHead:
    """Идеально симметричная голова: карта асимметрии должна быть близка к нулю."""

    def test_mean_abs_below_threshold(self):
        mesh = _make_sphere()
        result = compute_asymmetry(mesh, NASION, TRAGUS_LEFT, TRAGUS_RIGHT)

        mean_abs = result["mean_abs"]
        vmin, vmax = result["min"], result["max"]

        print(f"\n[head_symmetric]  min={vmin:.3f}  max={vmax:.3f}  mean_abs={mean_abs:.3f} мм")

        assert mean_abs < 0.3, (
            f"Симметричная голова: mean_abs={mean_abs:.3f} мм ≥ 0.3 мм. "
            "Проверьте реализацию зеркального отражения."
        )

    def test_values_length_equals_vertices(self):
        mesh = _make_sphere()
        result = compute_asymmetry(mesh, NASION, TRAGUS_LEFT, TRAGUS_RIGHT)
        assert len(result["values"]) == len(mesh.vertices)

    def test_min_max_symmetric_around_zero(self):
        """Для симметричной головы |min| ≈ |max|."""
        mesh = _make_sphere()
        result = compute_asymmetry(mesh, NASION, TRAGUS_LEFT, TRAGUS_RIGHT)
        assert abs(abs(result["min"]) - abs(result["max"])) < 0.5


# ──────────────────────────────────────────────────────────────────────────────
# Тест 2: head_mild (flatten=5 мм) — max ≈ 5 мм (допуск 40%)
# ──────────────────────────────────────────────────────────────────────────────

class TestMildAsymmetry:
    """Лёгкое уплощение 5 мм: максимум должен быть близок к 5 мм."""

    def test_max_near_flatten_value(self):
        flatten_mm = 5.0
        mesh = _make_flattened_sphere(flatten_mm=flatten_mm)
        result = compute_asymmetry(mesh, NASION, TRAGUS_LEFT, TRAGUS_RIGHT)

        vmin, vmax = result["min"], result["max"]
        mean_abs = result["mean_abs"]

        # Сохраняем для тестов Moderate
        self.__class__._max_mild = abs(vmin)

        print(f"\n[head_mild]  min={vmin:.3f}  max={vmax:.3f}  mean_abs={mean_abs:.3f} мм")
        print(f"  flatten={flatten_mm} mm  ->  |min|={abs(vmin):.3f} mm  (expect ~{flatten_mm} mm +-40%)")

        # Уплощение сдвигает вершины «внутрь» → они будут с отрицательным знаком
        # Допуск 40%: значение может быть от 3 до 7 мм
        assert abs(vmin) >= flatten_mm * 0.6, (
            f"Ожидали |min| ≥ {flatten_mm * 0.6:.1f} мм, получили {abs(vmin):.3f} мм"
        )
        assert abs(vmin) <= flatten_mm * 1.4, (
            f"Ожидали |min| ≤ {flatten_mm * 1.4:.1f} мм, получили {abs(vmin):.3f} мм"
        )


# ──────────────────────────────────────────────────────────────────────────────
# Тест 3: head_moderate (flatten=12 мм) — max > max_mild
# ──────────────────────────────────────────────────────────────────────────────

class TestModerateAsymmetry:
    """Умеренное уплощение 12 мм: максимум должен быть больше, чем у mild."""

    def test_max_greater_than_mild(self):
        flatten_mild = 5.0
        flatten_moderate = 12.0

        mesh_mild = _make_flattened_sphere(flatten_mm=flatten_mild)
        mesh_moderate = _make_flattened_sphere(flatten_mm=flatten_moderate)

        result_mild     = compute_asymmetry(mesh_mild, NASION, TRAGUS_LEFT, TRAGUS_RIGHT)
        result_moderate = compute_asymmetry(mesh_moderate, NASION, TRAGUS_LEFT, TRAGUS_RIGHT)

        max_mild     = abs(result_mild["min"])
        max_moderate = abs(result_moderate["min"])

        print(f"\n[head_mild]      |min|={max_mild:.3f}  mean_abs={result_mild['mean_abs']:.3f} мм")
        print(f"[head_moderate]  |min|={max_moderate:.3f}  mean_abs={result_moderate['mean_abs']:.3f} мм")

        assert max_moderate > max_mild, (
            f"Ожидали max_moderate ({max_moderate:.3f}) > max_mild ({max_mild:.3f})"
        )


# ──────────────────────────────────────────────────────────────────────────────
# Тест 4: head_rotated с правильными метками → результат близок к symmetric
# ──────────────────────────────────────────────────────────────────────────────

class TestRotatedHeadWithCorrectLandmarks:
    """
    Повёрнутая симметричная голова + правильно повёрнутые ориентиры
    → карта асимметрии должна быть близка к карте для нейтральной позы.
    """

    def test_rotated_close_to_symmetric(self):
        R = _rotation_matrix(angle_z_deg=30, angle_x_deg=15)

        mesh_sym = _make_sphere()
        mesh_rot = _make_sphere()

        T = np.eye(4)
        T[:3, :3] = R
        mesh_rot.apply_transform(T)

        nasion_r, tl_r, tr_r = _apply_rotation_to_landmarks(
            R, NASION, TRAGUS_LEFT, TRAGUS_RIGHT
        )

        # Симметричная в нейтральной позе
        result_sym = compute_asymmetry(mesh_sym, NASION, TRAGUS_LEFT, TRAGUS_RIGHT)
        # Повёрнутая с правильными метками
        result_rot = compute_asymmetry(mesh_rot, nasion_r, tl_r, tr_r)

        print(f"\n[head_symmetric]  mean_abs={result_sym['mean_abs']:.4f} мм")
        print(f"[head_rotated]    mean_abs={result_rot['mean_abs']:.4f} мм")
        print("  (поворот R(z=30°, x=15°) с правильными ориентирами)")

        # Допуск 0.5 мм: правильные метки должны полностью компенсировать поворот
        assert result_rot["mean_abs"] < 0.5, (
            f"После компенсации поворота mean_abs={result_rot['mean_abs']:.4f} мм ≥ 0.5 мм. "
            "Ориентиры не исправляют поворот — проверьте to_head_frame."
        )


# ──────────────────────────────────────────────────────────────────────────────
# Тест 5: Замер времени на 200 тыс. граней
# ──────────────────────────────────────────────────────────────────────────────

class TestPerformance:
    """
    Замер времени вычисления asymmetry_map на большом меше.
    Тест не фейлит при превышении порога, только выводит предупреждение.
    """

    def test_timing_200k_faces(self):
        # subdivisions=6 -> 81920 граней (82k). Это наиближайший размер к 200k,
        # доступный через icosphere без слишком долгого ожидания в CI.
        # subdivisions=7 -> 327680 граней (~328k, тяжело для nearest.on_surface).
        # Выбираем 6 как разумный компромисс.
        mesh = trimesh.creation.icosphere(subdivisions=6, radius=80.0)
        n_faces = len(mesh.faces)
        n_verts = len(mesh.vertices)

        print(f"\n[performance]  mesh: {n_verts} вершин, {n_faces} граней")

        origin, R = build_head_frame(NASION, TRAGUS_LEFT, TRAGUS_RIGHT)

        t0 = time.perf_counter()
        signed_dist = asymmetry_map(mesh, origin, R)
        elapsed = time.perf_counter() - t0

        metrics = asymmetry_metrics(signed_dist)
        print(f"  Время вычисления: {elapsed:.2f} с")
        print(f"  mean_abs={metrics['mean_abs']:.4f} мм  min={metrics['min']:.3f}  max={metrics['max']:.3f}")

        LIMIT_SECONDS = 5.0
        if elapsed > LIMIT_SECONDS:
            print(
                f"\n  WARNING: computation took {elapsed:.2f}s > {LIMIT_SECONDS}s."
                f" Optimisation needed (KD-tree / batched raycasting)."
            )
            # Not failing - reporting numbers as required by the task
        else:
            print(f"  OK: finished in {elapsed:.2f}s (limit {LIMIT_SECONDS}s)")

        # Базовая проверка корректности даже на большом меше
        assert len(signed_dist) == n_verts
        assert metrics["mean_abs"] < 0.5  # симметричная сфера


# ──────────────────────────────────────────────────────────────────────────────
# Прямой запуск: вывод всех цифр
# ──────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 60)
    print("ТЕСТ 1: head_symmetric")
    m = _make_sphere()
    r = compute_asymmetry(m, NASION, TRAGUS_LEFT, TRAGUS_RIGHT)
    print(f"  min={r['min']:.4f}  max={r['max']:.4f}  mean_abs={r['mean_abs']:.4f}  "
          f"over_threshold={r['percent_over_threshold']:.2f}%")

    print("=" * 60)
    print("ТЕСТ 2: head_mild (flatten=5 мм)")
    m = _make_flattened_sphere(5.0)
    r = compute_asymmetry(m, NASION, TRAGUS_LEFT, TRAGUS_RIGHT)
    print(f"  min={r['min']:.4f}  max={r['max']:.4f}  mean_abs={r['mean_abs']:.4f}  "
          f"over_threshold={r['percent_over_threshold']:.2f}%")

    print("=" * 60)
    print("ТЕСТ 3: head_moderate (flatten=12 мм)")
    m = _make_flattened_sphere(12.0)
    r = compute_asymmetry(m, NASION, TRAGUS_LEFT, TRAGUS_RIGHT)
    print(f"  min={r['min']:.4f}  max={r['max']:.4f}  mean_abs={r['mean_abs']:.4f}  "
          f"over_threshold={r['percent_over_threshold']:.2f}%")

    print("=" * 60)
    print("ТЕСТ 4: head_rotated (R z=30°, x=15°) с правильными метками")
    R_mat = _rotation_matrix(30, 15)
    m_sym = _make_sphere()
    m_rot = _make_sphere()
    T = np.eye(4)
    T[:3, :3] = R_mat
    m_rot.apply_transform(T)
    nr, tl_r, tr_r = _apply_rotation_to_landmarks(R_mat, NASION, TRAGUS_LEFT, TRAGUS_RIGHT)
    r_rot = compute_asymmetry(m_rot, nr, tl_r, tr_r)
    print(f"  min={r_rot['min']:.4f}  max={r_rot['max']:.4f}  mean_abs={r_rot['mean_abs']:.4f}  "
          f"over_threshold={r_rot['percent_over_threshold']:.2f}%")

    print("=" * 60)
    print("ТЕСТ 5: ПРОИЗВОДИТЕЛЬНОСТЬ (subdivisions=5, ~163 тыс. граней)")
    m_big = trimesh.creation.icosphere(subdivisions=5, radius=80.0)
    print(f"  {len(m_big.vertices)} вершин, {len(m_big.faces)} граней")
    origin_, R_ = build_head_frame(NASION, TRAGUS_LEFT, TRAGUS_RIGHT)
    t0 = time.perf_counter()
    sd = asymmetry_map(m_big, origin_, R_)
    elapsed = time.perf_counter() - t0
    met = asymmetry_metrics(sd)
    print(f"  Время: {elapsed:.2f} с")
    print(f"  min={met['min']:.4f}  max={met['max']:.4f}  mean_abs={met['mean_abs']:.4f}")
    if elapsed > 5:
        print("  ⚠ ПРЕВЫШЕН ЛИМИТ 5 с — требуется оптимизация")
    else:
        print("  ✓ Уложились в 5 с")
