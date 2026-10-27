"""
CRUD роутер для Project (краниальные шлемы).

Правило Jude:
Эндпоинты в app/api/ только принимают запрос, вызывают сервис и возвращают ответ.
Вся бизнес-логика и доступ к БД находятся в app/services/project.py.
"""

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status

from app.core.auth import CurrentUser, get_current_user
from app.core.database import get_supabase
from app.schemas.project import (
    ProjectCreate,
    ProjectList,
    ProjectRead,
    ProjectUpdate,
    ProjectVersionRead,
)
from app.services.project import (
    create_initial_project_version_service,
    create_project_service,
    get_project_service,
    get_project_versions_service,
    list_projects_service,
    update_project_service,
)

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=ProjectList)
def list_projects(
    patient_id: Optional[UUID] = Query(
        default=None, description="Фильтр: вернуть только проекты указанного пациента."
    ),
    user: CurrentUser = Depends(get_current_user),
) -> ProjectList:
    """Список проектов, опционально отфильтрованных по patient_id."""
    db = get_supabase()
    return list_projects_service(patient_id=patient_id, db=db)


@router.post("", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
def create_project(payload: ProjectCreate) -> ProjectRead:
    """Создать проект краниального шлема на основе скана головы."""
    db = get_supabase()
    return create_project_service(payload=payload, db=db)


@router.get("/{project_id}", response_model=ProjectRead)
def get_project(project_id: UUID) -> ProjectRead:
    """Получить проект по id."""
    db = get_supabase()
    return get_project_service(project_id=project_id, db=db)


@router.patch("/{project_id}", response_model=ProjectRead)
def update_project(project_id: UUID, payload: ProjectUpdate) -> ProjectRead:
    """Обновить проект (включая current_step и workflow_state)."""
    db = get_supabase()
    return update_project_service(project_id=project_id, payload=payload, db=db)


@router.get("/{project_id}/versions", response_model=List[ProjectVersionRead])
def get_project_versions(project_id: UUID) -> List[ProjectVersionRead]:
    """Получить список версий проекта, отсортированных по дате создания."""
    db = get_supabase()
    return get_project_versions_service(project_id=project_id, db=db)


@router.post(
    "/{project_id}/versions",
    response_model=ProjectVersionRead,
    status_code=status.HTTP_201_CREATED,
)
def create_initial_project_version(project_id: UUID) -> ProjectVersionRead:
    """Создать первую версию проекта, привязав к ней исходный скан."""
    db = get_supabase()
    return create_initial_project_version_service(project_id=project_id, db=db)
