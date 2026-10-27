"""
Pytest-тесты для services/head_metrics.py и POST /geometry/head-metrics.

Тесты работают на синтетических головах (trimesh-примитивы),
без внешних .stl файлов — запускаются в CI без внешних зависимостей.

Сценарии:
  1. head_symmetric  — эллипсоид (длина 150, ширина 120 на уровне экватора):
                       ширина около 120, длина около 150, CI около 80 (допуск 2 п.п.),
                       CVAI < 1.0% (идеальная симметрия).
  2. head_rotated    — та же голова, повёрнутая в 3D на (z=30°, x=15°) + повёрнутые ориентиры:
                       те же значения, что и у head_symmetric (компенсация поворота осями головы),
                       CVAI близок к head_symmetric.
  3. Монотонность и сторона асимметрии:
       - CVAI(head_mild) < CVAI(head_moderate) (строгая монотонность по степени уплощения);
       - сторона асимметрии определяется верно: у flatten_right_back более короткая диагональ — B (правый затылок).
       - у flatten_left_back более короткая диагональ — A (левый затылок).
  4. Ошибки:
       - пустое сечение (уровень z вне головы) -> ValueError с понятным сообщением;
       - незамкнутый контур (скан с дырой)      -> ValueError с понятным сообщением.
  5. Несколько контуров: выбирается самый длинный замкнутый контур (отсечение шума/ушей).
  6. Сравнение четырёх голов (таблица значений):
       - head_symmetric
       - head_rotated
       - head_mild (уплощение 5 мм)
       - head_moderate (уплощение 12 мм)
  7. Проверка дисклеймеров: клинические пороги не зашиты как непреложный факт «норма/патология».
  8. Тест FastAPI эндпоинта POST /geometry/head-metrics (422 при отсутствии landmarks, 200 с диагоналями и CVAI при успехе).
"""

import sys
import os
import math
from unittest.mock import patch, MagicMock

import numpy as np
import pytest
import trimesh

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.head_metrics import (
    cross_section,
    best_slice_height,
    cephalic_index,
    diagonals,
    cvai,
    compute_head_metrics,
    CI_TENTATIVE_REFERENCE,
    CVAI_TENTATIVE_REFERENCE,
)


# ─── Вспомогательные генераторы синтетических голов ──────────────────────────


def _make_symmetric_head(
    width: float = 120.0,
    length: float = 150.0,
    height_semi: float = 65.0,
    z_center: float = 30.0,
    subdivisions: int = 4,
) -> tuple[trimesh.Trimesh, list[float], list[float], list[float]]:
    """
    Создаёт симметричную эллипсоидную голову.
    На уровне z=z_center (экватор):
      - ширина вдоль X: width (полуось a = width / 2)
      - длина вдоль Y: length (полуось b = length / 2)
    Ориентиры:
      - nasion: [0, length/2, 0] (на уровне z=0)
      - tragus_left: [-width/2, 0, 0]
      - tragus_right: [width/2, 0, 0]
    """
    sphere = trimesh.creation.icosphere(subdivisions=subdivisions, radius=1.0)
    v = sphere.vertices.copy()
    v[:, 0] *= width / 2.0
    v[:, 1] *= length / 2.0
    v[:, 2] = v[:, 2] * height_semi + z_center
    mesh = trimesh.Trimesh(vertices=v, faces=sphere.faces, process=False)

    nasion = [0.0, length / 2.0, 0.0]
    tragus_left = [-width / 2.0, 0.0, 0.0]
    tragus_right = [width / 2.0, 0.0, 0.0]

    return mesh, nasion, tragus_left, tragus_right


def _make_flattened_head(
    flatten_mm: float,
    side: str = "right_back",
    width: float = 120.0,
    length: float = 150.0,
    height_semi: float = 65.0,
    z_center: float = 30.0,
    subdivisions: int = 4,
) -> tuple[trimesh.Trimesh, list[float], list[float], list[float]]:
    """
    Эллипсоидная голова с локальным уплощением flatten_mm в затылочной зоне.
    side: "right_back" (правый затылок: x > 25, y < -20)
          "left_back"  (левый затылок:  x < -25, y < -20)
    """
    mesh, nasion, tl, tr = _make_symmetric_head(
        width=width,
        length=length,
        height_semi=height_semi,
        z_center=z_center,
        subdivisions=subdivisions,
    )
    v = mesh.vertices.copy()
    if side == "right_back":
        mask = (v[:, 0] > 25) & (v[:, 1] < -20)
        v[mask, 0] -= flatten_mm
    elif side == "left_back":
        mask = (v[:, 0] < -25) & (v[:, 1] < -20)
        v[mask, 0] += flatten_mm
    mesh_flat = trimesh.Trimesh(vertices=v, faces=mesh.faces, process=False)
    return mesh_flat, nasion, tl, tr


