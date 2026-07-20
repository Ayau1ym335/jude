"""
CRUD для Scan — реальные запросы к Supabase.

POST /scans        — регистрация метаданных скана (файл уже загружен в Storage)
GET  /scans/{id}   — получение метаданных и статуса валидации скана

Валидация mesh (Trimesh/Open3D, недели 4) сюда пока НЕ подключена —
эндпоинт только сохраняет метаданные со статусом 'pending'.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies.auth import CurrentUser, get_current_user
from app.schemas.scan import ScanCreate, ScanRead
from app.services.database import get_supabase

router = APIRouter(prefix="/scans", tags=["scans"])

TABLE = "scans"


@router.post("", response_model=ScanRead, status_code=status.HTTP_201_CREATED)
def create_scan(
    payload: ScanCreate,
    user: CurrentUser = Depends(get_current_user),
) -> ScanRead:
    """
    Зарегистрировать метаданные скана.

    FK-ограничение в БД гарантирует целостность patient_id.
    При нарушении FK Supabase вернёт ошибку с кодом 23503, которую
    мы превращаем в понятный HTTP 404 (пациент не найден).
    """
    db = get_supabase()

    data = {
        "patient_id": str(payload.patient_id),
        "uploaded_by": str(user.id),
        "file_url": payload.file_url,
        "file_format": payload.file_format,
        "scan_source": payload.scan_source,
        "validation_status": "pending",
        "validation_errors": None,
    }

    try:
        response = db.table(TABLE).insert(data).execute()
    except Exception as exc:
        msg = str(exc)
        if "23503" in msg or "foreign key" in msg.lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Пациент с id={payload.patient_id} не найден — сначала создайте карточку пациента.",
            )
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=msg)

    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Supabase вернул пустой ответ при создании скана.",
        )

    return ScanRead(**response.data[0])


@router.get("/{scan_id}", response_model=ScanRead)
def get_scan(scan_id: UUID) -> ScanRead:
    """Получить метаданные и статус валидации скана по id."""
    db = get_supabase()

    try:
        response = (
            db.table(TABLE)
            .select("*")
            .eq("id", str(scan_id))
            .maybe_single()
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))

    if response.data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Скан с id={scan_id} не найден.",
        )

    return ScanRead(**response.data)