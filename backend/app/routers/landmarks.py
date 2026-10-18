"""
Эндпоинты для анатомических ориентиров головы.

PUT  /scans/{scan_id}/landmarks  — сохранить (upsert) метки
GET  /scans/{scan_id}/landmarks  — получить метки
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies.auth import CurrentUser, get_current_user
from app.schemas.landmark import LandmarkRead, LandmarkUpsert
from app.services.database import get_supabase

router = APIRouter(prefix="/scans", tags=["landmarks"])

TABLE = "head_landmarks"
SCANS_TABLE = "scans"


def _assert_scan_exists(db, scan_id: str) -> None:
    """Бросает HTTP 404, если скан не найден."""
    resp = (
        db.table(SCANS_TABLE)
        .select("id")
        .eq("id", scan_id)
        .maybe_single()
        .execute()
    )
    if resp.data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Скан с id={scan_id} не найден.",
        )


@router.put(
    "/{scan_id}/landmarks",
    response_model=LandmarkRead,
    summary="Сохранить анатомические ориентиры головы (upsert)",
)
def upsert_landmarks(
    scan_id: UUID,
    payload: LandmarkUpsert,
    user: CurrentUser = Depends(get_current_user),
) -> LandmarkRead:
    """
    Сохраняет или обновляет анатомические ориентиры для скана.

    Три точки обязательны:
    - **nasion** — насион (кончик носа / точка переносицы)
    - **tragus_left** — козелок левого уха
    - **tragus_right** — козелок правого уха

    Координаты должны быть конечными числами [x, y, z] в мм.
    Таблица `head_landmarks` имеет ограничение `UNIQUE (scan_id)`,
    поэтому повторный вызов обновляет существующую запись.
    """
    db = get_supabase()
    _assert_scan_exists(db, str(scan_id))

    data = {
        "scan_id": str(scan_id),
        "nasion": payload.nasion,
        "tragus_left": payload.tragus_left,
        "tragus_right": payload.tragus_right,
        "source": payload.source,
    }

    try:
        resp = (
            db.table(TABLE)
            .upsert(data, on_conflict="scan_id")
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Ошибка сохранения ориентиров: {exc}",
        )

    if not resp.data:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Supabase вернул пустой ответ при сохранении ориентиров.",
        )

    return LandmarkRead(**resp.data[0])


@router.get(
    "/{scan_id}/landmarks",
    response_model=LandmarkRead,
    summary="Получить анатомические ориентиры головы",
)
def get_landmarks(scan_id: UUID) -> LandmarkRead:
    """
    Возвращает анатомические ориентиры для скана.
    HTTP 404 если скан не существует или метки ещё не расставлены.
    """
    db = get_supabase()
    _assert_scan_exists(db, str(scan_id))

    try:
        resp = (
            db.table(TABLE)
            .select("*")
            .eq("scan_id", str(scan_id))
            .maybe_single()
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        )

    if resp.data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Ориентиры для скана {scan_id} ещё не расставлены.",
        )

    return LandmarkRead(**resp.data)
