"""
Pydantic-схемы для истории измерений головы (head_measurements).

POST /scans/{id}/measurements   — сохранить расчёт текущего скана
GET  /patients/{id}/measurements — список измерений пациента по времени
"""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class HeadMeasurementCreate(BaseModel):
    """
    Тело запроса POST /scans/{id}/measurements.
    Все числовые поля опциональны: если сечение не удалось построить,
    сохраняем только метаданные запроса.
    """

    patient_id: Optional[UUID] = Field(
        None,
        description="UUID пациента, к которому относится измерение. Если не указан, извлекается из скана.",
    )

    # Параметры сечения
    slice_z: Optional[float] = Field(None, description="Высота среза (мм).")
    width_mm: Optional[float] = Field(None, description="Ширина головы (мм).")
    length_mm: Optional[float] = Field(None, description="Длина головы (мм).")
    cephalic_index: Optional[float] = Field(None, description="Цефалический индекс CI (%).")
    circumference_mm: Optional[float] = Field(None, description="Периметр сечения (мм).")

    # Диагонали
    diag_a_mm: Optional[float] = Field(None, description="Диагональ A (мм).")
    diag_b_mm: Optional[float] = Field(None, description="Диагональ B (мм).")
    cva_mm: Optional[float] = Field(None, description="|A - B| — CVA (мм).")
    cvai_percent: Optional[float] = Field(None, description="CVAI (%).")

    # Параметры воспроизводимости
    params: Optional[dict[str, Any]] = Field(
        default=None,
        description=(
            "Параметры расчёта: diag_angle_deg, z_min, z_max, h_slice, auto_slice. "
            "Необходимы для воспроизведения результата при повторном просмотре."
        ),
    )
    algorithm_version: str = Field(
        default="v0.1",
        description="Версия алгоритма head_metrics. При изменении методологии — увеличить.",
    )


class HeadMeasurementRead(BaseModel):
    """Ответ API при чтении одного измерения."""

    id: UUID
    scan_id: UUID
    patient_id: UUID
    measured_at: datetime

    slice_z: Optional[float] = None
    width_mm: Optional[float] = None
    length_mm: Optional[float] = None
    cephalic_index: Optional[float] = None
    circumference_mm: Optional[float] = None

    diag_a_mm: Optional[float] = None
    diag_b_mm: Optional[float] = None
    cva_mm: Optional[float] = None
    cvai_percent: Optional[float] = None

    params: Optional[dict[str, Any]] = None
    algorithm_version: Optional[str] = None

    class Config:
        from_attributes = True


class HeadMeasurementList(BaseModel):
    """Список измерений пациента с метаданными пагинации."""

    items: list[HeadMeasurementRead]
    total: int
    limit: int
    offset: int
