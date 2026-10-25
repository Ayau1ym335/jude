"""
Geometry эндпоинты — геодезические кривые и локальная коррекция объёма шлема.

POST /geometry/geodesic-curve    — построение геодезической кривой по поверхности
    скана через произвольное число опорных 3D-точек.
    Используется для trim-линий шлема: вырезы под уши, передний проём, нижний край.
POST /geometry/apply-smoothing   — локальная коррекция объёма в зоне клика:
    «добавить объём» (зазор для роста) или «убрать объём» (выравнивание выступа).
    Сохраняет результат как новую версию проекта.

Примечание: эндпоинт apply-inversion удалён — для шлемов голову сканируют
напрямую, инверсия слепка не требуется.
"""

import asyncio
import functools

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import numpy as np

# Таймаут геодезического вычисления (секунды).
# На сканах >200k граней PyGeodesicAlgorithmExact может занять >3 с;
# без таймаута запрос висит до закрытия TCP-соединения (docs/blockers.md GEO-001).
GEODESIC_TIMEOUT_SEC: float = 25.0

from app.services.geodesic_curve import (
    compute_geodesic_curve_through_points,
    find_nearest_vertex_index,  # используем существующую, не дублируем
)
from app.services.mesh_loader import load_mesh_from_url
from app.services.local_smoothing import apply_local_laplacian_smoothing
from app.services.versioning import save_mesh_as_new_version
from app.core.clinical_defaults import (
    ASYMMETRY_THRESHOLD_MM,
    DEFAULT_DIAG_ANGLE_DEG,
    DEFAULT_STEP_MM,
    DEFAULT_Z_MAX_MM,
    DEFAULT_Z_MIN_MM,
)
from app.core.database import get_supabase
from app.services.asymmetry import compute_asymmetry
from app.services.head_metrics import compute_head_metrics

router = APIRouter(prefix="/geometry", tags=["geometry"])


class GeodesicCurveRequest(BaseModel):
    scan_id: str
    click_points: list[list[float]]


@router.post("/geodesic-curve")
async def geodesic_curve_endpoint(request: GeodesicCurveRequest):
    """
    Строит геодезическую кривую по поверхности скана через опорные 3D-точки.

    Используется для разметки trim-линий шлема: вырезы под уши, передний проём, нижний край.

    - scan_id: UUID скана (из таблицы scans).
    - click_points: список точек [[x,y,z], ...], минимум 2.

    Возвращает {"curve_points": [[x,y,z], ...]} — координаты кривой на поверхности.

    Вычисление выполняется в thread pool (не блокирует event loop) с таймаутом
    GEODESIC_TIMEOUT_SEC секунд.  При превышении возвращает HTTP 504.
    (docs/blockers.md GEO-001)
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

    loop = asyncio.get_event_loop()
    compute_fn = functools.partial(
        compute_geodesic_curve_through_points, mesh, vertex_indices
    )
    try:
        curve_points = await asyncio.wait_for(
            loop.run_in_executor(None, compute_fn),
            timeout=GEODESIC_TIMEOUT_SEC,
        )
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=504,
            detail=(
                f"Вычисление геодезической кривой превысило {GEODESIC_TIMEOUT_SEC:.0f} с. "
                "Скан слишком большой — используйте упрощённый mesh "
                "(trimesh.simplify_quadric_decimation до ~50k граней). "
                "Подробнее: docs/blockers.md GEO-001."
            ),
        )
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
    intensity: float = 0.5      # сила коррекции: 0 = нет, 1 = максимум
    iterations: int = 3         # число итераций Laplacian


@router.post("/apply-smoothing")
async def apply_smoothing_endpoint(request: SmoothingRequest):
    """
    Применяет локальную коррекцию объёма шлема в зоне вокруг указанной 3D-точки,
    затем сохраняет результат как новую версию проекта.

    Логика шлема:
    - В плоских зонах (недостаточный зазор для роста) — добавляем объём (сглаживание
      выравнивает наружу, увеличивая внутренний зазор).
    - В выступающих зонах (высокое давление) — убираем объём (сглаживание
      приближает поверхность к оси).

    Параметры:
    - scan_id:      UUID скана (из таблицы scans)
    - version_id:   UUID родительской версии (parent_version_id)
    - center_point: [x, y, z] — точка центра зоны коррекции
    - radius:       радиус зоны (мм). 15 мм — инженерный ориентир, не провалидирован
    - intensity:    сила коррекции [0, 1]
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


# ─── POST /geometry/asymmetry-map ────────────────────────────────────────────

class AsymmetryRequest(BaseModel):
    scan_id: str
    threshold_mm: float = ASYMMETRY_THRESHOLD_MM  # порог «клинически значимой» асимметрии


