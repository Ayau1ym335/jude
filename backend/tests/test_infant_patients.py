"""
backend/tests/test_infant_patients.py

Тесты для карточки пациента-младенца и проектов краниальных шлемов:
1. Автоматический расчёт возраста младенца в неделях и месяцах на основе birth_date.
2. Поддержка стороны заметок (левое/правое пациента: left, right, both) и клинических заметок (notes).
3. Создание проекта краниального шлема с product_type по умолчанию 'cranial_helmet'.
4. Интеграция с синтетической головой (make_head) для полного цикла проектирования шлема.
5. Проверка RLS: изоляция карточек пациентов между клиниками (пользователь видит только своих).
"""

from datetime import date, datetime, timezone
from unittest.mock import MagicMock
from uuid import uuid4

import trimesh

from app.api.patients import create_patient, list_patients
from app.api.projects import create_project
from app.core.auth import CurrentUser
from app.core.clinical_defaults import (
    HELMET_AGE_MAX_WEEKS,
    HELMET_AGE_MIN_WEEKS,
    HELMET_AGE_OPTIMAL_MAX_WEEKS,
    HELMET_AGE_OPTIMAL_MIN_WEEKS,
)
from app.schemas.patient import (
    PatientCreate,
    PatientRead,
    compute_infant_age,
)
from app.schemas.project import ProjectCreate
from app.services.head_frame import build_head_frame


# ─── Вспомогательная функция синтетической головы младенца ───────────────────


def make_head(
    width: float = 125.0, length: float = 155.0, height: float = 120.0
) -> trimesh.Trimesh:
    """
    Создаёт синтетическую модель головы младенца (эллипсоид в координатах Jude).

    Координаты Jude:
    - origin = nasion
    - плоскость симметрии x = 0
    - ось Y направлена назад к затылку
    - ось Z направлена вверх к макушке
    """
    base = trimesh.creation.icosphere(subdivisions=3, radius=1.0)
    # Масштабируем до клинических размеров головы 5-месячного младенца
    scale = [width / 2.0, length / 2.0, height / 2.0]
    base.apply_scale(scale)
    # Смещаем так, чтобы нос был на origin (x=0, y=0, z=0)
    base.apply_translation([0.0, length / 2.0, 0.0])
    return base


# ─── 1. Тесты автоматического расчёта возраста младенца ─────────────────────


def test_compute_infant_age_newborn():
    """Младенец возрастом 2 недели: 2 недели, 0 месяцев, '2 нед.'."""
    ref_date = date(2026, 10, 26)
    birth_date = date(2026, 10, 12)  # ровно 14 дней назад

    weeks, months, display = compute_infant_age(birth_date, reference_date=ref_date)
    assert weeks == 2
    assert months == 0
    assert display == "2 нед."


def test_compute_infant_age_four_months():
    """Младенец возрастом ~4.5 месяца: 19 недель, 4 месяца, '4 мес. (19 нед.)'."""
    ref_date = date(2026, 10, 26)
    birth_date = date(2026, 6, 11)  # 137 дней

    weeks, months, display = compute_infant_age(birth_date, reference_date=ref_date)
    assert weeks == 19
    assert months == 4
    assert display == "4 мес. (19 нед.)"


def test_compute_infant_age_edge_cases():
    """Проверка граничных условий расчёта возраста: None, будущая дата, строковые форматы."""
    assert compute_infant_age(None) == (None, None, None)

    ref = date(2026, 10, 26)
    # Дата в будущем
    future_date = date(2026, 11, 1)
    weeks, months, display = compute_infant_age(future_date, reference_date=ref)
    assert weeks == 0
    assert months == 0
    assert display == "0 нед."

    # Строковый ISO формат
    weeks_s, months_s, display_s = compute_infant_age(
        "2026-05-26", reference_date="2026-10-26"
    )
    assert months_s == 5
    assert weeks_s == 21
    assert "5 мес." in display_s


def test_clinical_defaults_infant_age_constants():
    """Клинические константы возраста шлема согласованы."""
    assert HELMET_AGE_MIN_WEEKS == 12  # ~3 месяца
    assert HELMET_AGE_MAX_WEEKS == 78  # ~18 месяцев
    assert HELMET_AGE_OPTIMAL_MIN_WEEKS <= HELMET_AGE_OPTIMAL_MAX_WEEKS
    assert HELMET_AGE_MIN_WEEKS <= HELMET_AGE_OPTIMAL_MIN_WEEKS


# ─── 2. Тесты схем карточки пациента-младенца ───────────────────────────────