def _rotation_matrix(angle_z_deg: float, angle_x_deg: float) -> np.ndarray:
    az = math.radians(angle_z_deg)
    ax = math.radians(angle_x_deg)
    Rz = np.array(
        [
            [math.cos(az), -math.sin(az), 0],
            [math.sin(az), math.cos(az), 0],
            [0, 0, 1],
        ]
    )
    Rx = np.array(
        [
            [1, 0, 0],
            [0, math.cos(ax), -math.sin(ax)],
            [0, math.sin(ax), math.cos(ax)],
        ]
    )
    return Rz @ Rx


# ─── Тест 1: head_symmetric ──────────────────────────────────────────────────


class TestSymmetricHeadMetrics:
    """Для head_symmetric (длина 150, ширина 120 на уровне экватора)."""

    def test_dimensions_cephalic_index_and_cvai(self):
        mesh, nasion, tl, tr = _make_symmetric_head(
            width=120.0, length=150.0, z_center=30.0
        )
        metrics = compute_head_metrics(mesh, nasion, tl, tr)

        width = metrics["width_mm"]
        length = metrics["length_mm"]
        ci = metrics["cephalic_index"]
        slice_h = metrics["slice_height_mm"]
        cvai_val = metrics["cvai_percent"]
        cva_val = metrics["cva_mm"]

        print(
            f"\n[head_symmetric] slice_z={slice_h} mm, width={width:.2f} mm, length={length:.2f} mm, CI={ci:.2f}%, CVAI={cvai_val:.2f}%"
        )

        # 1. Уровень максимального периметра найден в районе экватора z=30 мм
        assert abs(slice_h - 30.0) <= 2.0, f"Ожидали z ~ 30 мм, получили {slice_h}"

        # 2. Ширина около 120 мм (допуск 2 мм на триангуляцию)
        assert abs(width - 120.0) < 2.0, f"Ожидали ширину ~120 мм, получили {width}"

        # 3. Длина около 150 мм (допуск 2 мм)
        assert abs(length - 150.0) < 2.0, f"Ожидали длину ~150 мм, получили {length}"

        # 4. CI около 80 (допуск 2 процентных пункта: 78% <= CI <= 82%)
        assert abs(ci - 80.0) <= 2.0, f"Ожидали CI ~80%, получили {ci}%"

        # 5. Для симметричной головы CVAI < 1% (идеально близко к 0)
        assert cvai_val < 1.0, (
            f"Для симметричной головы CVAI={cvai_val}% должен быть < 1%"
        )
        assert cva_val < 0.5, (
            f"Для симметричной головы CVA={cva_val} мм должен быть < 0.5 мм"
        )

        # 6. Контур замкнут и не пуст
        contour = np.array(metrics["contour"])
        assert len(contour) >= 20, "Контур должен содержать достаточное число точек"
        assert np.allclose(contour[0], contour[-1]), "Контур должен быть замкнут"


# ─── Тест 2: head_rotated ────────────────────────────────────────────────────


class TestRotatedHeadMetrics:
    """head_rotated с метками: те же значения, что у head_symmetric."""

    def test_rotated_matches_symmetric(self):
        mesh_sym, nasion, tl, tr = _make_symmetric_head(
            width=120.0, length=150.0, z_center=30.0
        )
        res_sym = compute_head_metrics(mesh_sym, nasion, tl, tr)

        # Поворот на 30° вокруг Z и 15° вокруг X
        R = _rotation_matrix(angle_z_deg=30.0, angle_x_deg=15.0)
        T = np.eye(4)
        T[:3, :3] = R

        mesh_rot = mesh_sym.copy()
        mesh_rot.apply_transform(T)

        nasion_r = (R @ np.array(nasion)).tolist()
        tl_r = (R @ np.array(tl)).tolist()
        tr_r = (R @ np.array(tr)).tolist()

        res_rot = compute_head_metrics(mesh_rot, nasion_r, tl_r, tr_r)

        print(
            f"\n[head_symmetric] w={res_sym['width_mm']:.2f}, l={res_sym['length_mm']:.2f}, CI={res_sym['cephalic_index']:.2f}%, CVAI={res_sym['cvai_percent']:.2f}%"
        )
        print(
            f"[head_rotated]   w={res_rot['width_mm']:.2f}, l={res_rot['length_mm']:.2f}, CI={res_rot['cephalic_index']:.2f}%, CVAI={res_rot['cvai_percent']:.2f}%"
        )

        # Разница между исходной и повёрнутой головой должна быть исчезающе мала
        assert abs(res_sym["cephalic_index"] - res_rot["cephalic_index"]) < 0.2
        assert abs(res_sym["cvai_percent"] - res_rot["cvai_percent"]) < 0.2
        assert abs(res_sym["cva_mm"] - res_rot["cva_mm"]) < 0.3
        assert abs(res_sym["width_mm"] - res_rot["width_mm"]) < 0.5
        assert abs(res_sym["length_mm"] - res_rot["length_mm"]) < 0.5


