"""
Метрики формы головы и оценка асимметрии (Head Metrics & Cranial Vault Asymmetry Index).

Клиническая логика:
- Оценка формы черепа основана на поперечном горизонтальном сечении на уровне
  максимальной окружности головы (в полосе над бровями / над плоскостью козелков).
- Для первой версии: сечение на высоте h_slice над плоскостью козелков (z = const в СК головы).
  h_slice настраивается или подбирается автоматически как уровень максимального периметра
  в клиническом диапазоне (по умолчанию 20–60 мм над плоскостью козелков).
- Длина = максимальная протяжённость сечения вдоль оси Y (вперёд-назад).
- Ширина = максимальная протяжённость сечения вдоль оси X (вправо-влево).
- Цефалический индекс: CI = (Ширина / Длина) × 100 %.
- Диагонали сечения: A (влево-назад / вправо-вперёд) и B (вправо-назад / влево-вперёд).
  Измеряются под углом ±diag_angle (по умолчанию 30°, настраивается) от оси Y (вперёд).
- CVA = |A − B| (мм).
- CVAI = |A − B| / min(A, B) × 100 %.
"""

import math
import warnings
import numpy as np
from shapely.geometry import Polygon, LineString
import trimesh

from app.services.head_frame import build_head_frame, to_head_frame

# ─── Клинические константы из централизованного модуля ─────────────────────────
from app.core.clinical_defaults import (
    DEFAULT_Z_MIN_MM,
    DEFAULT_Z_MAX_MM,
    DEFAULT_STEP_MM,
    DEFAULT_DIAG_ANGLE_DEG,
    CI_TENTATIVE_REFERENCE,
    CVAI_TENTATIVE_REFERENCE,
)


def contour_perimeter(contour: np.ndarray) -> float:
    """
    Вычисляет периметр замкнутого 2D-контура в мм.
    Если последняя точка не совпадает с первой, добавляет замыкающий отрезок.
    """
    pts = np.asarray(contour, dtype=float)
    if len(pts) < 2:
        return 0.0
    diffs = np.diff(pts, axis=0)
    perim = float(np.sum(np.linalg.norm(diffs, axis=1)))
    if not np.allclose(pts[0], pts[-1]):
        perim += float(np.linalg.norm(pts[0] - pts[-1]))
    return perim


def cross_section(mesh_head_frame: trimesh.Trimesh, z: float) -> np.ndarray:
    """
    Сечение плоскостью z = const в системе координат головы.

    Возвращает замкнутый контур как массив (N, 2) в осях X, Y,
    выбирая самую длинную замкнутую кривую, если их несколько (например, при наличии ушей).

    Raises:
        ValueError: если сечение пусто (уровень вне головы),
                    или содержит только незамкнутые контуры (скан с дырой).
    """
    z_val = float(z)

    # 1. Построение 3D-сечения плоскостью z = const
    section = mesh_head_frame.section(
        plane_origin=[0.0, 0.0, z_val],
        plane_normal=[0.0, 0.0, 1.0],
    )
    if section is None:
        raise ValueError(
            f"Сечение пусто: уровень z={z_val:.1f} мм вне модели головы. "
            "Проверьте правильность ориентиров и диапазон высот."
        )

    # 2. Перевод в 2D-плоскость
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", DeprecationWarning)
        path2d, _ = section.to_planar()

    if path2d is None or len(path2d.entities) == 0:
        raise ValueError(
            f"Сечение пусто: на высоте z={z_val:.1f} мм нет пересечений с поверхностью."
        )

    # 3. Проверка замкнутости контуров
    closed_curves = path2d.discrete
    if len(closed_curves) == 0:
        raise ValueError(
            f"Сечение на уровне z={z_val:.1f} мм содержит незамкнутый контур "
            "(скан с дырой или срез проходит через край сетки). "
            "Заполните отверстия в скане или выберите другой уровень сечения."
        )

    # 4. Выбор самого длинного замкнутого контура по периметру
    best_contour = max(closed_curves, key=contour_perimeter)
    contour = np.asarray(best_contour, dtype=float)

    if len(contour) < 3:
        raise ValueError(
            f"Сечение на уровне z={z_val:.1f} мм вырождено (содержит менее 3 точек)."
        )

    # Убеждаемся, что контур явно замкнут (последняя точка равна первой)
    if not np.allclose(contour[0], contour[-1]):
        contour = np.vstack([contour, contour[0]])

    return contour


