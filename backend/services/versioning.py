"""
backend/services/versioning.py

Сервис создания новых версий проекта на основе изменённого mesh.

⚠️  СТАТУС: ЗАГЛУШКА — функция save_mesh_as_new_version НЕ ЗАВЕРШЕНА.
    Требует ручной адаптации под Storage API проекта (см. комментарии внутри).

Паттерн Storage взят из backend/app/routers/scans.py строки 132-140:
    db.storage.from_("scans").upload(
        path=storage_path,
        file=file_bytes,
        file_options={"x-upsert": "true"}
    )

Таблица project_versions — поля (из trim_lines.py и projects.py):
    id, project_id, parent_version_id, mesh_url, author_type, created_at
"""

import io
import os
import uuid
import tempfile

import trimesh

from app.services.database import get_supabase


MESH_STORAGE_BUCKET = "scan-files"          # bucket, куда загружаем обработанные mesh
PROCESSED_MESH_PREFIX = "processed"   # префикс пути внутри bucket


def save_mesh_as_new_version(
    mesh: trimesh.Trimesh,
    parent_version_id: str,
    author_type: str = "algorithm",
) -> str:
    """
    Сохраняет mesh как новую версию проекта.
    Возвращает storage path сохранённого файла (mesh_url в project_versions).

    ⚠️  ЗАГЛУШКА — требует ручной адаптации перед использованием в продакшне.

    Parameters
    ----------
    mesh : trimesh.Trimesh
        Обработанный (сглаженный) mesh.
    parent_version_id : str
        UUID родительской версии проекта.
    author_type : str
        Тип автора версии: "algorithm" | "human".

    Returns
    -------
    str
        Storage path в bucket (mesh_url) — используется фронтендом для загрузки.

    ⚠️  TODO ДЛЯ АДАПТАЦИИ:
    1. Уточни у команды: нужно ли создавать запись в project_versions автоматически
       здесь или через отдельный эндпоинт? (сейчас создаём здесь, как атомарную операцию)
    2. Bucket "scans" — корректный? Или нужен отдельный bucket "processed-meshes"?
    3. STL-формат — корректный? Или нужен OBJ/PLY?
    4. Проверь права RLS на таблице project_versions для service key.
    5. Если используется Auth: передавай user_id и добавь его в запись.
    """
    db = get_supabase()

    # ── Шаг 1: Получить project_id из родительской версии ────────────────────
    version_resp = (
        db.table("project_versions")
        .select("id, project_id")
        .eq("id", parent_version_id)
        .maybe_single()
        .execute()
    )
    if version_resp.data is None:
        raise ValueError(
            f"Родительская версия с id={parent_version_id} не найдена."
        )
    project_id = version_resp.data["project_id"]

    # ── Шаг 2: Экспортировать mesh в STL-байты ───────────────────────────────
    new_version_id = str(uuid.uuid4())
    storage_path = f"{PROCESSED_MESH_PREFIX}/{project_id}/{new_version_id}.stl"

    # Экспортируем в байты без записи на диск
    stl_bytes = mesh.export(file_type="stl")

    # ── Шаг 3: Загрузить в Supabase Storage ──────────────────────────────────
    # Паттерн из scans.py строки 132-140
    try:
        db.storage.from_(MESH_STORAGE_BUCKET).upload(
            path=storage_path,
            file=stl_bytes,
            file_options={"x-upsert": "true"},
        )
    except Exception as exc:
        raise RuntimeError(
            f"Ошибка загрузки mesh в Storage ({storage_path}): {exc}"
        ) from exc

    # ── Шаг 4: Вставить запись в project_versions ────────────────────────────
    try:
        insert_resp = (
            db.table("project_versions")
            .insert(
                {
                    "id": new_version_id,
                    "project_id": project_id,
                    "parent_version_id": parent_version_id,
                    "mesh_url": storage_path,
                    "author_type": author_type,
                }
            )
            .execute()
        )
    except Exception as exc:
        raise RuntimeError(
            f"Ошибка записи новой версии в project_versions: {exc}"
        ) from exc

    if not insert_resp.data:
        raise RuntimeError(
            "Supabase вернул пустой ответ при создании записи версии."
        )

    return storage_path
