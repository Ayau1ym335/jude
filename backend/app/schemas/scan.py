from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class ScanCreate(BaseModel):
    """
    Тело запроса на регистрацию метаданных скана (POST /scans).

    Для шлемов: скан головы выполняется напрямую (без гипсовых слепков),
    поэтому поле scan_source зафиксирует технологию съёмки для будущей аналитики.
    Сам файл к этому моменту уже загружен в Storage — этот эндпойнт
    только регистрирует метаданные и связывает файл с пациентом.
    """

    patient_id: UUID = Field(..., description="Пациент, которому принадлежит скан.")
    file_url: str = Field(..., description="URL/путь к файлу в Storage.")
    file_format: Literal["stl", "obj", "ply"] = Field(
        ..., description="Формат файла скана."
    )
    scan_source: Literal["patient_direct", "structured_light", "photogrammetry"] = Field(
        default="patient_direct",
        description=(
            "Технология съёмки: 'patient_direct' — предварительный прямой скан, "
            "'structured_light' — структурированный свет, "
            "'photogrammetry' — фотограмметрия. "
            "Инверсия слепка не требуется — голову сканируют напрямую."
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
    scan_source: str  # Технология съёмки: patient_direct, structured_light, photogrammetry
    uploaded_at: datetime
    validation_status: Literal["pending", "valid", "invalid"] = "pending"
    validation_errors: Optional[list[ValidationError]] = None
    preview_mesh_url: Optional[str] = None
    preview_face_count: Optional[int] = None

    class Config:
        from_attributes = True