"""
Pydantic-схемы для анатомических ориентиров головы (head_landmarks).
"""

import math
from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


# Тип для 3D-координаты: список из трёх конечных float
Coords3D = Annotated[
    list[float],
    Field(min_length=3, max_length=3, description="Координаты [x, y, z] в мм"),
]


def _validate_finite_coords(v: list[float]) -> list[float]:
    """Проверяет, что все три координаты — конечные числа (не NaN, не ±Inf)."""
    if len(v) != 3:
        raise ValueError("Координата должна содержать ровно 3 элемента [x, y, z].")
    for i, c in enumerate(v):
        if not isinstance(c, (int, float)):
            raise ValueError(
                f"Координата [{i}] должна быть числом, получено: {type(c).__name__}."
            )
        if not math.isfinite(c):
            raise ValueError(
                f"Координата [{i}] должна быть конечным числом, получено: {c}."
            )
    return [float(c) for c in v]


class LandmarkUpsert(BaseModel):
    """
    Тело запроса PUT /scans/{id}/landmarks.
    Все три точки обязательны.
    """

    nasion: Coords3D = Field(
        ...,
        description="Насион (кончик носа / точка переносицы), [x, y, z] в мм.",
        examples=[[0.0, 75.0, 0.0]],
    )
    tragus_left: Coords3D = Field(
        ...,
        description="Козелок левого уха, [x, y, z] в мм.",
        examples=[[-60.0, 0.0, 0.0]],
    )
    tragus_right: Coords3D = Field(
        ...,
        description="Козелок правого уха, [x, y, z] в мм.",
        examples=[[60.0, 0.0, 0.0]],
    )
    source: Literal["manual", "auto"] = Field(
        default="manual",
        description="Источник меток: 'manual' — поставлены врачом, 'auto' — автооценка PCA.",
    )

    @field_validator("nasion", "tragus_left", "tragus_right", mode="before")
    @classmethod
    def check_finite(cls, v: list) -> list[float]:
        return _validate_finite_coords(list(v))


class LandmarkRead(BaseModel):
    """Ответ API при чтении ориентиров (GET /scans/{id}/landmarks)."""

    id: UUID
    scan_id: UUID
    nasion: list[float]
    tragus_left: list[float]
    tragus_right: list[float]
    source: str
    created_at: datetime

    class Config:
        from_attributes = True
