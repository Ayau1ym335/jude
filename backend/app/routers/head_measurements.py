"""
Эндпоинты для истории измерений головы.

POST /scans/{scan_id}/measurements      — сохранить результат расчёта
GET  /patients/{patient_id}/measurements — список измерений пациента (по времени)
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.dependencies.auth import CurrentUser, get_current_user
from app.schemas.head_measurement import (
    HeadMeasurementCreate,
    HeadMeasurementList,
    HeadMeasurementRead,
)
from app.services.database import get_supabase

# Два префикса — зарегистрируем оба в main.py
router_scans = APIRouter(prefix="/scans", tags=["head_measurements"])
router_patients = APIRouter(prefix="/patients", tags=["head_measurements"])

TABLE = "head_measurements"
SCANS_TABLE = "scans"
PATIENTS_TABLE = "patients"


def _get_scan_or_404(db, scan_id: str) -> dict:
    resp = (
        db.table(SCANS_TABLE)
        .select("id, patient_id")
        .eq("id", scan_id)
        .maybe_single()
        .execute()
    )
    if resp.data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Скан с id={scan_id} не найден.",
        )
    return resp.data


def _assert_patient_exists(db, patient_id: str) -> None:
    resp = (
        db.table(PATIENTS_TABLE)
        .select("id")
        .eq("id", patient_id)
        .maybe_single()
        .execute()
    )
    if resp.data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Пациент с id={patient_id} не найден.",
        )


# ─── POST /scans/{scan_id}/measurements ──────────────────────────────────────

@router_scans.post(
    "/{scan_id}/measurements",
    response_model=HeadMeasurementRead,
    status_code=status.HTTP_201_CREATED,
    summary="Сохранить результат измерения черепа",
)
def create_measurement(
    scan_id: UUID,
    payload: HeadMeasurementCreate,
    user: CurrentUser = Depends(get_current_user),
) -> HeadMeasurementRead:
    """
    Сохраняет результаты расчёта метрик черепа для указанного скана.

    Параметры расчёта (diag_angle_deg, z_min, z_max, h_slice) и версия алгоритма
    записываются в `params` и `algorithm_version` — это позволяет воспроизвести
    результат при повторном просмотре истории.

    Права: требует аутентификации; Supabase RLS ограничивает доступ клиникой пользователя.
    """
    db = get_supabase()
    scan_row = _get_scan_or_404(db, str(scan_id))

    patient_id = str(payload.patient_id) if payload.patient_id else scan_row.get("patient_id")
    if not patient_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="patient_id не указан и не найден в скане.",
        )
    _assert_patient_exists(db, str(patient_id))

    row: dict = {
        "scan_id": str(scan_id),
        "patient_id": str(patient_id),
        "algorithm_version": payload.algorithm_version,
    }

    # Числовые поля — только если не None
    for field in (
        "slice_z", "width_mm", "length_mm", "cephalic_index",
        "circumference_mm", "diag_a_mm", "diag_b_mm", "cva_mm", "cvai_percent",
    ):
        val = getattr(payload, field)
        if val is not None:
            row[field] = val

    if payload.params is not None:
        row["params"] = payload.params

    try:
        resp = db.table(TABLE).insert(row).execute()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Ошибка сохранения измерения: {exc}",
        )

    if not resp.data:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Supabase вернул пустой ответ при сохранении измерения.",
        )

    return HeadMeasurementRead(**resp.data[0])


# ─── GET /patients/{patient_id}/measurements ─────────────────────────────────

@router_patients.get(
    "/{patient_id}/measurements",
    response_model=HeadMeasurementList,
    summary="История измерений черепа пациента",
)
def list_measurements(
    patient_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    limit: int = Query(default=50, ge=1, le=200, description="Размер страницы."),
    offset: int = Query(default=0, ge=0, description="Смещение от начала списка."),
) -> HeadMeasurementList:
    """
    Возвращает список измерений черепа пациента, отсортированный по дате
    (новые сначала). Используется для отображения динамики CI и CVAI.

    RLS Supabase ограничивает выдачу клиникой текущего пользователя.
    """
    db = get_supabase()
    _assert_patient_exists(db, str(patient_id))

    try:
        resp = (
            db.table(TABLE)
            .select("*", count="exact")
            .eq("patient_id", str(patient_id))
            .order("measured_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        )

    total = resp.count if resp.count is not None else len(resp.data)
    items = [HeadMeasurementRead(**row) for row in resp.data]
    return HeadMeasurementList(items=items, total=total, limit=limit, offset=offset)