# ─── Тест 3: Диагонали, монотонность CVAI и сторона асимметрии ───────────────


class TestDiagonalsAndAsymmetrySide:
    def test_diagonals_function_structure_and_labels(self):
        mesh, nasion, tl, tr = _make_symmetric_head(z_center=30.0)
        contour = cross_section(mesh, z=30.0)
        diag_a, diag_b, la, lb = diagonals(contour, angle_deg=30.0)

        assert diag_a > 100.0
        assert diag_b > 100.0
        assert "A (" in la
        assert "B (" in lb

        cva_val, cvai_val = cvai(diag_a, diag_b)
        assert cva_val < 0.1
        assert cvai_val < 0.1

    def test_cvai_monotonicity_mild_less_than_moderate(self):
        """Проверка строгой монотонности: CVAI(head_mild) < CVAI(head_moderate)."""
        m_mild, n_mild, tl_mild, tr_mild = _make_flattened_head(
            flatten_mm=5.0, z_center=30.0
        )
        m_mod, n_mod, tl_mod, tr_mod = _make_flattened_head(
            flatten_mm=12.0, z_center=30.0
        )

        res_mild = compute_head_metrics(m_mild, n_mild, tl_mild, tr_mild)
        res_mod = compute_head_metrics(m_mod, n_mod, tl_mod, tr_mod)

        cvai_mild = res_mild["cvai_percent"]
        cvai_mod = res_mod["cvai_percent"]
        cva_mild = res_mild["cva_mm"]
        cva_mod = res_mod["cva_mm"]

        print(
            f"\n[CVAI Monotonicity] mild (5mm): CVAI={cvai_mild:.2f}%, CVA={cva_mild:.2f} mm"
        )
        print(
            f"[CVAI Monotonicity] mod (12mm): CVAI={cvai_mod:.2f}%, CVA={cva_mod:.2f} mm"
        )

        # Строгая монотонность
        assert cvai_mild < cvai_mod, (
            f"Ожидали cvai_mild ({cvai_mild}) < cvai_mod ({cvai_mod})"
        )
        assert cva_mild < cva_mod, (
            f"Ожидали cva_mild ({cva_mild}) < cva_mod ({cva_mod})"
        )

    def test_asymmetry_side_correct_for_right_back_flattening(self):
        """У flatten_right_back более короткая диагональ B (правый затылок)."""
        m_flat_r, n_r, tl_r, tr_r = _make_flattened_head(
            flatten_mm=8.0, side="right_back", z_center=30.0
        )
        res = compute_head_metrics(m_flat_r, n_r, tl_r, tr_r)

        assert res["shorter_diagonal"] == "B", (
            f"Ожидали shorter=B, получили {res['shorter_diagonal']}"
        )
        assert res["longer_diagonal"] == "A", (
            f"Ожидали longer=A, получили {res['longer_diagonal']}"
        )
        assert "Правая задняя зона уплощена" in res["asymmetry_direction"]

    def test_asymmetry_side_correct_for_left_back_flattening(self):
        """У flatten_left_back более короткая диагональ A (левый затылок)."""
        m_flat_l, n_l, tl_l, tr_l = _make_flattened_head(
            flatten_mm=8.0, side="left_back", z_center=30.0
        )
        res = compute_head_metrics(m_flat_l, n_l, tl_l, tr_l)

        assert res["shorter_diagonal"] == "A", (
            f"Ожидали shorter=A, получили {res['shorter_diagonal']}"
        )
        assert res["longer_diagonal"] == "B", (
            f"Ожидали longer=B, получили {res['longer_diagonal']}"
        )
        assert "Левая задняя зона уплощена" in res["asymmetry_direction"]


