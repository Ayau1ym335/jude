"""
backend/app/core/clinical_defaults.py

Клинические значения по умолчанию для расчёта метрик головы младенца и проектирования краниального шлема.
Все числовые константы (зазоры, пороги, углы) собраны в этом модуле.
"""

# TODO: подтвердить у клиники

# Пороги краниальной асимметрии (CVAI - Cranial Vault Asymmetry Index, %)
CVAI_THRESHOLD_NORMAL: float = 3.5      # < 3.5% — норма
CVAI_THRESHOLD_MILD: float = 7.0        # 3.5% .. 7.0% — лёгкая степень
CVAI_THRESHOLD_MODERATE: float = 10.0   # 7.0% .. 10.0% — средняя степень
                                        # > 10.0% — тяжёлая степень

# Цефалический индекс (CI - Cephalic Index, %)
CI_REFERENCE_MIN: float = 75.0          # Долихоцефалия / брахицефалия границы
CI_REFERENCE_MAX: float = 85.0          # Нормоцефалический диапазон

# Параметры сечения головы для измерения асимметрии
DEFAULT_Z_MIN_MM: float = 10.0          # Нижняя граница поиска максимального периметра (мм от tragus)
DEFAULT_Z_MAX_MM: float = 80.0          # Верхняя граница поиска (мм)
DEFAULT_STEP_MM: float = 2.0            # Шаг сканирования по высоте сечения (мм)
DEFAULT_DIAG_ANGLE_DEG: float = 30.0    # Угол расчёта диагоналей свода черепа (30 градусов от продольной оси)

# Параметры локальной коррекции объёма (сглаживания)
DEFAULT_SMOOTHING_RADIUS_MM: float = 15.0  # Инженерный радиус пятна коррекции (мм)
DEFAULT_SMOOTHING_INTENSITY: float = 0.5   # Интенсивность коррекции
DEFAULT_SMOOTHING_ITERATIONS: int = 3      # Итерации лапласиана
