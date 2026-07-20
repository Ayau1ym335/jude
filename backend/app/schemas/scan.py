from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class ScanCreate(BaseModel):
    """
    Тело запроса на регистрацию метаданных скана (POST /scans).

    Важно: сам файл к этому моменту уже загружен в Storage (chunked upload,
    неделя 3 roadmap) — этот эндпоинт только регистрирует метаданные и связывает
    файл с пациентом. Загрузка файла и регистрация метаданных — разные шаги пайплайна.
    """

    patient_id: UUID = Field(..., description="Пациент, которому принадлежит скан.")
    file_url: str = Field(..., description="URL/путь к файлу в Storage.")
    file_format: Literal["stl", "obj", "ply"] = Field(
        ..., description="Формат файла скана."
    )
    scan_source: Literal["patient_direct", "cast_negative"] = Field(
        ...,
        description=(
            "Тип источника скана. 'cast_negative' — скан гипсового слепка "
            "(потребует инверсии позитив/негатив на Фазе 4). Явный выбор техника "
            "при загрузке — убирает риск автоопределения, отмеченный в roadmap."
        ),
    )


class ValidationError(BaseModel):
    """Один элемент из структурированного списка ошибок валидации mesh."""

    type: str = Field(..., examples=["not_watertight", "multiple_components"])
    message: str = Field(
        ..., examples=["Обнаружены дыры в поверхности скана"]
    )


class ScanRead(BaseModel):
    """Ответ API при чтении скана (GET /scans/{id})."""

    id: UUID
    patient_id: UUID
    uploaded_by: Optional[UUID] = None
    file_url: str
    file_format: Literal["stl", "obj", "ply"]
    scan_source: Literal["patient_direct", "cast_negative"]
    uploaded_at: datetime
    validation_status: Literal["pending", "valid", "invalid"] = "pending"
    validation_errors: Optional[list[ValidationError]] = None

    class Config:
        from_attributes = True