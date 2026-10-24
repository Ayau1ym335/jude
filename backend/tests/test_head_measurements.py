"""
Тесты для POST /scans/{id}/measurements и GET /patients/{id}/measurements.

Сценарии:
  1. POST сохраняет запись и возвращает HeadMeasurementRead.
  2. GET возвращает список, отсортированный по measured_at DESC.
  3. Тест «улучшение между визитами»:
       - Визит 1: head_moderate (CVAI ~6.83%)
       - Визит 2: head_mild    (CVAI ~2.60%)
     Список должен содержать оба измерения; CVAI уменьшается от визита 1 к визиту 2.
  4. 404 при несуществующем скане.
  5. 404 при несуществующем пациенте (GET).
"""

import sys
import os
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# ─── Синтетические данные двух визитов ───────────────────────────────────────

SCAN_ID = "aaaaaaaa-0000-0000-0000-000000000001"
PATIENT_ID = "bbbbbbbb-0000-0000-0000-000000000001"

# Визит 1: head_moderate (~6.83% CVAI) — ранний визит
VISIT_1_AT = "2026-09-01T10:00:00+00:00"
VISIT_1_ROW = {
    "id": "cccccccc-0000-0000-0000-000000000001",
    "scan_id": SCAN_ID,
    "patient_id": PATIENT_ID,
    "measured_at": VISIT_1_AT,
    "slice_z": 30.0,
    "width_mm": 132.8,
    "length_mm": 166.7,
    "cephalic_index": 79.6,
    "circumference_mm": 470.9,
    "diag_a_mm": 140.28,
    "diag_b_mm": 131.32,
    "cva_mm": 8.96,
    "cvai_percent": 6.83,
    "params": {"diag_angle_deg": 30.0, "z_min": 20.0, "z_max": 60.0},
    "algorithm_version": "v0.1",
}

# Визит 2: head_mild (~2.60% CVAI) — поздний визит (после лечения)
VISIT_2_AT = "2026-10-01T10:00:00+00:00"
VISIT_2_ROW = {
    "id": "cccccccc-0000-0000-0000-000000000002",
    "scan_id": SCAN_ID,
    "patient_id": PATIENT_ID,
    "measured_at": VISIT_2_AT,
    "slice_z": 30.0,
    "width_mm": 133.6,
    "length_mm": 167.3,
    "cephalic_index": 79.8,
    "circumference_mm": 473.1,
    "diag_a_mm": 140.32,
    "diag_b_mm": 136.77,
    "cva_mm": 3.55,
    "cvai_percent": 2.60,
    "params": {"diag_angle_deg": 30.0, "z_min": 20.0, "z_max": 60.0},
    "algorithm_version": "v0.1",
}


def _make_mock_db_for_insert(row_to_return: dict) -> MagicMock:
    """Мок Supabase для POST — вставка одной записи."""
    db = MagicMock()
    table = MagicMock()
    insert_result = MagicMock()
    insert_result.execute.return_value.data = [row_to_return]
    table.insert.return_value = insert_result

    # _assert_scan_exists: вернуть скан
    scan_select = MagicMock()
    scan_select.execute.return_value.data = {"id": SCAN_ID}
    scan_eq = MagicMock()
    scan_eq.maybe_single.return_value = scan_select

    # _assert_patient_exists: вернуть пациента
    patient_select = MagicMock()
    patient_select.execute.return_value.data = {"id": PATIENT_ID}
    patient_eq = MagicMock()
    patient_eq.maybe_single.return_value = patient_select

    check_select = MagicMock()
    check_select.eq.side_effect = lambda col, val: (
        scan_eq if col == "id" and val == SCAN_ID else patient_eq
    )

    table.select.return_value = check_select
    db.table.return_value = table
    return db


def _make_mock_db_for_list(rows: list[dict], count: int) -> MagicMock:
    """Мок Supabase для GET /patients/{id}/measurements."""
    db = MagicMock()
    table = MagicMock()

    # _assert_patient_exists
    exist_sel = MagicMock()
    exist_sel.execute.return_value.data = {"id": PATIENT_ID}
    exist_eq = MagicMock()
    exist_eq.maybe_single.return_value = exist_sel

    # list query
    list_result = MagicMock()
    list_result.execute.return_value.data = rows
    list_result.execute.return_value.count = count

    list_range = MagicMock()
    list_range.execute = list_result.execute

    list_order = MagicMock()
    list_order.range.return_value = list_range

    list_eq_inner = MagicMock()
    list_eq_inner.order.return_value = list_order

    list_select = MagicMock()
    list_select.eq.return_value = list_eq_inner

    # Route .select() based on whether it contains 'count' (list) or not (exists check)
    call_count = [0]

    def table_select_side_effect(*args, **kwargs):
        call_count[0] += 1
        if call_count[0] == 1:
            # first call: patient existence check
            result = MagicMock()
            result.eq.return_value = exist_eq
            return result
        else:
            # second call: actual list query
            return list_select

    table.select.side_effect = table_select_side_effect
    db.table.return_value = table
    return db


