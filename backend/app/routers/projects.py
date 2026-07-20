"""
CRUD для Project — реальные запросы к Supabase.

POST /projects        — создание проекта на основе скана
GET  /projects/{id}   — получение проекта
"""

from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from app.schemas.project import ProjectCreate, ProjectRead
from app.services.database import get_supabase

router = APIRouter(prefix="/projects", tags=["projects"])

TABLE = "projects"


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