# ─── Тест 4: Обработка ошибок (пустое сечение, незамкнутый контур) ───────────


class TestHeadMetricsErrors:
    def test_empty_section_raises_value_error(self):
        mesh, _, _, _ = _make_symmetric_head()
        with pytest.raises(ValueError, match="Сечение пусто"):
            cross_section(mesh, z=500.0)

        with pytest.raises(ValueError, match="Сечение пусто"):
            cross_section(mesh, z=-500.0)

    def test_unclosed_contour_hole_raises_value_error(self):
        mesh, _, _, _ = _make_symmetric_head(z_center=30.0)
        v = mesh.vertices
        f = mesh.faces
        hole_mask = (
            (v[f[:, 0], 2] > 28)
            & (v[f[:, 0], 2] < 32)
            & (v[f[:, 0], 0] > 0)
            & (v[f[:, 0], 1] > 0)
        )
        mesh_hole = trimesh.Trimesh(vertices=v, faces=f[~hole_mask], process=False)

        with pytest.raises(ValueError, match="незамкнутый контур"):
            cross_section(mesh_hole, z=30.0)

    def test_invalid_slice_height_range_raises_value_error(self):
        mesh, _, _, _ = _make_symmetric_head()
        with pytest.raises(ValueError, match="z_min .* должен быть меньше z_max"):
            best_slice_height(mesh, z_min=60.0, z_max=20.0)

        with pytest.raises(ValueError, match="step .* строго положительным"):
            best_slice_height(mesh, z_min=20.0, z_max=60.0, step=-1.0)


# ─── Тест 5: Несколько контуров ──────────────────────────────────────────────


class TestMultipleContoursSelection:
    def test_selects_longest_contour(self):
        mesh_main, _, _, _ = _make_symmetric_head(
            width=120.0, length=150.0, z_center=30.0
        )

        artifact = trimesh.creation.icosphere(subdivisions=2, radius=10.0)
        artifact.apply_translation([120.0, 0.0, 30.0])

        combined = mesh_main + artifact
        contour = cross_section(combined, z=30.0)

        w, length, _ = cephalic_index(contour)
        assert abs(w - 120.0) < 2.0
        assert abs(length - 150.0) < 2.0


# ─── Тест 6: Таблица значений для четырёх голов ──────────────────────────────


class TestFourHeadsComparisonTable:
    """Шаг 4: расчет и вывод значений для 4 голов в виде таблицы."""

    def test_calculate_and_display_table(self):
        # 1. head_symmetric (норма)
        m_sym, n_sym, tl_sym, tr_sym = _make_symmetric_head(
            width=120.0, length=150.0, z_center=30.0
        )
        r_sym = compute_head_metrics(m_sym, n_sym, tl_sym, tr_sym)

        # 2. head_rotated (та же симметричная, повёрнутая в пространстве)
        R = _rotation_matrix(angle_z_deg=30.0, angle_x_deg=15.0)
        T = np.eye(4)
        T[:3, :3] = R
        m_rot = m_sym.copy()
        m_rot.apply_transform(T)
        n_rot = (R @ np.array(n_sym)).tolist()
        tl_rot = (R @ np.array(tl_sym)).tolist()
        tr_rot = (R @ np.array(tr_sym)).tolist()
        r_rot = compute_head_metrics(m_rot, n_rot, tl_rot, tr_rot)

        # 3. head_mild (лёгкое уплощение 5 мм)
        m_mild, n_mild, tl_mild, tr_mild = _make_flattened_head(
            flatten_mm=5.0, width=120.0, length=150.0, z_center=30.0
        )
        r_mild = compute_head_metrics(m_mild, n_mild, tl_mild, tr_mild)

        # 4. head_moderate (умеренное уплощение 12 мм)
        m_mod, n_mod, tl_mod, tr_mod = _make_flattened_head(
            flatten_mm=12.0, width=120.0, length=150.0, z_center=30.0
        )
        r_mod = compute_head_metrics(m_mod, n_mod, tl_mod, tr_mod)

        heads = [
            ("head_symmetric", r_sym),
            ("head_rotated", r_rot),
            ("head_mild (flatten=5 mm)", r_mild),
            ("head_moderate (flatten=12 mm)", r_mod),
        ]

        print("\n" + "=" * 120)
        print("HEAD METRICS & CVAI TABLE FOR 4 SYNTHETIC HEADS")
        print("=" * 120)
        print(
            f"{'Head model':<30} | {'z (mm)':<6} | {'W (mm)':<7} | {'L (mm)':<7} | {'CI (%)':<7} | {'Diag A':<7} | {'Diag B':<7} | {'CVA mm':<7} | {'CVAI %':<7} | {'Direction':<22}"
        )
        print("-" * 120)
        for name, r in heads:
            print(
                f"{name:<30} | {r['slice_height_mm']:<6.1f} | {r['width_mm']:<7.1f} | "
                f"{r['length_mm']:<7.1f} | {r['cephalic_index']:<7.2f} | {r['diag_a_mm']:<7.2f} | {r['diag_b_mm']:<7.2f} | "
                f"{r['cva_mm']:<7.2f} | {r['cvai_percent']:<7.2f} | {r['asymmetry_direction'][:22]}"
            )
        print("=" * 120)

        # Базовые проверки
        assert r_sym["cvai_percent"] < 1.0
        assert r_rot["cvai_percent"] < 1.0
        assert r_mild["cvai_percent"] < r_mod["cvai_percent"]