def best_slice_height(
    mesh_head_frame: trimesh.Trimesh,
    z_min: float = DEFAULT_Z_MIN_MM,
    z_max: float = DEFAULT_Z_MAX_MM,
    step: float = DEFAULT_STEP_MM,
) -> float:
    """
    Находит высоту z в диапазоне [z_min, z_max] с шагом step,
    где периметр поперечного сечения головы максимален (максимальная окружность).

    Raises:
        ValueError: если параметры диапазона некорректны или ни на одном уровне
                    не удалось получить корректное замкнутое сечение.
    """
    if z_min >= z_max:
        raise ValueError(
            f"Некорректный диапазон поиска высоты: z_min ({z_min}) должен быть меньше z_max ({z_max})."
        )
    if step <= 0:
        raise ValueError(f"Шаг сканирования step ({step}) должен быть строго положительным.")

    z_levels = np.arange(z_min, z_max + 1e-6, step)
    best_z: float | None = None
    max_perimeter: float = -1.0
    errors: list[str] = []

    for z in z_levels:
        try:
            contour = cross_section(mesh_head_frame, z=float(z))
            p = contour_perimeter(contour)
            if p > max_perimeter:
                max_perimeter = p
                best_z = float(z)
        except ValueError as err:
            errors.append(f"z={z:.1f} мм: {err}")

    if best_z is None:
        raise ValueError(
            f"Не удалось найти корректное замкнутое сечение головы в диапазоне "
            f"z=[{z_min:.1f}, {z_max:.1f}] мм. "
            f"Ошибки: {'; '.join(errors[:3])}"
        )

    return best_z


def cephalic_index(contour: np.ndarray) -> tuple[float, float, float]:
    """
    Вычисляет ширину, длину и цефалический индекс (CI) по замкнутому 2D-контуру.

    Оси:
      - X (contour[:, 0]): ширина (влево-вправо между ушами);
      - Y (contour[:, 1]): длина (вперёд-назад от носа к затылку).

    Returns:
        (width_mm, length_mm, cephalic_index)
        где cephalic_index = (width / length) * 100.0.
    """
    pts = np.asarray(contour, dtype=float)
    if len(pts) < 3 or pts.ndim != 2 or pts.shape[1] < 2:
        raise ValueError("Контур должен быть двумерным массивом формы (N, 2) с N >= 3.")

    width = float(pts[:, 0].max() - pts[:, 0].min())
    length = float(pts[:, 1].max() - pts[:, 1].min())

    if length <= 1e-6:
        raise ValueError(f"Длина сечения вырождена ({length:.3f} мм). Невозможно рассчитать CI.")
    if width <= 1e-6:
        raise ValueError(f"Ширина сечения вырождена ({width:.3f} мм). Невозможно рассчитать CI.")

    ci = float(100.0 * width / length)
    return width, length, ci


def _ray_boundary_intersection(
    center: np.ndarray,
    direction: np.ndarray,
    boundary,
    max_length: float = 1000.0,
) -> np.ndarray:
    """
    Находит точку пересечения луча из center в направлении direction с границей сечения.
    Если пересечений несколько, выбирает ближайшую к центру вдоль луча.
    """
    ray = LineString([center, center + max_length * direction])
    inter = ray.intersection(boundary)
    if inter.is_empty:
        raise ValueError(
            "Луч из центра сечения не пересекает контур головы. "
            "Проверьте замкнутость и топологию контура."
        )

    if hasattr(inter, "geoms"):
        # Мультиточка: сортируем по расстоянию от центра вдоль луча
        pts = [np.array([g.x, g.y]) for g in inter.geoms]
        pts.sort(key=lambda p: float(np.linalg.norm(p - center)))
        return pts[0]
    elif hasattr(inter, "x"):
        return np.array([inter.x, inter.y])
    else:
        coords = list(inter.coords)
        return np.array(coords[0])


