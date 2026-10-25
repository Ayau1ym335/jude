"""
backend/app/services/mesh_loader.py

Единый сервис загрузки 3D-мешей (STL, OBJ, PLY):
1. Загрузка из локального файла (load_mesh) с проверкой формата и валидности Trimesh.
2. Скачивание скана из Supabase Storage / HTTP во временный файл (download_scan_file_to_tempfile).
3. Полный цикл загрузки по scan_id (load_mesh_from_url).
"""

import os
import tempfile
from pathlib import Path
from typing import Union

import httpx
import trimesh

from app.core.database import get_supabase

SUPPORTED_EXTENSIONS = {".stl", ".obj", ".ply"}


def load_mesh(filepath: Union[str, Path]) -> trimesh.Trimesh:
    """
    Загружает 3D mesh из локального STL, OBJ или PLY файла.

    Args:
        filepath: Путь к файлу.

    Returns:
        trimesh.Trimesh: Загруженный объект полигональной сетки.

    Raises:
        FileNotFoundError: Если файл не найден.
        ValueError: Если формат не поддерживается или меш невалиден.
    """
    path = Path(filepath)
    if not path.exists():
        raise FileNotFoundError(f"Файл не найден: {path}")

    if path.suffix.lower() not in SUPPORTED_EXTENSIONS:
        raise ValueError(
            f"Неподдерживаемый формат файла: {path.suffix}. "
            f"Поддерживаемые форматы: {', '.join(sorted(SUPPORTED_EXTENSIONS))}"
        )

    try:
        mesh = trimesh.load(str(path), force="mesh")
        if not isinstance(mesh, trimesh.Trimesh):
            raise ValueError(f"Не удалось загрузить действительный объект Trimesh из {path}")
        return mesh
    except Exception as e:
        raise ValueError(f"Ошибка при загрузке файла {path}: {e}")


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
