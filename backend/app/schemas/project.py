from datetime import datetime
from typing import List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    """
    Тело запроса на создание проекта (POST /projects).

    Проект шлема создаётся на основе уже загруженного и провалидированного скана головы.
    """

    patient_id: UUID = Field(..., description="Пациент, для которого создаётся проект.")
    scan_id: UUID = Field(..., description="Скан, на основе которого ведётся проектирование шлема.")
    helmet_type: Literal["cranial_remolding"] = Field(
        default="cranial_remolding",
        description=(
            "Тип шлема. На MVP всегда 'cranial_remolding' — краниальный ремоделяционный ортез. "
            "Поле заведено как enum сейчас, чтобы не менять контракт API при "
            "добавлении других типов шлемов в будущем."
        ),
    )


class ProjectRead(BaseModel):
    """Ответ API при чтении проекта (GET /projects/{id})."""

    id: UUID
    patient_id: UUID
    scan_id: UUID
    helmet_type: str  # Тип шлема: cranial_remolding и др.
    created_at: datetime
    status: Literal["in_progress", "exported", "manufactured"] = "in_progress"
    # Пополняется при list_projects через join со таблицей scans:
    scan_validation_status: Optional[str] = None

    class Config:
        from_attributes = True


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

    class Config:
        from_attributes = True