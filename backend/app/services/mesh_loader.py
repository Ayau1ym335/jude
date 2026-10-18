import os
import tempfile
import httpx
import trimesh

from app.services.database import get_supabase
from app.geometry.loader import load_mesh


def download_scan_file_to_tempfile(file_url: str, db=None) -> str:
    """
    Скачивает файл скана (по HTTP или из Supabase Storage бакета 'scan-files')
    во временный файл на диске и возвращает путь к нему.

    Вызывающая сторона несёт ответственность за удаление временного файла
    в блоке finally.
    """
    if db is None:
        db = get_supabase()

    if file_url.startswith("http://") or file_url.startswith("https://"):
        with httpx.Client() as client:
            resp = client.get(file_url)
            resp.raise_for_status()
            file_bytes = resp.content
    else:
        # Путь в бакете Supabase Storage
        file_bytes = db.storage.from_("scan-files").download(file_url)

    ext = os.path.splitext(file_url)[1] or ".stl"

    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        tmp.write(file_bytes)
        return tmp.name


def load_mesh_from_url(scan_id: str) -> trimesh.Trimesh:
    """
    Загружает mesh по scan_id: получает file_url из БД, скачивает файл
    во временный файл и возвращает trimesh.Trimesh.
    """
    db = get_supabase()
    response = (
        db.table("scans")
        .select("file_url")
        .eq("id", str(scan_id))
        .maybe_single()
        .execute()
    )

    if not response.data or not response.data.get("file_url"):
        raise ValueError(f"Скан с ID {scan_id} не найден или не имеет file_url.")

    tmp_path = download_scan_file_to_tempfile(response.data["file_url"], db=db)
    try:
        return load_mesh(tmp_path)
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