# ─── Тест 7: Проверка дисклеймеров клинических порогов ────────────────────────


class TestClinicalDisclaimer:
    def test_disclaimers_present_and_no_dogmatic_claims(self):
        assert "подтвердить у клиники" in CI_TENTATIVE_REFERENCE["note"]
        assert "подтвердить у клиники" in CVAI_TENTATIVE_REFERENCE["note"]


# ─── Тест 8: FastAPI эндпоинт POST /geometry/head-metrics ─────────────────────


class TestFastApiEndpoint:
    @pytest.fixture
    def client(self):
        from fastapi.testclient import TestClient
        from app.main import app

        return TestClient(app)

    def test_missing_landmarks_returns_422(self, client):
        mock_db = MagicMock()
        mock_table = MagicMock()
        mock_select = MagicMock()
        mock_eq = MagicMock()
        mock_single = MagicMock()

        mock_single.execute.return_value.data = None
        mock_eq.maybe_single.return_value = mock_single
        mock_select.eq.return_value = mock_eq
        mock_table.select.return_value = mock_select
        mock_db.table.return_value = mock_table

        with patch("app.api.geometry.get_supabase", return_value=mock_db):
            resp = client.post(
                "/geometry/head-metrics", json={"scan_id": "test-uuid-123"}
            )
            assert resp.status_code == 422
            detail = resp.json()["detail"]
            assert "Анатомические ориентиры" in detail
            assert "не найдены" in detail

    def test_valid_request_returns_200_with_diagonals_and_cvai(self, client):
        mesh_sym, nasion, tl, tr = _make_symmetric_head(
            width=120.0, length=150.0, z_center=30.0
        )

        mock_db = MagicMock()
        mock_table = MagicMock()
        mock_select = MagicMock()
        mock_eq = MagicMock()
        mock_single = MagicMock()

        mock_single.execute.return_value.data = {
            "nasion": nasion,
            "tragus_left": tl,
            "tragus_right": tr,
        }
        mock_eq.maybe_single.return_value = mock_single
        mock_select.eq.return_value = mock_eq
        mock_table.select.return_value = mock_select
        mock_db.table.return_value = mock_table

        with (
            patch("app.api.geometry.get_supabase", return_value=mock_db),
            patch("app.api.geometry.load_mesh_from_url", return_value=mesh_sym),
        ):
            resp = client.post(
                "/geometry/head-metrics",
                json={
                    "scan_id": "test-uuid-valid",
                    "h_slice": 30.0,
                    "diag_angle_deg": 30.0,
                },
            )
            assert resp.status_code == 200, resp.text
            data = resp.json()
            assert data["slice_height_mm"] == 30.0
            assert abs(data["width_mm"] - 120.0) < 2.0
            assert abs(data["length_mm"] - 150.0) < 2.0
            assert abs(data["cephalic_index"] - 80.0) < 2.0
            assert data["circumference_mm"] > 400.0

            # Новые поля диагоналей и CVAI
            assert "diag_a_mm" in data
            assert "diag_b_mm" in data
            assert "cva_mm" in data
            assert "cvai_percent" in data
            assert data["cvai_percent"] < 1.0
            assert "longer_diagonal" in data
            assert "shorter_diagonal" in data
            assert "asymmetry_direction" in data
            assert "diag_points" in data
            assert "center" in data["diag_points"]
            assert len(data["contour"]) > 10