def test_patient_create_with_infant_fields():
    """PatientCreate сохраняет дату рождения, сторону заметок и клинические примечания."""
    clinic_id = uuid4()
    p = PatientCreate(
        anonymized_identifier="P-2026-0042",
        clinic_id=clinic_id,
        birth_date=date(2026, 5, 1),
        side="left",  # левое пациента (левая сторона деформации)
        notes="Правостороннее уплощение затылка (плагиоцефалия). Преимущественный сон на правом боку.",
    )
    assert p.anonymized_identifier == "P-2026-0042"
    assert p.birth_date == date(2026, 5, 1)
    assert p.side == "left"
    assert "Правостороннее уплощение" in p.notes


def test_patient_read_calculates_age_automatically():
    """PatientRead автоматически вычисляет age_weeks, age_months и age_display из birth_date."""
    record = {
        "id": uuid4(),
        "anonymized_identifier": "P-2026-0042",
        "birth_date": "2026-05-01",
        "side": "right",
        "notes": "Уплощение правого затылка",
        "created_at": datetime.now(timezone.utc),
    }
    patient = PatientRead(**record)
    assert patient.birth_date == date(2026, 5, 1)
    assert patient.side == "right"
    assert patient.age_weeks is not None
    assert patient.age_months is not None
    assert patient.age_display is not None
    assert "нед." in patient.age_display


# ─── 3. Полный сценарий: создание пациента-младенца и проекта шлема ─────────


