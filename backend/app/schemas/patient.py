from datetime import date, datetime
from typing import Any, Literal, Optional, Union
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


def compute_infant_age(
    birth_date: Optional[Union[date, str]],
    reference_date: Optional[Union[date, str, datetime]] = None,
) -> tuple[Optional[int], Optional[int], Optional[str]]:
    """
    Автоматический расчёт возраста младенца в неделях и месяцах.

    В краниальной терапии:
    - Недели (age_weeks): полное число недель (оценка пластичности черепа и открытости родничков).
    - Месяцы (age_months): полные календарные месяцы жизни младенца.
    - display (age_display): человекочитаемый формат ("4 мес. (18 нед.)" или "3 нед.").
    """
    if birth_date is None:
        return None, None, None

    if isinstance(birth_date, str):
        try:
            birth_date = date.fromisoformat(birth_date.split("T")[0])
        except (ValueError, TypeError):
            return None, None, None

    if reference_date is None:
        ref = date.today()
    elif isinstance(reference_date, str):
        try:
            ref = date.fromisoformat(reference_date.split("T")[0])
        except (ValueError, TypeError):
            ref = date.today()
    elif isinstance(reference_date, datetime):
        ref = reference_date.date()
    else:
        ref = reference_date

    if birth_date > ref:
        return 0, 0, "0 нед."

    delta_days = (ref - birth_date).days
    weeks = delta_days // 7

    months = (ref.year - birth_date.year) * 12 + (ref.month - birth_date.month)
    if ref.day < birth_date.day:
        months -= 1
    if months < 0:
        months = 0

    if months >= 1:
        display = f"{months} мес. ({weeks} нед.)"
    else:
        display = f"{weeks} нед."

    return weeks, months, display


class PatientBase(BaseModel):
    """Общие поля карточки пациента-младенца."""

    anonymized_identifier: str = Field(
        ...,
        description="Псевдонимизированный идентификатор пациента, например 'P-2026-0001'. "
        "Никогда не хранить ФИО в открытом виде (раздел 3.4 ТЗ).",
        examples=["P-2026-0001"],
    )
    birth_date: Optional[date] = Field(
        default=None,
        description="Дата рождения младенца (ГГГГ-ММ-ДД). Используется для автоматического расчёта возраста.",
        examples=["2026-06-15"],
    )
    side: Optional[Literal["left", "right", "both"]] = Field(
        default=None,
        description="Сторона патологии / заметок (левое/правое пациента: "
        "'left' — левая сторона пациента, 'right' — правая сторона пациента, 'both' — обе стороны).",
    )
    notes: Optional[str] = Field(
        default=None,
        description="Клинические заметки специалиста (включая заметки по стороне деформации, анамнезу, положению во сне).",
    )
    anthropometric_data: Optional[dict] = Field(
        default=None,
        description="Гибкое поле антропометрических данных: окружность головы, форма черепа и т.д. "
        "Специально jsonb/dict, чтобы не переделывать схему при добавлении новых параметров.",
    )


class PatientCreate(PatientBase):
    """Тело запроса на создание пациента (POST /patients)."""

    clinic_id: Optional[UUID] = Field(
        default=None, description="Клиника, к которой относится пациент."
    )


class PatientRead(PatientBase):
    """Ответ API при чтении пациента (GET /patients, GET /patients/{id})."""

    id: UUID
    clinic_id: Optional[UUID] = None
    created_at: datetime
    age_weeks: Optional[int] = Field(
        default=None,
        description="Возраст младенца в полных неделях (рассчитывается автоматически).",
    )
    age_months: Optional[int] = Field(
        default=None,
        description="Возраст младенца в полных месяцах (рассчитывается автоматически).",
    )
    age_display: Optional[str] = Field(
        default=None,
        description="Человекочитаемый возраст младенца, например '4 мес. (18 нед.)'.",
    )

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="before")
    @classmethod
    def calculate_infant_age_fields(cls, data: Any) -> Any:
        """Автоматический расчёт age_weeks, age_months, age_display при валидации/чтении."""
        if isinstance(data, dict):
            b_date = data.get("birth_date")
            if b_date:
                weeks, months, display = compute_infant_age(b_date)
                data.setdefault("age_weeks", weeks)
                data.setdefault("age_months", months)
                data.setdefault("age_display", display)
        elif hasattr(data, "birth_date"):
            b_date = getattr(data, "birth_date", None)
            if b_date:
                weeks, months, display = compute_infant_age(b_date)
                if getattr(data, "age_weeks", None) is None:
                    setattr(data, "age_weeks", weeks)
                if getattr(data, "age_months", None) is None:
                    setattr(data, "age_months", months)
                if getattr(data, "age_display", None) is None:
                    setattr(data, "age_display", display)
        return data


class PatientList(BaseModel):
    """Обёртка для списка пациентов с пагинацией."""

    items: list[PatientRead]
    total: int
    limit: int
    offset: int
