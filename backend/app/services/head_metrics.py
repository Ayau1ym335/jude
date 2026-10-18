"""
Метрики формы головы (Head Metrics & Cephalic Index).

Клиническая логика:
- Оценка формы черепа основана на поперечном горизонтальном сечении на уровне
  максимальной окружности головы (в полосе над бровями / над плоскостью козелков).
- Для первой версии: сечение на высоте h_slice над плоскостью козелков (z = const в СК головы).
  h_slice настраивается или подбирается автоматически как уровень максимального периметра
  в клиническом диапазоне (по умолчанию 20–60 мм над плоскостью козелков).
- Длина = максимальная протяжённость сечения вдоль оси Y (вперёд-назад).
- Ширина = максимальная протяжённость сечения вдоль оси X (вправо-влево).
- Цефалический индекс: CI = (Ширина / Длина) × 100 %.
"""

import warnings
import numpy as np
import trimesh

from app.services.head_frame import build_head_frame, to_head_frame

# ─── Клинические константы (уточнить и подтвердить у клиники) ────────────────
# Диапазон поиска максимальной окружности над плоскостью козелков (мм).
# У младенцев 0–12 мес. уровень наибольшей лобно-затылочной окружности
# обычно находится на 20–50 мм выше линии козелков ушей.
DEFAULT_Z_MIN_MM = 20.0
DEFAULT_Z_MAX_MM = 60.0
DEFAULT_STEP_MM = 2.0

# Клиническая классификация Cephalic Index (CI):
#   Долихоцефалия (скафоцефалия): CI < 76% (удлинённый, узкий череп)
#   Мезоцефалия (норма):          76% ≤ CI ≤ 83%
#   Брахицефалия:                 CI > 83% (укороченный, широкий череп)
#   Выраженная брахицефалия:      CI ≥ 90%
CI_DOLICHO_MAX = 76.0
CI_BRACHY_MIN = 83.0


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
    # path2d.discrete содержит список замкнутых полилиний (N, 2).
    # Если все контуры разорваны (например, дыра в скане или граница),
    # discrete будет пустым, а entities будут незамкнутыми.
    closed_curves = path2d.discrete
    if len(closed_curves) == 0:
        # Проверяем, есть ли вообще линии (незамкнутые)
        raise ValueError(
            f"Сечение на уровне z={z_val:.1f} мм содержит незамкнутый контур "
            "(скан с дырой или срез проходит через край сетки). "
            "Заполните отверстия в скане или выберите другой уровень сечения."
        )

    # 4. Выбор самого длинного замкнутого контура по периметру
    # (отсекает мелкие замкнутые артефакты, уши или шум)
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

    Raises:
        ValueError: если контур вырожден или длина <= 0.
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


def compute_head_metrics(
    mesh: trimesh.Trimesh,
    nasion: list[float] | np.ndarray | None = None,
    tragus_left: list[float] | np.ndarray | None = None,
    tragus_right: list[float] | np.ndarray | None = None,
    h_slice: float | None = None,
    z_min: float = DEFAULT_Z_MIN_MM,
    z_max: float = DEFAULT_Z_MAX_MM,
    step: float = DEFAULT_STEP_MM,
) -> dict:
    """
    Полный расчёт метрик головы:
    1. Перевод скана в систему координат головы по ориентирам (если переданы).
    2. Выбор уровня сечения h_slice (автоматически или заданного вручную).
    3. Построение контура сечения.
    4. Расчёт ширины, длины, цефалического индекса (CI) и окружности головы.

    Returns:
        dict с полями:
          - slice_height_mm: уровень сечения z (мм)
          - width_mm:        ширина сечения (мм, по оси X)
          - length_mm:       длина сечения (мм, по оси Y)
          - cephalic_index:  цефалический индекс CI (%)
          - circumference_mm: периметр контура (мм)
          - contour:         список координат [[x, y], ...] для 2D-визуализации
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

    # 4. Метрики
    width, length, ci = cephalic_index(contour)
    circumference = contour_perimeter(contour)

    return {
        "slice_height_mm": round(selected_h, 2),
        "width_mm": round(width, 2),
        "length_mm": round(length, 2),
        "cephalic_index": round(ci, 2),
        "circumference_mm": round(circumference, 2),
        "contour": [[round(float(p[0]), 3), round(float(p[1]), 3)] for p in contour],
    }