def test_create_infant_patient_and_cranial_helmet_project():
    """
    Критерий готовности:
    1. Создаём пациента-младенца с birth_date.
    2. Возраст автоматически рассчитывается.
    3. Создаём проект шлема с product_type='cranial_helmet' по умолчанию.
    """
    patient_id = uuid4()
    scan_id = uuid4()
    clinic_id = uuid4()

    mock_db = MagicMock()

    # 1. Мок создания пациента
    created_patient_row = {
        "id": str(patient_id),
        "clinic_id": str(clinic_id),
        "anonymized_identifier": "P-2026-INFANT-1",
        "birth_date": "2026-06-01",
        "side": "left",
        "notes": "Левосторонний затылочный скос",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    patient_insert_res = MagicMock()
    patient_insert_res.data = [created_patient_row]
    patients_table = MagicMock()
    patients_table.insert.return_value.execute.return_value = patient_insert_res

    # Мок проверки пациента
    patient_select_query = MagicMock()
    patient_select_query.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = {
        "id": str(patient_id)
    }

    # Мок проверки скана
    scan_select_query = MagicMock()
    scan_select_query.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = {
        "id": str(scan_id),
        "patient_id": str(patient_id),
        "validation_status": "valid",
    }

    # Мок создания проекта шлема
    project_id = uuid4()
    created_project_row = {
        "id": str(project_id),
        "patient_id": str(patient_id),
        "scan_id": str(scan_id),
        "afo_type": "cranial_remolding",
        "product_type": "cranial_helmet",
        "status": "in_progress",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    project_insert_res = MagicMock()
    project_insert_res.data = [created_project_row]
    projects_table = MagicMock()
    projects_table.insert.return_value.execute.return_value = project_insert_res

    def table_router(table_name):
        if table_name == "patients":
            mock_t = MagicMock()
            mock_t.insert.return_value.execute.return_value = patient_insert_res
            mock_t.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = {
                "id": str(patient_id)
            }
            return mock_t
        elif table_name == "scans":
            return scan_select_query
        elif table_name == "projects":
            return projects_table
        return MagicMock()

    mock_db.table.side_effect = table_router

    from unittest.mock import patch

    with (
        patch("app.api.patients.get_supabase", return_value=mock_db),
        patch("app.services.patient.get_supabase", return_value=mock_db),
        patch("app.api.projects.get_supabase", return_value=mock_db),
        patch("app.services.project.get_supabase", return_value=mock_db),
    ):
        patient_payload = PatientCreate(
            anonymized_identifier="P-2026-INFANT-1",
            clinic_id=clinic_id,
            birth_date=date(2026, 6, 1),
            side="left",
            notes="Левосторонний затылочный скос",
        )
        patient_res = create_patient(patient_payload)
        assert patient_res.id == patient_id
        assert patient_res.anonymized_identifier == "P-2026-INFANT-1"
        assert patient_res.age_weeks is not None
        assert patient_res.age_months is not None
        assert patient_res.age_weeks > 0

        project_payload = ProjectCreate(patient_id=patient_id, scan_id=scan_id)
        project_res = create_project(project_payload)
        assert project_res.id == project_id
        assert project_res.product_type == "cranial_helmet"
        assert project_res.helmet_type == "cranial_remolding"

        # Проверяем, что в базу данных уходит product_type='cranial_helmet'
        call_args = projects_table.insert.call_args[0][0]
        assert call_args["product_type"] == "cranial_helmet"
        assert call_args["patient_id"] == str(patient_id)


# ─── 4. Тест с синтетической головой (make_head) ────────────────────────────


def test_synthetic_infant_head_mesh_processing():
    """
    Проверяет, что синтетическая голова младенца (make_head) корректно
    обрабатывается в системе координат Jude (origin=nasion, плоскость x=0).
    """
    mesh = make_head(width=120.0, length=150.0, height=115.0)
    assert mesh.is_watertight
    assert len(mesh.vertices) > 100

    # Задаём клинические ориентиры для головы младенца
    nasion = [0.0, 0.0, 0.0]
    tragus_l = [-60.0, 65.0, -10.0]  # левое ушко
    tragus_r = [60.0, 65.0, -10.0]  # правое ушко

    origin, R = build_head_frame(
        nasion=nasion, tragus_left=tragus_l, tragus_right=tragus_r
    )
    # Центр козелков симметричен по X
    assert abs(origin[0]) < 1e-4, "Плоскость симметрии головы должна быть x=0"
    assert R.shape == (3, 3)


# ─── 5. Тест Row-Level Security: изоляция пациентов между клиниками ─────────


def test_rls_isolation_patients_multi_tenant():
    """
    RLS-тест:
    Пользователь Клиники A видит только пациентов Клиники A (включая birth_date и notes).
    Пациенты Клиники B недоступны для Клиники A.
    """
    clinic_a_id = uuid4()
    clinic_b_id = uuid4()

    user_a = CurrentUser(id=uuid4(), email="doc_a@clinica.ru", role="technician")
    user_b = CurrentUser(id=uuid4(), email="doc_b@clinicb.ru", role="technician")

    # Записи в БД
    patient_a = {
        "id": str(uuid4()),
        "clinic_id": str(clinic_a_id),
        "anonymized_identifier": "P-CLINIC-A-001",
        "birth_date": "2026-05-10",
        "side": "left",
        "notes": "Пациент клиники А: левостороннее уплощение",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    patient_b = {
        "id": str(uuid4()),
        "clinic_id": str(clinic_b_id),
        "anonymized_identifier": "P-CLINIC-B-001",
        "birth_date": "2026-07-01",
        "side": "right",
        "notes": "Пациент клиники Б: правостороннее уплощение",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    # Имитируем выполнение запроса с RLS-политикой patients_select_own_clinic:
    # Supabase с RLS возвращает только строки, где clinic_id пользователя совпадает
    def create_mock_supabase_for_user(user_clinic_id):
        mock_db = MagicMock()
        query_mock = MagicMock()

        all_patients = [patient_a, patient_b]
        # При включённом RLS PostgreSQL фильтрует по clinic_id пользователя
        filtered_patients = [
            p for p in all_patients if p["clinic_id"] == str(user_clinic_id)
        ]

        query_mock.select.return_value.range.return_value.execute.return_value.data = (
            filtered_patients
        )
        query_mock.select.return_value.range.return_value.execute.return_value.count = (
            len(filtered_patients)
        )

        mock_db.table.return_value = query_mock
        return mock_db

    from unittest.mock import patch

    # 1. Запрос от пользователя Клиники A
    mock_db_a = create_mock_supabase_for_user(clinic_a_id)
    with (
        patch("app.api.patients.get_supabase", return_value=mock_db_a),
        patch("app.services.patient.get_supabase", return_value=mock_db_a),
    ):
        res_a = list_patients(user=user_a, limit=20, offset=0)
        assert res_a.total == 1
        assert res_a.items[0].anonymized_identifier == "P-CLINIC-A-001"
        assert res_a.items[0].side == "left"
        assert res_a.items[0].notes == "Пациент клиники А: левостороннее уплощение"
        assert res_a.items[0].age_weeks is not None
        # Убеждаемся, что пациент Клиники B НЕ попал в ответ
        assert not any(p.anonymized_identifier == "P-CLINIC-B-001" for p in res_a.items)

    # 2. Запрос от пользователя Клиники B
    mock_db_b = create_mock_supabase_for_user(clinic_b_id)
    with (
        patch("app.api.patients.get_supabase", return_value=mock_db_b),
        patch("app.services.patient.get_supabase", return_value=mock_db_b),
    ):
        res_b = list_patients(user=user_b, limit=20, offset=0)
        assert res_b.total == 1
        assert res_b.items[0].anonymized_identifier == "P-CLINIC-B-001"
        assert res_b.items[0].side == "right"
        assert res_b.items[0].notes == "Пациент клиники Б: правостороннее уплощение"
        # Убеждаемся, что пациент Клиники A НЕ попал в ответ
        assert not any(p.anonymized_identifier == "P-CLINIC-A-001" for p in res_b.items)
