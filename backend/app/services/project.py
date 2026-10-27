"""
Сервисный слой для работы с проектами краниальных шлемов (cranial helmets).

Правило архитектуры Jude:
Вся бизнес-логика и доступ к БД инкапсулированы в services.
Роутеры app/api/ только принимают запрос, вызывают сервис и возвращают ответ.
"""

from typing import Any, List, Optional
from uuid import UUID

from fastapi import HTTPException, status

from app.core.database import get_supabase
from app.schemas.project import (
    ProjectCreate,
    ProjectList,
    ProjectRead,
    ProjectUpdate,
    ProjectVersionRead,
)

TABLE = "projects"


def list_projects_service(
    patient_id: Optional[UUID] = None,
    db: Optional[Any] = None,
) -> ProjectList:
    """Список проектов, опционально отфильтрованных по patient_id."""
    supabase = db or get_supabase()

    try:
        query = supabase.table(TABLE).select(
            "*, scans(validation_status)", count="exact"
        )
        if patient_id is not None:
            query = query.eq("patient_id", str(patient_id))
        response = query.order("created_at", desc=True).execute()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))

    total = response.count if response.count is not None else len(response.data)
    items = []
    for row in response.data:
        scan_data = row.pop("scans", None)
        scan_status = (
            scan_data.get("validation_status") if isinstance(scan_data, dict) else None
        )
        project = ProjectRead(**row)
        project.scan_validation_status = scan_status
        items.append(project)
    return ProjectList(items=items, total=total, patient_id=patient_id)


def create_project_service(
    payload: ProjectCreate,
    db: Optional[Any] = None,
) -> ProjectRead:
    """
    Создать проект краниального шлема на основе скана головы и карточки пациента.

    Проверяем, что скан действительно принадлежит указанному пациенту.
    По умолчанию product_type='cranial_helmet'.
    """
    supabase = db or get_supabase()

    # 1. Проверяем существование пациента.
    patient_resp = (
        supabase.table("patients")
        .select("id")
        .eq("id", str(payload.patient_id))
        .maybe_single()
        .execute()
    )
    if patient_resp.data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Пациент с id={payload.patient_id} не найден.",
        )

    # 2. Проверяем существование скана и принадлежность пациенту.
    scan_resp = (
        supabase.table("scans")
        .select("id, patient_id")
        .eq("id", str(payload.scan_id))
        .maybe_single()
        .execute()
    )
    if scan_resp.data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Скан с id={payload.scan_id} не найден.",
        )

    if scan_resp.data["patient_id"] != str(payload.patient_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Указанный скан принадлежит другому пациенту.",
        )

    data = {
        "patient_id": str(payload.patient_id),
        "scan_id": str(payload.scan_id),
        # initial_schem.sql колонка afo_type
        "afo_type": payload.resolved_afo_type,
        "product_type": payload.product_type or "cranial_helmet",
        "status": "in_progress",
    }

    try:
        response = supabase.table(TABLE).insert(data).execute()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))

    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Supabase вернул пустой ответ при создании проекта.",
        )

    return ProjectRead(**response.data[0])


def get_project_service(
    project_id: UUID,
    db: Optional[Any] = None,
) -> ProjectRead:
    """Получить проект по id."""
    supabase = db or get_supabase()

    try:
        response = (
            supabase.table(TABLE)
            .select("*")
            .eq("id", str(project_id))
            .maybe_single()
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))

    if response.data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Проект с id={project_id} не найден.",
        )

    return ProjectRead(**response.data)


def update_project_service(
    project_id: UUID,
    payload: ProjectUpdate,
    db: Optional[Any] = None,
) -> ProjectRead:
    """
    Обновить состояние проекта: текущий шаг мастера (current_step),
    прогресс (workflow_state) или статус.
    """
    supabase = db or get_supabase()

    update_data = {}
    if payload.current_step is not None:
        update_data["current_step"] = payload.current_step
    if payload.workflow_state is not None:
        update_data["workflow_state"] = payload.workflow_state
    if payload.status is not None:
        update_data["status"] = payload.status

    if not update_data:
        return get_project_service(project_id=project_id, db=supabase)

    try:
        response = (
            supabase.table(TABLE)
            .update(update_data)
            .eq("id", str(project_id))
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))

    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Проект с id={project_id} не найден или недоступен для обновления.",
        )

    return ProjectRead(**response.data[0])


def get_project_versions_service(
    project_id: UUID,
    db: Optional[Any] = None,
) -> List[ProjectVersionRead]:
    """Получить список версий проекта, отсортированных по дате создания."""
    supabase = db or get_supabase()

    project_resp = (
        supabase.table(TABLE)
        .select("id")
        .eq("id", str(project_id))
        .maybe_single()
        .execute()
    )
    if project_resp.data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Проект с id={project_id} не найден.",
        )

    try:
        response = (
            supabase.table("project_versions")
            .select("*")
            .eq("project_id", str(project_id))
            .order("created_at", desc=False)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))

    return [ProjectVersionRead(**row) for row in response.data]


def create_initial_project_version_service(
    project_id: UUID,
    db: Optional[Any] = None,
) -> ProjectVersionRead:
    """Создать первую версию проекта, привязав к ней исходный скан головы."""
    supabase = db or get_supabase()

    proj_resp = (
        supabase.table(TABLE)
        .select("scan_id")
        .eq("id", str(project_id))
        .maybe_single()
        .execute()
    )
    if not proj_resp.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Проект с id={project_id} не найден.",
        )

    scan_id = proj_resp.data["scan_id"]

    scan_resp = (
        supabase.table("scans")
        .select("file_url")
        .eq("id", scan_id)
        .maybe_single()
        .execute()
    )
    if not scan_resp.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Скан с id={scan_id} не найден.",
        )

    data = {
        "project_id": str(project_id),
        "parent_version_id": None,
        "mesh_url": scan_resp.data["file_url"],
        "author_type": "human",
    }
    try:
        response = supabase.table("project_versions").insert(data).execute()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))

    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Supabase вернул пустой ответ при создании версии.",
        )

    return ProjectVersionRead(**response.data[0])
