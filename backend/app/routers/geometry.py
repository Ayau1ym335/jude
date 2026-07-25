"""
Geometry эндпоинты — геодезические кривые и вспомогательные операции с mesh.

POST /geometry/geodesic-curve — построение геодезической кривой по поверхности
    скана через произвольное число опорных 3D-точек.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.geodesic_curve import (
    compute_geodesic_curve_through_points,
    find_nearest_vertex_index,
)
from app.services.mesh_loader import load_mesh_from_url

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
