"""
CRUD для Patient — реальные запросы к Supabase.

POST /patients        — создание карточки пациента
GET  /patients        — список пациентов (с пагинацией)
GET  /patients/{id}   — получение одной карточки
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.dependencies.auth import CurrentUser, get_current_user
from app.schemas.patient import PatientCreate, PatientList, PatientRead
from app.services.database import get_supabase

router = APIRouter(prefix="/patients", tags=["patients"])

TABLE = "patients"


@router.post("", response_model=PatientRead, status_code=status.HTTP_201_CREATED)
def create_patient(payload: PatientCreate) -> PatientRead:
    """Создать карточку пациента."""
    db = get_supabase()

    data = {
        "clinic_id": str(payload.clinic_id),
        "anonymized_identifier": payload.anonymized_identifier,
        "side": payload.side,
        "anthropometric_data": payload.anthropometric_data,
    }

    try:
        response = db.table(TABLE).insert(data).execute()
    except Exception as exc:
        # Supabase-py бросает исключение при нарушении UNIQUE-ограничения (код 23505).
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


@router.get("", response_model=PatientList)
def list_patients(
    user: CurrentUser = Depends(get_current_user),
    limit: int = Query(default=20, ge=1, le=100, description="Размер страницы."),
    offset: int = Query(default=0, ge=0, description="Смещение от начала списка."),
) -> PatientList:
    """
    Список пациентов с пагинацией.

    Supabase поддерживает count="exact" — получаем total без второго запроса.
    """
    db = get_supabase()

    try:
        response = (
            db.table(TABLE)
            .select("*", count="exact")
            .range(offset, offset + limit - 1)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))

    total = response.count if response.count is not None else len(response.data)
    items = [PatientRead(**row) for row in response.data]
    return PatientList(items=items, total=total, limit=limit, offset=offset)


@router.get("/{patient_id}", response_model=PatientRead)
def get_patient(patient_id: UUID) -> PatientRead:
    """Получить карточку пациента по id."""
    db = get_supabase()

    try:
        response = (
            db.table(TABLE)
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