# ─── Тест 1: POST сохраняет визит и возвращает HeadMeasurementRead ───────────

class TestCreateMeasurement:
    @pytest.fixture
    def client(self):
        from fastapi.testclient import TestClient
        from app.main import app
        from app.dependencies.auth import get_current_user, CurrentUser
        from uuid import UUID

        app.dependency_overrides[get_current_user] = lambda: CurrentUser(
            id=UUID("00000000-0000-0000-0000-000000000001"),
            email="doctor@clinic.com",
            role="clinician",
        )
        yield TestClient(app)
        app.dependency_overrides.clear()

    def test_save_visit_1_moderate_head(self, client):
        """
        Шаг 5: визит 1 (head_moderate, CVAI ~6.83%).
        POST /scans/{id}/measurements должен вернуть 201 с сохранёнными данными.
        """
        mock_db = _make_mock_db_for_insert(VISIT_1_ROW)

        with patch("app.routers.head_measurements.get_supabase", return_value=mock_db):
            resp = client.post(
                f"/scans/{SCAN_ID}/measurements",
                json={
                    "patient_id": PATIENT_ID,
                    "slice_z": VISIT_1_ROW["slice_z"],
                    "width_mm": VISIT_1_ROW["width_mm"],
                    "length_mm": VISIT_1_ROW["length_mm"],
                    "cephalic_index": VISIT_1_ROW["cephalic_index"],
                    "circumference_mm": VISIT_1_ROW["circumference_mm"],
                    "diag_a_mm": VISIT_1_ROW["diag_a_mm"],
                    "diag_b_mm": VISIT_1_ROW["diag_b_mm"],
                    "cva_mm": VISIT_1_ROW["cva_mm"],
                    "cvai_percent": VISIT_1_ROW["cvai_percent"],
                    "params": VISIT_1_ROW["params"],
                    "algorithm_version": "v0.1",
                },
                headers={"Authorization": "Bearer test-token"},
            )

        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["cvai_percent"] == pytest.approx(6.83, abs=0.01)
        assert data["cva_mm"] == pytest.approx(8.96, abs=0.01)
        assert data["algorithm_version"] == "v0.1"
        assert "params" in data
        assert data["params"]["diag_angle_deg"] == 30.0

    def test_save_visit_2_mild_head(self, client):
        """
        Шаг 5: визит 2 (head_mild, CVAI ~2.60%).
        POST /scans/{id}/measurements должен вернуть 201 с улучшенными показателями.
        """
        mock_db = _make_mock_db_for_insert(VISIT_2_ROW)

        with patch("app.routers.head_measurements.get_supabase", return_value=mock_db):
            resp = client.post(
                f"/scans/{SCAN_ID}/measurements",
                json={
                    "patient_id": PATIENT_ID,
                    "slice_z": VISIT_2_ROW["slice_z"],
                    "cvai_percent": VISIT_2_ROW["cvai_percent"],
                    "cva_mm": VISIT_2_ROW["cva_mm"],
                    "algorithm_version": "v0.1",
                },
                headers={"Authorization": "Bearer test-token"},
            )

        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["cvai_percent"] == pytest.approx(2.60, abs=0.01)

    def test_missing_scan_returns_404(self, client):
        """Несуществующий scan_id → 404."""
        mock_db = MagicMock()
        table = MagicMock()
        sel = MagicMock()
        eq = MagicMock()
        eq.maybe_single.return_value.execute.return_value.data = None
        sel.eq.return_value = eq
        table.select.return_value = sel
        mock_db.table.return_value = table

        with patch("app.routers.head_measurements.get_supabase", return_value=mock_db):
            resp = client.post(
                f"/scans/00000000-dead-beef-0000-000000000000/measurements",
                json={"patient_id": PATIENT_ID},
                headers={"Authorization": "Bearer test-token"},
            )

        assert resp.status_code == 404

    def test_unauthenticated_returns_403_or_401(self):
        """Без токена — 401 или 403."""
        from fastapi.testclient import TestClient
        from app.main import app
        from app.dependencies.auth import get_current_user

        app.dependency_overrides.pop(get_current_user, None)
        client = TestClient(app)
        resp = client.post(
            f"/scans/{SCAN_ID}/measurements",
            json={"patient_id": PATIENT_ID},
        )
        assert resp.status_code in (401, 403)


