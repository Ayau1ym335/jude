from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class PatientBase(BaseModel):
    """Общие поля, используемые и при создании, и при чтении."""

    anonymized_identifier: str = Field(
        ...,
        description="Псевдонимизированный идентификатор пациента, например 'P-2026-0001'. "
        "Никогда не хранить ФИО в открытом виде (раздел 3.4 ТЗ).",
        examples=["P-2026-0001"],
    )
    side: Optional[Literal["left", "right", "both"]] = Field(
        default=None, description="Сторона, для которой проектируется AFO."
    )
    anthropometric_data: Optional[dict] = Field(
        default=None,
        description="Гибкое поле: рост, вес, размер стопы и т.д. "
        "Специально jsonb/dict, чтобы не переделывать схему при добавлении новых параметров.",
    )


class PatientCreate(PatientBase):
    """Тело запроса на создание пациента (POST /patients)."""

    clinic_id: Optional[UUID] = Field(default=None, description="Клиника, к которой относится пациент.")


class PatientRead(PatientBase):
    """Ответ API при чтении пациента (GET /patients, GET /patients/{id})."""

    id: UUID
    clinic_id: Optional[UUID] = None
    created_at: datetime

    class Config:
        from_attributes = True  # позволяет строить модель из ORM/DB-объекта напрямую


class PatientList(BaseModel):
    """Обёртка для списка пациентов — пагинация заложена сразу (см. риск недели 2 в roadmap)."""

    items: list[PatientRead]
    total: int
    limit: int
    offset: int