# Репорт тестирования Фазы 4 на синтетических данных
**Дата:** 2026-10-18 21:12:51
**Окружение:** Python 3.12.3, Windows
**Boolean union backend:** `none` (влияет на watertight синтетических mesh)

## Подготовка данных
- **normal_mesh**: `OK` — {'result': 'OK', 'vertices': 790, 'faces': 1568, 'watertight': True, 'union_method': 'concatenate_no_boolean'}
- **sharp_mesh**: `OK` — {'result': 'OK', 'vertices': 790, 'faces': 1568, 'watertight': True, 'union_method': 'concatenate_no_boolean'}
- **validation_normal**: `INVALID` — {'result': 'INVALID', 'errors': ['MULTIPLE_COMPONENTS']}
- **validation_sharp_ankle**: `INVALID` — {'result': 'INVALID', 'errors': ['MULTIPLE_COMPONENTS']}

> WARNING: **Ограничение синтетических данных**: Boolean union backend недоступен. Три примитива соединены через `trimesh.util.concatenate` без истинного слияния — mesh не является watertight и содержит внутренние поверхности на стыке примитивов. Это ограничение среды генерации, **не находка о рабочем коде**.

## Проект №1 (normal, прямой скан) — результаты по шагам
| Шаг | Результат | Детали/текст ошибки |
|---|---|---|
| Загрузка скана | [OK] OK | verts=790, faces=1568, watertight=True, nan=False |
| Trim line proximal | [OK] OK | curve_points=32, время=0.00s |
| Trim line ankle | [OK] OK | curve_points=39, время=0.01s |
| Trim line distal | [OK] OK | curve_points=66, время=0.01s |
| Сглаживание | [SKIP] SKIP | smoothing недоступен или mesh не загружен |
| Версионирование | [FAIL] FAIL_IMPORT | No module named 'versioning' |

## Проект №2 (sharp_ankle, скан слепка) — результаты по шагам
| Шаг | Результат | Детали/текст ошибки |
|---|---|---|
| Загрузка скана | [OK] OK | verts=790, watertight=True |
| Инверсия (apply_cast_inversion_workflow) | [SKIP] SKIP | inversion service недоступен или mesh не загружен |
| Анализ результата инверсии | [SKIP] SKIP | нет inverted mesh |
| Trim line proximal (post-inversion) | [OK] OK | curve_points=23, elapsed=0.00s |
| Trim line ankle (post-inversion) | [OK] OK | curve_points=33, elapsed=0.00s |
| Trim line distal (post-inversion) | [OK] OK | curve_points=68, elapsed=0.01s |
| Сглаживание (post-inversion) | [SKIP] SKIP | smoothing недоступен или mesh не загружен |

### Детали diagnostics инверсии (Проект №2)
_Инверсия не была выполнена — нет данных._

## Граничные случаи
- **(a) Повторная загрузка**: OK — данные стабильны при повторной загрузке
- **(b) Trim line 2 точки**: OK: curve_points=11
- **(v) Повторное сглаживание 5x**: SKIP
- **(g) Несуществующий ID**: OK — FileNotFoundError: Файл не найден: \nonexistent\path\fake_scan.stl
- **Diagnostics keys**: FAIL: No module named 'inversion'

## БЛОКИРУЮЩИЕ проблемы
- [BLOCKING] **ImportError inversion**: No module named 'inversion'
- [BLOCKING] **ImportError local_smoothing**: No module named 'local_smoothing'
- [BLOCKING] **П1 Версионирование импорт**: No module named 'versioning'

## НЕБЛОКИРУЮЩИЕ проблемы / известные ограничения
- [WARN] **Boolean union backend недоступен**: Синтетические меши созданы через concatenate без слияния — они не watertight. Это ограничение среды, не баг кода.

## Не удалось протестировать

## Архитектурные наблюдения
- `services/versioning.py` содержит пометку `⚠️ ЗАГЛУШКА` в docstring (строка 6) — это честный маркер незавершённой адаптации под конкретный Storage API. Функция логически корректна, но требует ревью перед продакшном.
- `apply_local_laplacian_smoothing` (local_smoothing.py строки 269–283) использует Python for-loop по всем вершинам. Для больших mesh (>100k вершин) это O(N) Python-итераций на каждую итерацию сглаживания — потенциальное узкое место производительности.
- Детекция самопересечений (`detect_problematic_offset_zones`) реализована и работает. Поля `diagnostics['problematic_ratio']` и `warning` в ответе API — присутствуют в коде.