def diagonals(
    contour: np.ndarray,
    angle_deg: float = DEFAULT_DIAG_ANGLE_DEG,
    return_points: bool = False,
):
    """
    Вычисляет две диагонали сечения черепа (хорды через центр под углом ±angle_deg от оси Y).

    ВЫБОР ЦЕНТРА СЕЧЕНИЯ:
      Используется центроид многоугольника сечения (Shapely Polygon.centroid),
      а НЕ центр bounding box.
      Обоснование:
      1. Центроид представляет собой интегральный центр масс площади поперечного сечения,
         учитывающий всю геометрию черепа, и инвариантен к неравномерной плотности точек.
      2. Центр bounding box зависит исключительно от четырёх экстремальных точек
         (xmin, xmax, ymin, ymax) и крайне чувствителен к одиночным выбросам сканирования,
         выступам или волосам на периферии.

    Ориентация диагоналей (СК головы: +X = вправо, +Y = вперёд):
      - Диагональ A: угол +angle_deg от оси Y
        Луч вперёд (+u_A): x > 0, y > 0 (право-вперёд / правый лоб)
        Луч назад  (-u_A): x < 0, y < 0 (влево-назад / левый затылок)
        Хорда: Лево-назад <-> Право-вперёд.
      - Диагональ B: угол -angle_deg от оси Y
        Луч вперёд (+u_B): x < 0, y > 0 (лево-вперёд / левый лоб)
        Луч назад  (-u_B): x > 0, y < 0 (вправо-назад / правый затылок)
        Хорда: Право-назад <-> Лево-вперёд.

    Returns:
        (diag_a, diag_b, a_label, b_label)
        или если return_points=True:
        (diag_a, diag_b, a_label, b_label, points_dict)
    """
    pts = np.asarray(contour, dtype=float)
    if len(pts) < 3 or pts.ndim != 2 or pts.shape[1] < 2:
        raise ValueError("Контур должен быть массивом формы (N, 2) с N >= 3 для вычисления диагоналей.")

    poly = Polygon(pts)
    if not poly.is_valid:
        poly = poly.buffer(0)

    # Центроид контура (интегральный центр сечения)
    center = np.array([poly.centroid.x, poly.centroid.y])

    rad = math.radians(float(angle_deg))

    # Диагональ A: +rad от оси Y (вектор вправо-вперёд)
    u_A = np.array([math.sin(rad), math.cos(rad)])
    p_A_front = _ray_boundary_intersection(center, u_A, poly.boundary)
    p_A_back = _ray_boundary_intersection(center, -u_A, poly.boundary)
    diag_a = float(np.linalg.norm(p_A_front - p_A_back))

    # Диагональ B: -rad от оси Y (вектор влево-вперёд)
    u_B = np.array([-math.sin(rad), math.cos(rad)])
    p_B_front = _ray_boundary_intersection(center, u_B, poly.boundary)
    p_B_back = _ray_boundary_intersection(center, -u_B, poly.boundary)
    diag_b = float(np.linalg.norm(p_B_front - p_B_back))

    a_label = f"A (влево-назад / вправо-вперёд, ±{angle_deg:.0f}°)"
    b_label = f"B (вправо-назад / влево-вперёд, ∓{angle_deg:.0f}°)"

    if return_points:
        points_dict = {
            "center": center.tolist(),
            "diag_a": [p_A_back.tolist(), p_A_front.tolist()],
            "diag_b": [p_B_back.tolist(), p_B_front.tolist()],
        }
        return diag_a, diag_b, a_label, b_label, points_dict

    return diag_a, diag_b, a_label, b_label


def cvai(diag_a: float, diag_b: float) -> tuple[float, float]:
    """
    Вычисляет асимметрию свода черепа:
      - CVA  = |A − B| (мм)
      - CVAI = |A − B| / min(A, B) × 100 (%)

    Raises:
        ValueError: если более короткая диагональ <= 0.
    """
    shorter = min(float(diag_a), float(diag_b))
    if shorter <= 1e-6:
        raise ValueError(f"Длина диагонали вырождена ({shorter:.3f} мм), невозможно рассчитать CVAI.")

    diff = abs(float(diag_a) - float(diag_b))
    cvai_val = 100.0 * diff / shorter
    return diff, cvai_val


