"""
backend/tests/test_projects.py

Тесты для роутера и схем projects:
1. Проверка совместимости полей afo_type и helmet_type в ProjectCreate и ProjectRead.
   В схеме БД (initial_schem.sql) колонка называется afo_type.
   Фронтенд отправляет helmet_type при создании проекта (upload/page.tsx)
   и ожидает helmet_type во viewer/page.tsx, но afo_type в patients/[id]/page.tsx.
2. Проверка, что при POST /projects в БД вставляется именно 'afo_type',
   чтобы избежать ошибки 400 от Supabase.
"""

from datetime import datetime, timezone
from unittest.mock import MagicMock, patch
from uuid import uuid4

from app.api.projects import create_project
from app.schemas.project import ProjectCreate, ProjectRead


def test_project_create_with_helmet_type():
    """Фронтенд присылает helmet_type — схема должна корректно валидировать и синкать afo_type."""
    pid = uuid4()
    sid = uuid4()
    p = ProjectCreate(patient_id=pid, scan_id=sid, helmet_type="cranial_remolding")
    assert p.helmet_type == "cranial_remolding"
    assert p.afo_type == "cranial_remolding"
    assert p.product_type == "cranial_helmet"
    assert p.resolved_afo_type == "cranial_remolding"


def test_project_create_with_afo_type():
    """Скрипты/тесты могут присылать afo_type — схема должна корректно валидировать и синкать helmet_type."""
    pid = uuid4()
    sid = uuid4()
    p = ProjectCreate(patient_id=pid, scan_id=sid, afo_type="posterior_leaf_spring")
    assert p.afo_type == "posterior_leaf_spring"
    assert p.helmet_type == "posterior_leaf_spring"
    assert p.resolved_afo_type == "posterior_leaf_spring"


def test_project_read_from_db_record_with_afo_type_only():
    """Запись из БД содержит только afo_type — ProjectRead должен иметь и afo_type, и helmet_type."""
    record = {
        "id": uuid4(),
        "patient_id": uuid4(),
        "scan_id": uuid4(),
        "afo_type": "cranial_remolding",
        "created_at": datetime.now(timezone.utc),
        "status": "in_progress",
    }
    read = ProjectRead(**record)
    assert read.afo_type == "cranial_remolding"
    assert read.helmet_type == "cranial_remolding"
    assert read.product_type == "cranial_helmet"


def test_create_project_inserts_afo_type_to_db():
    """Роутер create_project должен вставлять afo_type (соответствует initial_schem.sql)."""
    pid = uuid4()
    sid = uuid4()
    payload = ProjectCreate(
        patient_id=pid, scan_id=sid, helmet_type="cranial_remolding"
    )

    mock_db = MagicMock()
    # Mock scans query
    scan_query = MagicMock()
    scan_query.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = {
        "id": str(sid),
        "patient_id": str(pid),
        "validation_status": "valid",
    }

    # Mock projects insert
    insert_result = MagicMock()
    insert_result.data = [
        {
            "id": str(uuid4()),
            "patient_id": str(pid),
            "scan_id": str(sid),
            "afo_type": "cranial_remolding",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "status": "in_progress",
        }
    ]
    projects_table = MagicMock()
    projects_table.insert.return_value.execute.return_value = insert_result

    def table_router(table_name):
        if table_name == "scans":
            return scan_query
        elif table_name == "projects":
            return projects_table
        return MagicMock()

    mock_db.table.side_effect = table_router

    with patch("app.api.projects.get_supabase", return_value=mock_db):
        res = create_project(payload)
        assert res.afo_type == "cranial_remolding"
        assert res.helmet_type == "cranial_remolding"

        # Проверяем, с какими данными был вызван insert
        call_args = projects_table.insert.call_args[0][0]
        assert "afo_type" in call_args, (
            "Вставляемый словарь должен содержать ключ 'afo_type'"
        )
        assert "helmet_type" not in call_args, (
            "Вставляемый словарь НЕ должен содержать 'helmet_type' (нет такой колонки в БД)"
        )
        assert call_args["afo_type"] == "cranial_remolding"


def test_project_current_step_default():
    """По умолчанию проект создаётся на шаге 1 (Скан)."""
    pid = uuid4()
    sid = uuid4()
    p = ProjectCreate(patient_id=pid, scan_id=sid)
    assert p.current_step == 1

    record = {
        "id": uuid4(),
        "patient_id": pid,
        "scan_id": sid,
        "created_at": datetime.now(timezone.utc),
    }
    read = ProjectRead(**record)
    assert read.current_step == 1


def test_update_project_step_and_workflow_state():
    """PATCH /projects/{id} обновляет current_step и сохраняет прогресс шагов."""
    from app.api.projects import update_project
    from app.schemas.project import ProjectUpdate

    proj_id = uuid4()
    pid = uuid4()
    sid = uuid4()

    mock_db = MagicMock()
    updated_row = {
        "id": str(proj_id),
        "patient_id": str(pid),
        "scan_id": str(sid),
        "current_step": 3,
        "workflow_state": {"landmarks_confirmed": True, "analysis_done": True},
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": "in_progress",
    }

    table_mock = MagicMock()
    table_mock.update.return_value.eq.return_value.execute.return_value.data = [
        updated_row
    ]
    mock_db.table.return_value = table_mock

    payload = ProjectUpdate(
        current_step=3,
        workflow_state={"landmarks_confirmed": True, "analysis_done": True},
    )

    with patch("app.api.projects.get_supabase", return_value=mock_db):
        res = update_project(project_id=proj_id, payload=payload)
        assert res.id == proj_id
        assert res.current_step == 3
        assert res.workflow_state["landmarks_confirmed"] is True

        # Проверяем вызов update в Supabase
        call_args = table_mock.update.call_args[0][0]
        assert call_args["current_step"] == 3
        assert call_args["workflow_state"]["analysis_done"] is True
