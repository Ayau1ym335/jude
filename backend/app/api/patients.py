"""
CRUD роутер для Patient.

Правило Jude:
Эндпоинты в app/api/ только принимают запрос, вызывают сервис и возвращают ответ.
Вся бизнес-логика и доступ к БД находятся в app/services/patient.py.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, Query, status

from app.core.auth import CurrentUser, get_current_user
from app.core.database import get_supabase
from app.schemas.patient import PatientCreate, PatientList, PatientRead
from app.services.patient import (
    create_patient_service,
    get_patient_service,
    list_patients_service,
)

router = APIRouter(prefix="/patients", tags=["patients"])


@router.post("", response_model=PatientRead, status_code=status.HTTP_201_CREATED)
def create_patient(payload: PatientCreate) -> PatientRead:
    """Создать карточку пациента-младенца."""
    db = get_supabase()
    return create_patient_service(payload, db=db)


@router.get("", response_model=PatientList)
def list_patients(
    user: CurrentUser = Depends(get_current_user),
    limit: int = Query(default=20, ge=1, le=100, description="Размер страницы."),
    offset: int = Query(default=0, ge=0, description="Смещение от начала списка."),
) -> PatientList:
    """Список пациентов с пагинацией и автоматическим расчётом возраста."""
    db = get_supabase()
    return list_patients_service(limit=limit, offset=offset, db=db)


@router.get("/{patient_id}", response_model=PatientRead)
def get_patient(patient_id: UUID) -> PatientRead:
    """Получить карточку пациента по id."""
    db = get_supabase()
    return get_patient_service(patient_id, db=db)
