"""
CRUD для Project — реальные запросы к Supabase.

POST /projects                        — создание проекта на основе скана
GET  /projects/{id}                   — получение проекта
GET  /projects/{id}/versions          — список версий проекта
"""

from datetime import datetime
from uuid import UUID
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.dependencies.auth import CurrentUser, get_current_user
from pydantic import BaseModel
from app.schemas.project import ProjectCreate, ProjectList, ProjectRead


class ProjectVersionRead(BaseModel):
    """Краткое представление версии проекта (для TrimLinesPanel)."""

    id: UUID
    project_id: UUID
    parent_version_id: Optional[UUID] = None
    mesh_url: str
    author_type: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
from app.services.database import get_supabase

router = APIRouter(prefix="/projects", tags=["projects"])

TABLE = "projects"


@router.get("", response_model=ProjectList)
def list_projects(
    patient_id: Optional[UUID] = Query(
        default=None,
        description="Фильтр: вернуть только проекты указанного пациента."
    ),
    user: CurrentUser = Depends(get_current_user),
) -> ProjectList:
    """Список проектов, опционально отфильтрованных по patient_id."""
    db = get_supabase()

    try:
        query = db.table(TABLE).select("*, scans(validation_status)", count="exact")
        if patient_id is not None:
            query = query.eq("patient_id", str(patient_id))
        response = query.order("created_at", desc=True).execute()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))

    total = response.count if response.count is not None else len(response.data)
    items = []
    for row in response.data:
        # Supabase возвращает join как вложенный объект: row["scans"] = {"validation_status": ...}
        scan_data = row.pop("scans", None)
        scan_status = (
            scan_data.get("validation_status")
            if isinstance(scan_data, dict)
            else None
        )
        project = ProjectRead(**row)
        project.scan_validation_status = scan_status
        items.append(project)
    return ProjectList(items=items, total=total, patient_id=patient_id)


@router.post("", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
def create_project(payload: ProjectCreate) -> ProjectRead:
    """
    Создать проект на основе пациента и скана.

    Проверяем, что скан действительно принадлежит указанному пациенту —
    это логическая проверка, которую одним FK в БД не выразить.
    """
    db = get_supabase()

    # Проверяем существование пациента.
    patient_resp = (
        db.table("patients")
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

    # Проверяем существование скана и принадлежность пациенту.
    scan_resp = (
        db.table("scans")
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
        "afo_type": payload.afo_type,
        "status": "in_progress",
    }

    try:
        response = db.table(TABLE).insert(data).execute()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))

    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Supabase вернул пустой ответ при создании проекта.",
        )

    return ProjectRead(**response.data[0])


@router.get("/{project_id}", response_model=ProjectRead)
def get_project(project_id: UUID) -> ProjectRead:
    """Получить проект по id."""
    db = get_supabase()

    try:
        response = (
            db.table(TABLE)
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


@router.get("/{project_id}/versions", response_model=List[ProjectVersionRead])
def get_project_versions(project_id: UUID) -> List[ProjectVersionRead]:
    """Получить список версий проекта, отсортированных по дате создания."""
    db = get_supabase()

    # Проверяем, что проект существует.
    project_resp = (
        db.table(TABLE)
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
            db.table("project_versions")
            .select("*")
            .eq("project_id", str(project_id))
            .order("created_at", desc=False)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))

    return [ProjectVersionRead(**row) for row in response.data]


@router.post("/{project_id}/versions", response_model=ProjectVersionRead, status_code=status.HTTP_201_CREATED)
def create_initial_project_version(project_id: UUID) -> ProjectVersionRead:
    """Создать первую (базовую) версию проекта, привязав к ней исходный скан."""
    db = get_supabase()

    # 1. Получаем проект
    proj_resp = (
        db.table(TABLE)
        .select("scan_id")
        .eq("id", str(project_id))
        .maybe_single()
        .execute()
    )
    if not proj_resp.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Проект с id={project_id} не найден."
        )

    scan_id = proj_resp.data["scan_id"]

    # 2. Получаем скан (нужен file_url)
    scan_resp = (
        db.table("scans")
        .select("file_url")
        .eq("id", scan_id)
        .maybe_single()
        .execute()
    )
    if not scan_resp.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Скан с id={scan_id} не найден."
        )

    # 3. Вставляем первую версию
    data = {
        "project_id": str(project_id),
        "parent_version_id": None,
        "mesh_url": scan_resp.data["file_url"],
        "author_type": "human",
    }
    try:
        response = db.table("project_versions").insert(data).execute()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))

    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Supabase вернул пустой ответ при создании версии."
        )

    return ProjectVersionRead(**response.data[0])