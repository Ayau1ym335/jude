"""
backend/tests/test_rls.py

Тесты для проверки Row Level Security (RLS) и многопользовательской изоляции:
1. Проверка миграций SQL на наличие команд 'enable row level security' для всех таблиц.
2. Проверка наличия изолирующих политик для каждой таблицы данных пациента.
3. Тестирование механизмов аутентификации и авторизации FastAPI (require_role).
"""

from pathlib import Path
from uuid import uuid4

import pytest
from fastapi import HTTPException
from app.core.auth import CurrentUser, require_role


def test_migrations_enable_rls_on_all_critical_tables():
    """Проверяет, что миграции включают RLS на всех таблицах с данными пациентов."""
    migrations_dir = (
        Path(__file__).resolve().parent.parent.parent / "supabase" / "migrations"
    )
    all_sql = "\n".join(
        f.read_text(encoding="utf-8") for f in migrations_dir.glob("*.sql")
    )

    required_tables = [
        "patients",
        "scans",
        "projects",
        "head_measurements",
        "head_landmarks",
        "trim_lines",
    ]

    for table in required_tables:
        expected = f"alter table {table} enable row level security;"
        assert expected in all_sql, (
            f"Таблица '{table}' должна иметь включённый RLS ({expected})"
        )


def test_migrations_contain_clinic_isolation_policies():
    """Проверяет, что в миграциях созданы политики с изоляцией по clinic_id / auth.uid()."""
    migrations_dir = (
        Path(__file__).resolve().parent.parent.parent / "supabase" / "migrations"
    )
    all_sql = "\n".join(
        f.read_text(encoding="utf-8") for f in migrations_dir.glob("*.sql")
    )

    assert "patients_select_own_clinic" in all_sql
    assert "scans_select_own_clinic" in all_sql
    assert "projects_select_own_clinic" in all_sql
    assert "head_measurements_select_own_clinic" in all_sql
    assert "auth.uid()" in all_sql


def test_require_role_allows_authorized_user():
    """Пользователь с правильной ролью проходит проверку require_role."""
    user = CurrentUser(id=uuid4(), email="tech@clinic.ru", role="technician")
    checker = require_role("technician")
    result = checker(user)
    assert result.id == user.id
    assert result.role == "technician"


def test_require_role_rejects_unauthorized_user():
    """Пользователь с неверной ролью получает HTTP 403 Forbidden."""
    user = CurrentUser(id=uuid4(), email="user@clinic.ru", role="technician")
    checker = require_role("admin")
    with pytest.raises(HTTPException) as exc_info:
        checker(user)
    assert exc_info.value.status_code == 403
    assert "Insufficient permissions" in exc_info.value.detail
