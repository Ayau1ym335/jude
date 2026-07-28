"""
Geometry эндпоинты — геодезические кривые и локальное сглаживание mesh.

POST /geometry/geodesic-curve    — построение геодезической кривой по поверхности
    скана через произвольное число опорных 3D-точек.
POST /geometry/apply-smoothing   — локальное Laplacian-сглаживание в зоне
    клика и сохранение результата как новой версии проекта.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import numpy as np

from app.services.geodesic_curve import (
    compute_geodesic_curve_through_points,
    find_nearest_vertex_index,  # используем существующую, не дублируем
)
from app.services.mesh_loader import load_mesh_from_url
from services.local_smoothing import apply_local_laplacian_smoothing
from services.versioning import save_mesh_as_new_version

router = APIRouter(prefix="/geometry", tags=["geometry"])


class GeodesicCurveRequest(BaseModel):
    scan_id: str
    click_points: list[list[float]]


@router.post("/geodesic-curve")
async def geodesic_curve_endpoint(request: GeodesicCurveRequest):
    """
    Строит геодезическую кривую по поверхности скана через опорные 3D-точки.

    - scan_id: UUID скана (из таблицы scans).
    - click_points: список точек [[x,y,z], ...], минимум 2.

    Возвращает {"curve_points": [[x,y,z], ...]} — координаты кривой на поверхности.
    """
    if len(request.click_points) < 2:
        raise HTTPException(
            status_code=422,
            detail="Необходимо минимум 2 опорные точки.",
        )

    try:
        mesh = load_mesh_from_url(request.scan_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Ошибка загрузки mesh: {str(e)}")

    vertex_indices = [find_nearest_vertex_index(mesh, p) for p in request.click_points]

    try:
        curve_points = compute_geodesic_curve_through_points(mesh, vertex_indices)
    except Exception as e:
        raise HTTPException(
            status_code=422,
            detail=f"Не удалось построить кривую: {str(e)}",
        )

    return {"curve_points": curve_points.tolist()}


# ─── POST /geometry/apply-smoothing ──────────────────────────────────────────

class SmoothingRequest(BaseModel):
    scan_id: str
    version_id: str
    center_point: list[float]   # [x, y, z] — 3D-координаты клика
    radius: float = 15.0        # радиус зоны (мм). инженерный ориентир, не провалидирован
    intensity: float = 0.5      # сила сглаживания: 0 = нет, 1 = максимум
    iterations: int = 3         # число итераций Laplacian


@router.post("/apply-smoothing")
async def apply_smoothing_endpoint(request: SmoothingRequest):
    """
    Применяет локальное Laplacian-сглаживание к mesh в зоне вокруг
    указанной 3D-точки, затем сохраняет результат как новую версию проекта.

    Параметры:
    - scan_id:      UUID скана (из таблицы scans)
    - version_id:   UUID родительской версии (parent_version_id)
    - center_point: [x, y, z] — точка центра зоны сглаживания
    - radius:       радиус (мм). 15 мм — инженерный ориентир, не провалидирован
    - intensity:    сила сглаживания [0, 1]
    - iterations:   число итераций

    Возвращает:
        {"new_mesh_url": str, "center_vertex_idx": int, "vertices_moved": int}
    """
    if len(request.center_point) != 3:
        raise HTTPException(
            status_code=422,
            detail="center_point должен содержать ровно 3 элемента [x, y, z].",
        )
    if not (0.0 < request.radius <= 200.0):
        raise HTTPException(
            status_code=422,
            detail="radius должен быть в диапазоне (0, 200] мм.",
        )

    # 1. Загрузить mesh скана
    try:
        mesh = load_mesh_from_url(request.scan_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Ошибка загрузки mesh: {exc}")

    # 2. Найти ближайшую вершину (find_nearest_vertex_index из geodesic_curve.py)
    center_vertex_idx = find_nearest_vertex_index(mesh, request.center_point)

    # 3. Сгладить локально
    try:
        smoothed_mesh = apply_local_laplacian_smoothing(
            mesh,
            center_vertex_idx=center_vertex_idx,
            radius=request.radius,
            intensity=request.intensity,
            iterations=request.iterations,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Не удалось применить сглаживание: {exc}",
        )

    # 4. Сохранить как новую версию
    # Анализ смещения для метаданных ответа
    diff = np.linalg.norm(
        smoothed_mesh.vertices - mesh.vertices, axis=1
    )
    vertices_moved = int((diff > 1e-6).sum())

    try:
        new_mesh_url = save_mesh_as_new_version(
            smoothed_mesh,
            parent_version_id=request.version_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except NotImplementedError as exc:
        raise HTTPException(
            status_code=501,
            detail=f"save_mesh_as_new_version не реализована: {exc}",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Ошибка сохранения версии: {exc}",
        )

    return {
        "new_mesh_url": new_mesh_url,
        "center_vertex_idx": center_vertex_idx,
        "vertices_moved": vertices_moved,
    }