def determine_asymmetry_direction(
    diag_a: float,
    diag_b: float,
    threshold_diff_mm: float = 0.5,
) -> dict:
    """
    Определяет сторону и направление асимметрии черепа по разнице диагоналей:
      - Диагональ A: Левый затылок (назад-влево) <-> Правый лоб (вперёд-вправо)
      - Диагональ B: Правый затылок (назад-вправо) <-> Левый лоб (вперёд-влево)

    Клиническое правило:
      - Если B < A: диагональ B короче -> правая задняя зона (правый затылок) уплощена / срезана.
      - Если A < B: диагональ A короче -> левая задняя зона (левый затылок) уплощена / срезана.
    """
    diff = float(diag_a - diag_b)
    if abs(diff) < threshold_diff_mm:
        return {
            "longer_diagonal": "equal",
            "shorter_diagonal": "equal",
            "asymmetry_direction": "Симметрично (разница диагоналей < 0.5 мм)",
        }
    elif diff > 0:
        # diag_a > diag_b => B короче
        return {
            "longer_diagonal": "A",
            "shorter_diagonal": "B",
            "asymmetry_direction": "Правая задняя зона уплощена / срезана (диагональ B короче: уплощение правого затылка)",
        }
    else:
        # diag_b > diag_a => A короче
        return {
            "longer_diagonal": "B",
            "shorter_diagonal": "A",
            "asymmetry_direction": "Левая задняя зона уплощена / срезана (диагональ A короче: уплощение левого затылка)",
        }


def compute_head_metrics(
    mesh: trimesh.Trimesh,
    nasion: list[float] | np.ndarray | None = None,
    tragus_left: list[float] | np.ndarray | None = None,
    tragus_right: list[float] | np.ndarray | None = None,
    h_slice: float | None = None,
    z_min: float = DEFAULT_Z_MIN_MM,
    z_max: float = DEFAULT_Z_MAX_MM,
    step: float = DEFAULT_STEP_MM,
    diag_angle_deg: float = DEFAULT_DIAG_ANGLE_DEG,
) -> dict:
    """
    Полный расчёт метрик головы и индекса асимметрии:
    1. Перевод скана в систему координат головы по ориентирам (если переданы).
    2. Выбор уровня сечения h_slice (автоматически или заданного вручную).
    3. Построение контура сечения.
    4. Расчёт ширины, длины, цефалического индекса (CI) и окружности головы.
    5. Расчёт диагоналей A и B, CVA, CVAI и направления асимметрии.

    Returns:
        dict со всеми вычисленными параметрами.
    """
    # 1. Если ориентиры переданы — переводим меш в СК головы
    if nasion is not None and tragus_left is not None and tragus_right is not None:
        origin, R = build_head_frame(nasion, tragus_left, tragus_right)
        v_head = to_head_frame(mesh.vertices, origin, R)
        mesh_head = trimesh.Trimesh(vertices=v_head, faces=mesh.faces, process=False)
    else:
        mesh_head = mesh

    # 2. Уровень сечения
    if h_slice is None:
        selected_h = best_slice_height(mesh_head, z_min=z_min, z_max=z_max, step=step)
    else:
        selected_h = float(h_slice)

    # 3. Сечение
    contour = cross_section(mesh_head, z=selected_h)

    # 4. Метрики формы (размеры и CI)
    width, length, ci = cephalic_index(contour)
    circumference = contour_perimeter(contour)

    # 5. Диагонали и асимметрия
    diag_a, diag_b, a_label, b_label, diag_pts = diagonals(
        contour, angle_deg=diag_angle_deg, return_points=True
    )
    cva_val, cvai_val = cvai(diag_a, diag_b)
    direction_info = determine_asymmetry_direction(diag_a, diag_b)

    return {
        "slice_height_mm": round(selected_h, 2),
        "width_mm": round(width, 2),
        "length_mm": round(length, 2),
        "cephalic_index": round(ci, 2),
        "circumference_mm": round(circumference, 2),
        "diag_a_mm": round(diag_a, 2),
        "diag_b_mm": round(diag_b, 2),
        "diag_a_label": a_label,
        "diag_b_label": b_label,
        "diag_angle_deg": round(float(diag_angle_deg), 1),
        "cva_mm": round(cva_val, 2),
        "cvai_percent": round(cvai_val, 2),
        "longer_diagonal": direction_info["longer_diagonal"],
        "shorter_diagonal": direction_info["shorter_diagonal"],
        "asymmetry_direction": direction_info["asymmetry_direction"],
        "diag_points": {
            "center": [round(float(p), 3) for p in diag_pts["center"]],
            "diag_a": [[round(float(c), 3) for c in pt] for pt in diag_pts["diag_a"]],
            "diag_b": [[round(float(c), 3) for c in pt] for pt in diag_pts["diag_b"]],
        },
        "contour": [[round(float(p[0]), 3), round(float(p[1]), 3)] for p in contour],
    }
