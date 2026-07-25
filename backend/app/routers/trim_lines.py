"""
CRUD для TrimLine — линии обрезки PLS, привязанные к версии проекта.

POST /trim-lines               — сохранить линию обрезки
GET  /trim-lines/{version_id}  — получить все линии для версии
"""

from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from app.schemas.trim_line import TrimLineCreate, TrimLineRead
from app.services.database import get_supabase

router = APIRouter(prefix="/trim-lines", tags=["trim-lines"])

TABLE = "trim_lines"
VALID_LINE_TYPES = {"proximal", "ankle", "distal"}


@router.post("", response_model=TrimLineRead, status_code=status.HTTP_201_CREATED)
def save_trim_line(payload: TrimLineCreate) -> TrimLineRead:
    """
    Сохранить линию обрезки для указанной версии проекта.

    Допустимые значения line_type: 'proximal', 'ankle', 'distal'.
    geometry_data хранится как JSONB: {anchor_points: [...], curve_points: [...]}.
    """
    db = get_supabase()

    # Проверяем существование версии проекта.
    version_resp = (
        db.table("project_versions")
        .select("id")
        .eq("id", str(payload.version_id))
        .maybe_single()
        .execute()
    )
    if version_resp.data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Версия проекта с id={payload.version_id} не найдена.",
        )

    data = {
        "version_id": str(payload.version_id),
        "line_type": payload.line_type,
        "geometry_data": {
            "anchor_points": payload.anchor_points,
            "curve_points": payload.curve_points,
        },
    }

    try:
        response = db.table(TABLE).insert(data).execute()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))

    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Supabase вернул пустой ответ при сохранении линии обрезки.",
        )

    return TrimLineRead(**response.data[0])


@router.get("/{version_id}", response_model=list[TrimLineRead])
def get_trim_lines(version_id: UUID) -> list[TrimLineRead]:
    """
    Получить все линии обрезки для указанной версии проекта.

    Возвращает список (может быть пустым, если линии ещё не размечены).
    """
    db = get_supabase()

    try:
        response = (
            db.table(TABLE)
            .select("*")
            .eq("version_id", str(version_id))
            .order("created_at")
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))

    return [TrimLineRead(**row) for row in response.data]