# ─── Тест 2: GET /patients/{id}/measurements ──────────────────────────────────

class TestListMeasurements:
    @pytest.fixture
    def client(self):
        from fastapi.testclient import TestClient
        from app.main import app
        from app.dependencies.auth import get_current_user, CurrentUser
        from uuid import UUID

        app.dependency_overrides[get_current_user] = lambda: CurrentUser(
            id=UUID("00000000-0000-0000-0000-000000000001"),
            email="doctor@clinic.com",
            role="clinician",
        )
        yield TestClient(app)
        app.dependency_overrides.clear()

    def test_list_returns_both_visits_sorted_desc(self, client):
        """
        Шаг 5: получить два визита — более поздний (visit_2, mild) первым.
        GET /patients/{id}/measurements должен вернуть список в порядке DESC.
        """
        # DESC: визит 2 (октябрь) → визит 1 (сентябрь)
        rows = [VISIT_2_ROW, VISIT_1_ROW]
        mock_db = _make_mock_db_for_list(rows, count=2)

        with patch("app.routers.head_measurements.get_supabase", return_value=mock_db):
            resp = client.get(
                f"/patients/{PATIENT_ID}/measurements",
                headers={"Authorization": "Bearer test-token"},
            )

        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["total"] == 2
        items = data["items"]
        assert len(items) == 2

        # Первый элемент — visit_2 (mild, CVAI меньше)
        assert items[0]["cvai_percent"] == pytest.approx(2.60, abs=0.01)
        # Второй элемент — visit_1 (moderate, CVAI больше)
        assert items[1]["cvai_percent"] == pytest.approx(6.83, abs=0.01)

    def test_improvement_monotonicity(self, client):
        """
        Тест «улучшение между визитами»:
        CVAI(визит 2, mild) < CVAI(визит 1, moderate).
        Это подтверждает, что динамика CVAI по дате убывающая (снижение асимметрии).
        """
        rows = [VISIT_2_ROW, VISIT_1_ROW]  # сортировка DESC по measured_at
        mock_db = _make_mock_db_for_list(rows, count=2)

        with patch("app.routers.head_measurements.get_supabase", return_value=mock_db):
            resp = client.get(
                f"/patients/{PATIENT_ID}/measurements",
                headers={"Authorization": "Bearer test-token"},
            )

        data = resp.json()
        items = data["items"]

        # Сортируем по measured_at ASC (хронологически) для проверки тренда
        sorted_items = sorted(items, key=lambda x: x["measured_at"])

        cvai_visit1 = sorted_items[0]["cvai_percent"]   # moderate ~6.83%
        cvai_visit2 = sorted_items[1]["cvai_percent"]   # mild     ~2.60%

        assert cvai_visit2 < cvai_visit1, (
            f"Ожидали снижения CVAI: CVAI(визит2={cvai_visit2:.2f}%) < "
            f"CVAI(визит1={cvai_visit1:.2f}%). График должен показывать улучшение."
        )

    def test_missing_patient_returns_404(self, client):
        """Несуществующий patient_id → 404."""
        mock_db = MagicMock()
        table = MagicMock()
        sel = MagicMock()
        eq = MagicMock()
        eq.maybe_single.return_value.execute.return_value.data = None
        sel.eq.return_value = eq
        table.select.return_value = sel
        mock_db.table.return_value = table

        with patch("app.routers.head_measurements.get_supabase", return_value=mock_db):
            resp = client.get(
                f"/patients/00000000-dead-beef-0000-000000000000/measurements",
                headers={"Authorization": "Bearer test-token"},
            )

        assert resp.status_code == 404

    def test_empty_list_for_new_patient(self, client):
        """Новый пациент без измерений → пустой список, total=0."""
        mock_db = _make_mock_db_for_list([], count=0)

        with patch("app.routers.head_measurements.get_supabase", return_value=mock_db):
            resp = client.get(
                f"/patients/{PATIENT_ID}/measurements",
                headers={"Authorization": "Bearer test-token"},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["items"] == []
