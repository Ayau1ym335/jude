from datetime import datetime
from typing import List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    """
    Тело запроса на создание проекта (POST /projects).

    Проект создаётся на основе уже загруженного и провалидированного скана —
    один пациент может иметь несколько проектов (например, левая и правая стопа).
    """

    patient_id: UUID = Field(..., description="Пациент, для которого создаётся проект.")
    scan_id: UUID = Field(..., description="Скан, на основе которого ведётся проектирование.")
    afo_type: Literal["posterior_leaf_spring"] = Field(
        default="posterior_leaf_spring",
        description=(
            "Тип AFO. На MVP всегда 'posterior_leaf_spring' — сознательное "
            "сужение скоупа (см. документ по инструментам PLS). Поле заведено "
            "как enum уже сейчас, чтобы не менять контракт API при добавлении "
            "других типов AFO на Этапе 1."
        ),
    )


class ProjectRead(BaseModel):
    """Ответ API при чтении проекта (GET /projects/{id})."""

    id: UUID
    patient_id: UUID
    scan_id: UUID
    afo_type: Literal["posterior_leaf_spring"]
    created_at: datetime
    status: Literal["in_progress", "exported", "manufactured"] = "in_progress"
    # Пополняется при list_projects через join co таблицей scans:
    scan_validation_status: Optional[str] = None

    class Config:
        from_attributes = True


class ProjectList(BaseModel):
    """Ответ API при получении списка проектов (GET /projects)."""

    items: List[ProjectRead]
    total: int
    patient_id: Optional[UUID] = None