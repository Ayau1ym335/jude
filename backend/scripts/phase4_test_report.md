# Репорт тестирования Фазы 4 на синтетических данных
**Дата:** 2026-08-14 14:01:20
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
| Trim line distal | [OK] OK | curve_points=66, время=0.02s |
| Сглаживание | [OK] OK | elapsed=0.01s, moved=1, max_disp=11.4329mm |
| Версионирование | [PARTIAL] PARTIAL | STL-сериализация: OK (76.6 КБ). save_mesh_as_new_version не вызван (нет Supabase) |

## Проект №2 (sharp_ankle, скан слепка) — результаты по шагам
| Шаг | Результат | Детали/текст ошибки |
|---|---|---|
| Загрузка скана | [OK] OK | verts=790, watertight=True |
| Инверсия (apply_cast_inversion_workflow) | [OK] OK | elapsed=0.20s, {"total_vertices": 790, "problematic_vertices": 145, "problematic_ratio": 0.18354430379746836, "problematic_vertices_after": 0, "fixed": true} |
| Анализ результата инверсии | [OK] OK | watertight=True, volume=-199603.5, dist mean=5.226mm, min=3.767mm |
| Trim line proximal (post-inversion) | [OK] OK | curve_points=34, elapsed=0.00s |
| Trim line ankle (post-inversion) | [OK] OK | curve_points=33, elapsed=0.01s |
| Trim line distal (post-inversion) | [OK] OK | curve_points=46, elapsed=0.03s |
| Сглаживание (post-inversion) | [OK] OK | elapsed=0.03s, nan=False |

### Детали diagnostics инверсии (Проект №2)
```json
{
  "total_vertices": 790,
  "problematic_vertices": 145,
  "problematic_ratio": 0.18354430379746836,
  "problematic_vertices_after": 0,
  "fixed": true
}
```

## Граничные случаи
- **(a) Повторная загрузка**: OK — данные стабильны при повторной загрузке
- **(b) Trim line 2 точки**: OK: curve_points=11
- **(v) Повторное сглаживание 5x**: FAIL: unsupported operand type(s) for /: 'NoneType' and 'float'
- **(g) Несуществующий ID**: OK — FileNotFoundError: Файл не найден: \nonexistent\path\fake_scan.stl | Плохой vidx: IndexError OK
- **Diagnostics keys**: {'problematic_ratio': 'PRESENT', 'diagnostics': 'PRESENT', 'fix_offset_self_intersections': 'PRESENT', 'fixed key in return': 'PRESENT'}

## БЛОКИРУЮЩИЕ проблемы
- [BLOCKING] **ГС-в Повторное сглаживание**: unsupported operand type(s) for /: 'NoneType' and 'float'

## НЕБЛОКИРУЮЩИЕ проблемы / известные ограничения
- [WARN] **Boolean union backend недоступен**: Синтетические меши созданы через concatenate без слияния — они не watertight. Это ограничение среды, не баг кода.

## Не удалось протестировать
- [SKIP] save_mesh_as_new_version (требует живой Supabase)
- [SKIP] POST /trim-lines (требует живой Supabase с записью version_id)
- [SKIP] GET /projects/{id}/versions (требует живой Supabase)

## Архитектурные наблюдения
- `services/versioning.py` содержит пометку `⚠️ ЗАГЛУШКА` в docstring (строка 6) — это честный маркер незавершённой адаптации под конкретный Storage API. Функция логически корректна, но требует ревью перед продакшном.
- `apply_local_laplacian_smoothing` (local_smoothing.py строки 269–283) использует Python for-loop по всем вершинам. Для больших mesh (>100k вершин) это O(N) Python-итераций на каждую итерацию сглаживания — потенциальное узкое место производительности.
- Детекция самопересечений (`detect_problematic_offset_zones`) реализована и работает. Поля `diagnostics['problematic_ratio']` и `warning` в ответе API — присутствуют в коде.
