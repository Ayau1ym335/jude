from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field


# Три типа линий PLS (Posterior Leaf Spring).
# Числовые константы в коде (радиус, толщина) — инженерные ориентиры,
# не клинически провалидированные значения.
LineType = Literal["proximal", "ankle", "distal"]


class TrimLineCreate(BaseModel):
    """Тело запроса на сохранение линии обрезки (POST /trim-lines)."""

    version_id: UUID = Field(..., description="ID версии проекта, к которой привязана линия.")
    line_type: LineType = Field(
        ...,
        description=(
            "Тип линии PLS: 'proximal' — проксимальный край, "
            "'ankle' — линия голеностопа, 'distal' — дистальный край."
        ),
    )
    anchor_points: List[List[float]] = Field(
        ...,
        description="Опорные точки кривой в 3D-пространстве (список [x, y, z]).",
    )
    curve_points: List[List[float]] = Field(
        ...,
        description="Интерполированные точки кривой в 3D-пространстве (список [x, y, z]).",
    )


class TrimLineRead(BaseModel):
    """Ответ API при чтении линии обрезки."""

    id: UUID
    version_id: UUID
    line_type: LineType
    geometry_data: Dict[str, Any]
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
