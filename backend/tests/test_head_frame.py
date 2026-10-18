"""
Pytest-тесты для services/head_frame.py

Тесты работают на синтетических головах (trimesh-примитивы),
без реальных .stl файлов — запускаются в CI без внешних зависимостей.

Сценарии:
  1. head_symmetric  — нос на (0, 75, 0), козелки на (±60, 0, 0)
     → R должна быть близка к единичной матрице.
  2. head_rotated    — та же голова, повёрнутая на произвольный угол
     → after to_head_frame облако должно совпадать с исходным (Chamfer < 1 мм).
  3. Коллинеарные точки → ValueError.
  4. PCA-автооценка помечена low_confidence=True и бросает UserWarning.
"""

import sys
import os
import math
import warnings

import numpy as np
import pytest
import trimesh

# Добавляем backend в путь (запуск из backend/ или из корня)
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.head_frame import (
    build_head_frame,
    to_head_frame,
    estimate_landmarks_pca,
)


# ---------------------------------------------------------------------------
# Вспомогательные функции
# ---------------------------------------------------------------------------

def _make_head_sphere(center=(0, 0, 0), radius=80.0, subdivisions=3) -> trimesh.Trimesh:
    """Создаёт сферу-«голову» с заданным центром."""
    sphere = trimesh.creation.icosphere(subdivisions=subdivisions, radius=radius)
    sphere.apply_translation(center)
    return sphere


def _chamfer_distance(pts_a: np.ndarray, pts_b: np.ndarray) -> float:
    """
    Симметричное расстояние Чэмфера (мм).
    Для больших облаков использует случайную выборку 2000 точек для скорости.
    """
    rng = np.random.default_rng(42)
    n = min(2000, len(pts_a), len(pts_b))
    a = pts_a[rng.choice(len(pts_a), n, replace=False)]
    b = pts_b[rng.choice(len(pts_b), n, replace=False)]

    # Расстояние от каждой точки a до ближайшей в b
    from scipy.spatial import cKDTree
    tree_b = cKDTree(b)
    dist_ab, _ = tree_b.query(a)

    tree_a = cKDTree(a)
    dist_ba, _ = tree_a.query(b)

    return float(max(dist_ab.mean(), dist_ba.mean()))


# ---------------------------------------------------------------------------
# Фикстуры — синтетические головы
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def symmetric_landmarks():
    """Ориентиры симметричной головы в «нейтральной» позе."""
    nasion = [0.0, 75.0, 0.0]        # кончик носа — вперёд по Y
    tragus_left = [-60.0, 0.0, 0.0]  # левый козелок — влево по X
    tragus_right = [60.0, 0.0, 0.0]  # правый козелок — вправо по X
    return nasion, tragus_left, tragus_right


@pytest.fixture(scope="module")
def symmetric_head():
    """Сфера-голова в нейтральной позе, центр в (0,0,0)."""
    return _make_head_sphere(center=(0, 0, 0))


@pytest.fixture(scope="module")
def rotation_matrix_30deg():
    """Поворот на 30° вокруг оси Z + 15° вокруг оси X."""
    angle_z = math.radians(30)
    Rz = np.array([
        [math.cos(angle_z), -math.sin(angle_z), 0],
        [math.sin(angle_z),  math.cos(angle_z), 0],
        [0,                  0,                  1],
    ])
    angle_x = math.radians(15)
    Rx = np.array([
        [1, 0,                0               ],
        [0, math.cos(angle_x), -math.sin(angle_x)],
        [0, math.sin(angle_x),  math.cos(angle_x)],
    ])
    return Rz @ Rx


@pytest.fixture(scope="module")
def rotated_head_and_landmarks(symmetric_landmarks, rotation_matrix_30deg):
    """
    head_rotated: сфера из нейтральной позы, повёрнутая на R.
    landmarks_rotated: ориентиры нейтральной головы, повёрнутые тем же R.
    """
    R = rotation_matrix_30deg
    nasion, tl, tr = symmetric_landmarks
    rotated_head = _make_head_sphere(center=(0, 0, 0))
    rotated_head.apply_transform(np.vstack([
        np.hstack([R, np.zeros((3, 1))]),
        [0, 0, 0, 1]
    ]))
    nasion_r = (R @ np.array(nasion)).tolist()
    tl_r = (R @ np.array(tl)).tolist()
    tr_r = (R @ np.array(tr)).tolist()
    return rotated_head, nasion_r, tl_r, tr_r


# ---------------------------------------------------------------------------
# Тест 1: Симметричная голова → R ≈ единичной матрице
# ---------------------------------------------------------------------------

class TestHeadFrameSymmetric:
    """
    Для head_symmetric с ориентирами (нос=(0,75,0), козелки=(±60,0,0))
    матрица R должна совпадать с I₃ с точностью 1e-10.
    """

    def test_origin_is_midpoint(self, symmetric_landmarks):
        nasion, tl, tr = symmetric_landmarks
        origin, R = build_head_frame(nasion, tl, tr)
        expected_origin = np.array([0.0, 0.0, 0.0])
        np.testing.assert_allclose(
            origin, expected_origin, atol=1e-10,
            err_msg="origin должен быть серединой между козелками (0,0,0)",
        )

    def test_R_close_to_identity(self, symmetric_landmarks):
        nasion, tl, tr = symmetric_landmarks
        _, R = build_head_frame(nasion, tl, tr)
        np.testing.assert_allclose(
            R, np.eye(3), atol=1e-10,
            err_msg="Для симметричных ориентиров R должна быть близка к I₃",
        )

    def test_axes_orthonormal(self, symmetric_landmarks):
        nasion, tl, tr = symmetric_landmarks
        _, R = build_head_frame(nasion, tl, tr)
        # R @ R.T = I
        np.testing.assert_allclose(
            R @ R.T, np.eye(3), atol=1e-12,
            err_msg="Строки R должны быть попарно ортогональны и единичной длины",
        )

    def test_right_handed_frame(self, symmetric_landmarks):
        nasion, tl, tr = symmetric_landmarks
        _, R = build_head_frame(nasion, tl, tr)
        assert np.linalg.det(R) == pytest.approx(1.0, abs=1e-12), \
            "Система координат должна быть правой (det R = +1)"


