"""
Сервисный слой для работы с пациентами-младенцами (cranial remolding).

Правило архитектуры Jude:
Вся бизнес-логика и доступ к БД инкапсулированы в services.
Роутеры app/api/ только принимают запрос, вызывают сервис и возвращают ответ.
"""

from typing import Any, Optional
from uuid import UUID

from fastapi import HTTPException, status

from app.core.database import get_supabase
from app.schemas.patient import (
    PatientCreate,
    PatientList,
    PatientRead,
    compute_infant_age,
)

TABLE = "patients"

__all__ = [
    "compute_infant_age",
    "create_patient_service",
    "list_patients_service",
    "get_patient_service",
]


def create_patient_service(
    payload: PatientCreate,
    db: Optional[Any] = None,
) -> PatientRead:
    """Создать карточку пациента-младенца в БД."""
    supabase = db or get_supabase()

    data = {
        "clinic_id": str(payload.clinic_id) if payload.clinic_id else None,
        "anonymized_identifier": payload.anonymized_identifier,
        "side": payload.side,
        "birth_date": payload.birth_date.isoformat() if payload.birth_date else None,
        "notes": payload.notes,
        "anthropometric_data": payload.anthropometric_data,
    }

    try:
        response = supabase.table(TABLE).insert(data).execute()
    except Exception as exc:
        msg = str(exc)
        if "23505" in msg or "unique" in msg.lower():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Пациент с идентификатором '{payload.anonymized_identifier}' уже существует.",
            )
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=msg)

    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Supabase вернул пустой ответ при создании пациента.",
        )

    return PatientRead(**response.data[0])


def list_patients_service(
    limit: int = 20,
    offset: int = 0,
    db: Optional[Any] = None,
) -> PatientList:
    """Получить список пациентов с пагинацией и автоматическим расчётом возраста."""
    supabase = db or get_supabase()

    try:
        response = (
            supabase.table(TABLE)
            .select("*", count="exact")
            .range(offset, offset + limit - 1)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))

    total = response.count if response.count is not None else len(response.data)
    items = [PatientRead(**row) for row in response.data]
    return PatientList(items=items, total=total, limit=limit, offset=offset)


def get_patient_service(
    patient_id: UUID,
    db: Optional[Any] = None,
) -> PatientRead:
    """Получить карточку пациента по id с автоматическим расчётом возраста."""
    supabase = db or get_supabase()

    try:
        response = (
            supabase.table(TABLE)
            .select("*")
            .eq("id", str(patient_id))
            .maybe_single()
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))

    if response.data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Пациент с id={patient_id} не найден.",
        )

    return PatientRead(**response.data)
