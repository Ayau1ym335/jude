"""
CRUD для Scan — реальные запросы к Supabase.

POST /scans        — регистрация метаданных скана (файл уже загружен в Storage)
GET  /scans/{id}   — получение метаданных и статуса валидации скана

Валидация mesh (Trimesh/Open3D, недели 4) сюда пока НЕ подключена —
эндпоинт только сохраняет метаданные со статусом 'pending'.
"""

import os
import tempfile
import httpx
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status

from app.dependencies.auth import CurrentUser, get_current_user
from app.schemas.scan import ScanCreate, ScanRead
from app.services.database import get_supabase
from app.geometry.validator import validate_mesh
from app.geometry.messages import VALIDATION_MESSAGES
from app.geometry.preview import create_preview_mesh

router = APIRouter(prefix="/scans", tags=["scans"])

TABLE = "scans"


@router.post("", response_model=ScanRead, status_code=status.HTTP_201_CREATED)
def create_scan(
    payload: ScanCreate,
    background_tasks: BackgroundTasks,
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

    scan_data = response.data[0]
    
    # Шаг 1-5: Запуск валидации в фоне, чтобы не блокировать ответ
    background_tasks.add_task(process_scan_validation, str(scan_data["id"]), scan_data["file_url"])

    return ScanRead(**scan_data)

def process_scan_validation(scan_id: str, file_url: str):
    """
    Фоновая задача для загрузки файла, валидации меша и обновления статуса.
    """
    db = get_supabase()
    validation_status = "valid"
    validation_errors = []
    tmp_path = None
    preview_mesh_url = None
    preview_face_count = None
    
    try:
        # Шаг 2: Скачать файл
        if file_url.startswith("http://") or file_url.startswith("https://"):
            with httpx.Client() as client:
                resp = client.get(file_url)
                resp.raise_for_status()
                file_bytes = resp.content
        else:
            # Считаем, что это путь в бакете 'scan-files' (Supabase Storage)
            file_bytes = db.storage.from_("scan-files").download(file_url)
            
        # Сохраняем во временный файл
        ext = os.path.splitext(file_url)[1]
        if not ext:
            ext = ".stl"
            
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name
            
        # Шаг 3: Запустить validate_mesh()
        result = validate_mesh(tmp_path)
        
        # Шаг 4: Получить valid=True/False
        if not result["valid"]:
            validation_status = "invalid"
            for err in result["errors"]:
                msg = VALIDATION_MESSAGES.get(err, f"Неизвестная ошибка: {err}")
                validation_errors.append({
                    "type": err, 
                    "message": msg
                })
        else:
            # Шаг 4.1: Генерация превью (только для валидных сканов)
            try:
                preview_mesh = create_preview_mesh(tmp_path)
                if preview_mesh is not None:
                    preview_face_count = len(preview_mesh.faces)
                    preview_ext = os.path.splitext(file_url)[1] or ".stl"
                    preview_file_name = f"preview_{scan_id}{preview_ext}"
                    preview_path = f"previews/{preview_file_name}"
                    
                    with tempfile.NamedTemporaryFile(delete=False, suffix=preview_ext) as p_tmp:
                        preview_mesh.export(p_tmp.name)
                        with open(p_tmp.name, "rb") as f:
                            db.storage.from_("scan-files").upload(
                                path=preview_path, 
                                file=f.read(),
                                file_options={"x-upsert": "true"}
                            )
                        os.remove(p_tmp.name)
                    
                    preview_mesh_url = preview_path
            except Exception as e:
                print(f"Ошибка при сохранении превью скана {scan_id}: {e}")
                
    except Exception as e:
        validation_status = "invalid"
        msg = VALIDATION_MESSAGES.get("PROCESSING_ERROR", "Системная ошибка обработки.")
        validation_errors.append({
            "type": "PROCESSING_ERROR",
            "message": f"{msg} Детали: {str(e)}"
        })
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)
            
    # Шаг 5: Обновить таблицу scans
    update_data = {
        "validation_status": validation_status,
        "validation_errors": validation_errors if validation_errors else None
    }
    if preview_mesh_url:
        update_data["preview_mesh_url"] = preview_mesh_url
        update_data["preview_face_count"] = preview_face_count
    
    try:
        db.table(TABLE).update(update_data).eq("id", scan_id).execute()
    except Exception as e:
        print(f"Ошибка обновления статуса валидации для скана {scan_id}: {e}")


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