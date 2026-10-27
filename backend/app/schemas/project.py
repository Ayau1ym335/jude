from datetime import datetime
from typing import Any, List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ProjectCreate(BaseModel):
    """
    Тело запроса на создание проекта (POST /projects).

    Проект шлема создаётся на основе уже загруженного и провалидированного скана головы.
    """

    patient_id: UUID = Field(..., description="Пациент, для которого создаётся проект.")
    scan_id: UUID = Field(
        ..., description="Скан, на основе которого ведётся проектирование шлема."
    )
    product_type: str = Field(
        default="cranial_helmet",
        description="Тип продукта (на платформе — краниальные шлемы 'cranial_helmet').",
    )
    # Поле в БД называется afo_type (initial_schem.sql стр. 47).
    # Фронтенд передаёт helmet_type="cranial_remolding".
    # Поддерживаем оба поля для обратной совместимости.
    afo_type: Optional[str] = Field(
        default=None,
        description="Тип шлема/ортеза (в БД колонка afo_type).",
    )
    helmet_type: Optional[str] = Field(
        default=None,
        description="Тип шлема (алиас к afo_type).",
    )
    current_step: int = Field(
        default=1,
        ge=1,
        le=6,
        description="Текущий активный шаг мастера проектирования (1-6).",
    )
    workflow_state: Optional[dict] = Field(
        default_factory=dict,
        description="Промежуточный прогресс мастера проектирования шлема.",
    )

    @model_validator(mode="before")
    @classmethod
    def sync_types(cls, data: Any) -> Any:
        if isinstance(data, dict):
            val = data.get("afo_type") or data.get("helmet_type") or "cranial_remolding"
            data.setdefault("afo_type", val)
            data.setdefault("helmet_type", val)
            data.setdefault("product_type", "cranial_helmet")
            data.setdefault("current_step", 1)
        return data

    @property
    def resolved_afo_type(self) -> str:
        return self.afo_type or self.helmet_type or "cranial_remolding"


class ProjectUpdate(BaseModel):
    """
    Тело запроса на обновление проекта (PATCH /projects/{id}).
    Позволяет сохранять текущий шаг мастера и состояние процесса.
    """

    current_step: Optional[int] = Field(
        default=None,
        ge=1,
        le=6,
        description="Текущий шаг процесса (1: Скан, 2: Метки, 3: Анализ, 4: Коррекция, 5: Оболочка, 6: Экспорт).",
    )
    workflow_state: Optional[dict] = Field(
        default=None,
        description="Состояние и промежуточный прогресс шагов мастера.",
    )
    status: Optional[Literal["in_progress", "exported", "manufactured"]] = Field(
        default=None,
        description="Статус жизненного цикла проекта.",
    )


class ProjectRead(BaseModel):
    """Ответ API при чтении проекта (GET /projects/{id})."""

    id: UUID
    patient_id: UUID
    scan_id: UUID
    product_type: str = "cranial_helmet"
    # Колонка в БД — afo_type (initial_schem.sql).
    # Фронтенд читает helmet_type во viewer/page.tsx и afo_type в patients/[id]/page.tsx.
    afo_type: str = "cranial_remolding"
    helmet_type: str = "cranial_remolding"
    current_step: int = Field(
        default=1,
        ge=1,
        le=6,
        description="Текущий сохранённый шаг моделирования шлема.",
    )
    workflow_state: Optional[dict] = Field(
        default_factory=dict,
        description="Данные состояния шагов мастера.",
    )
    created_at: datetime
    status: Literal["in_progress", "exported", "manufactured"] = "in_progress"
    # Пополняется при list_projects через join со таблицей scans:
    scan_validation_status: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="before")
    @classmethod
    def sync_types(cls, data: Any) -> Any:
        if isinstance(data, dict):
            val = data.get("afo_type") or data.get("helmet_type") or "cranial_remolding"
            data.setdefault("afo_type", val)
            data.setdefault("helmet_type", val)
            data.setdefault("product_type", "cranial_helmet")
            if data.get("current_step") is None:
                data["current_step"] = 1
        return data


class ProjectList(BaseModel):
    """Ответ API при получении списка проектов (GET /projects)."""

    items: List[ProjectRead]
    total: int
    patient_id: Optional[UUID] = None


class ProjectVersionRead(BaseModel):
    """Краткое представление версии проекта (для TrimLinesPanel)."""

    id: UUID
    project_id: UUID
    parent_version_id: Optional[UUID] = None
    mesh_url: str
    author_type: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