# ---------------------------------------------------------------------------
# Тест 2: Повёрнутая голова → Chamfer после to_head_frame < 1 мм
# ---------------------------------------------------------------------------

class TestHeadFrameRotated:
    """
    После построения рамки по повёрнутым ориентирам и применения
    to_head_frame расстояние Чэмфера между облаком повёрнутой головы
    и облаком нейтральной головы должно быть меньше 1 мм.
    """

    def test_chamfer_after_to_head_frame(
        self,
        symmetric_head,
        rotated_head_and_landmarks,
    ):
        rotated_head, nasion_r, tl_r, tr_r = rotated_head_and_landmarks

        origin, R = build_head_frame(nasion_r, tl_r, tr_r)
        aligned_vertices = to_head_frame(rotated_head.vertices, origin, R)

        chamfer = _chamfer_distance(aligned_vertices, symmetric_head.vertices)
        print(f"\n[TestHeadFrameRotated] Chamfer distance = {chamfer:.4f} мм (порог < 1 мм)")
        assert chamfer < 1.0, (
            f"Chamfer distance {chamfer:.4f} мм превышает порог 1 мм. "
            "to_head_frame не устранил поворот."
        )

    def test_frame_axes_orthonormal_after_rotation(self, rotated_head_and_landmarks):
        _, nasion_r, tl_r, tr_r = rotated_head_and_landmarks
        _, R = build_head_frame(nasion_r, tl_r, tr_r)
        np.testing.assert_allclose(
            R @ R.T, np.eye(3), atol=1e-12,
            err_msg="R должна быть ортонормальной даже после поворота ориентиров",
        )


# ---------------------------------------------------------------------------
# Тест 3: Ошибки при плохих входных данных
# ---------------------------------------------------------------------------

class TestHeadFrameErrors:
    def test_collinear_points_raise_value_error(self):
        """Коллинеарные точки → ValueError."""
        nasion = [0.0, 10.0, 0.0]
        tl = [-5.0, 0.0, 0.0]
        tr = [5.0, 0.0, 0.0]
        # Насион лежит на той же оси X, что и козелки (и на origin=0,0,0 — вычтем)
        # Сделаем так, чтобы ey → 0: насион совпадает с origin
        nasion_collinear = [0.0, 0.0, 0.0]  # origin = (0,0,0), ey=0
        with pytest.raises(ValueError, match="одной линии|не определена"):
            build_head_frame(nasion_collinear, tl, tr)

    def test_coincident_tragus_raises(self):
        """Совпадающие козелки → ValueError."""
        with pytest.raises(ValueError, match="одной точке|ось вправо"):
            build_head_frame([0, 10, 0], [5, 0, 0], [5, 0, 0])

    def test_wrong_shape_raises(self):
        """Точка с неправильным числом координат → ValueError."""
        with pytest.raises((ValueError, Exception)):
            build_head_frame([0, 10], [-60, 0, 0], [60, 0, 0])


# ---------------------------------------------------------------------------
# Тест 4: PCA-автооценка → low_confidence=True + UserWarning
# ---------------------------------------------------------------------------

class TestPCAEstimate:
    def test_returns_low_confidence(self, symmetric_head):
        with warnings.catch_warnings(record=True):
            warnings.simplefilter("always")
            result = estimate_landmarks_pca(symmetric_head)
        assert result["low_confidence"] is True, \
            "PCA-оценка обязана возвращать low_confidence=True"

    def test_emits_user_warning(self, symmetric_head):
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            estimate_landmarks_pca(symmetric_head)
        user_warnings = [w for w in caught if issubclass(w.category, UserWarning)]
        assert len(user_warnings) > 0, \
            "estimate_landmarks_pca должна выбрасывать UserWarning о низкой достоверности"

    def test_warning_mentions_nose_ambiguity(self, symmetric_head):
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            estimate_landmarks_pca(symmetric_head)
        msg = " ".join(str(w.message) for w in caught)
        assert any(word in msg.lower() for word in ["нос", "нозначно", "подтвердите", "pca"]), \
            "Предупреждение должно упоминать неоднозначность направления"

    def test_pca_returns_orthonormal_R(self, symmetric_head):
        with warnings.catch_warnings(record=True):
            warnings.simplefilter("always")
            result = estimate_landmarks_pca(symmetric_head)
        R = np.array(result["R"])
        np.testing.assert_allclose(
            R @ R.T, np.eye(3), atol=1e-10,
            err_msg="PCA-матрица R должна быть ортонормальной",
        )

    def test_pca_right_handed(self, symmetric_head):
        with warnings.catch_warnings(record=True):
            warnings.simplefilter("always")
            result = estimate_landmarks_pca(symmetric_head)
        R = np.array(result["R"])
        assert np.linalg.det(R) == pytest.approx(1.0, abs=1e-10), \
            "PCA-система координат должна быть правой (det = +1)"