@router.post("/asymmetry-map")
async def asymmetry_map_endpoint(request: AsymmetryRequest):
    """
    Вычисляет карту асимметрии головы — подписанное расстояние (мм) до
    зеркально отражённой поверхности для каждой вершины скана.

    Требует заранее сохранённых анатомических ориентиров (PUT /scans/{id}/landmarks).
    Если метки не найдены, возвращает HTTP 422 с понятным сообщением.

    Тело запроса:
      - scan_id:       UUID скана.
      - threshold_mm:  порог значимой асимметрии (мм). По умолчанию 3 мм.
                       Уточнить у клиники перед клиническим использованием.

    Ответ:
      - values:                 list[float]  — подписанное расстояние по вершинам (мм),
                                               порядок соответствует вершинам загруженного mesh.
      - min, max:               float        — диапазон подписанных значений.
      - mean_abs:               float        — средняя абсолютная асимметрия.
      - percent_over_threshold: float        — % вершин с |δ| > threshold_mm.
      - threshold_mm:           float        — использованный порог.
      - vertex_count:           int          — число вершин в mesh.
    """
    db = get_supabase()

    # 1. Загрузить ориентиры из БД
    landmarks_resp = (
        db.table("head_landmarks")
        .select("nasion, tragus_left, tragus_right")
        .eq("scan_id", request.scan_id)
        .maybe_single()
        .execute()
    )

    if landmarks_resp.data is None:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Анатомические ориентиры для скана {request.scan_id} не найдены. "
                "Расставьте метки (насион, левый и правый козелок) через "
                "PUT /scans/{id}/landmarks перед вычислением карты асимметрии."
            ),
        )

    lm = landmarks_resp.data
    nasion: list[float]       = lm["nasion"]
    tragus_left: list[float]  = lm["tragus_left"]
    tragus_right: list[float] = lm["tragus_right"]

    # 2. Загрузить mesh
    try:
        mesh = load_mesh_from_url(request.scan_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Ошибка загрузки mesh: {exc}")

    # 3. Вычислить карту асимметрии
    try:
        result = compute_asymmetry(
            mesh=mesh,
            nasion=nasion,
            tragus_left=tragus_left,
            tragus_right=tragus_right,
            threshold_mm=request.threshold_mm,
        )
    except ValueError as exc:
        # build_head_frame бросает ValueError при коллинеарных точках
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Ошибка вычисления асимметрии: {exc}")

    result["vertex_count"] = len(mesh.vertices)
    return result


# ─── POST /geometry/head-metrics ─────────────────────────────────────────────

class HeadMetricsRequest(BaseModel):
    scan_id: str
    h_slice: float | None = None
    z_min: float = DEFAULT_Z_MIN_MM
    z_max: float = DEFAULT_Z_MAX_MM
    step: float = DEFAULT_STEP_MM
    diag_angle_deg: float = DEFAULT_DIAG_ANGLE_DEG


class DiagPoints(BaseModel):
    center: list[float]
    diag_a: list[list[float]]
    diag_b: list[list[float]]


class HeadMetricsResponse(BaseModel):
    slice_height_mm: float
    width_mm: float
    length_mm: float
    cephalic_index: float
    circumference_mm: float
    diag_a_mm: float
    diag_b_mm: float
    diag_a_label: str
    diag_b_label: str
    diag_angle_deg: float
    cva_mm: float
    cvai_percent: float
    longer_diagonal: str
    shorter_diagonal: str
    asymmetry_direction: str
    diag_points: DiagPoints
    contour: list[list[float]]


@router.post("/head-metrics", response_model=HeadMetricsResponse)
async def head_metrics_endpoint(request: HeadMetricsRequest):
    """
    Вычисляет метрики поперечного сечения головы на уровне h_slice:
      - slice_height_mm: уровень горизонтального сечения z (мм)
      - width_mm:        ширина головы (влево-вправо вдоль оси X, мм)
      - length_mm:       длина головы (вперёд-назад вдоль оси Y, мм)
      - cephalic_index:  цефалический индекс CI = (ширина / длина) * 100 %
      - circumference_mm: окружность головы (периметр контура, мм)
      - diag_a_mm, diag_b_mm: длины диагоналей под углом ±diag_angle от оси Y (мм)
      - cva_mm:          разница диагоналей |A - B| (CVA, мм)
      - cvai_percent:    индекс асимметрии свода черепа |A - B| / min(A, B) * 100 (CVAI, %)
      - longer_diagonal, shorter_diagonal: более длинная и короткая диагональ
      - asymmetry_direction: клинически понятное направление асимметрии (какая сторона уплощена/срезана)
      - diag_points:     координаты центра и концов диагоналей для отрисовки
      - contour:         замкнутый 2D-контур [[x, y], ...] для визуализации

    Если h_slice не задан, уровень определяется автоматически в диапазоне [z_min, z_max]
    как высота максимального периметра.

    Требует заранее сохранённых ориентиров (PUT /scans/{id}/landmarks).
    """
    db = get_supabase()

    # 1. Загрузить ориентиры из БД
    landmarks_resp = (
        db.table("head_landmarks")
        .select("nasion, tragus_left, tragus_right")
        .eq("scan_id", request.scan_id)
        .maybe_single()
        .execute()
    )

    if landmarks_resp.data is None:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Анатомические ориентиры для скана {request.scan_id} не найдены. "
                "Расставьте метки (насион, левый и правый козелок) через "
                "PUT /scans/{id}/landmarks перед вычислением метрик головы."
            ),
        )

    lm = landmarks_resp.data
    nasion: list[float]       = lm["nasion"]
    tragus_left: list[float]  = lm["tragus_left"]
    tragus_right: list[float] = lm["tragus_right"]

    # 2. Загрузить mesh
    try:
        mesh = load_mesh_from_url(request.scan_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Ошибка загрузки mesh: {exc}")

    # 3. Вычислить метрики головы
    try:
        metrics = compute_head_metrics(
            mesh=mesh,
            nasion=nasion,
            tragus_left=tragus_left,
            tragus_right=tragus_right,
            h_slice=request.h_slice,
            z_min=request.z_min,
            z_max=request.z_max,
            step=request.step,
            diag_angle_deg=request.diag_angle_deg,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Ошибка вычисления метрик головы: {exc}")

    return metrics



