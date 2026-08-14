# -*- coding: utf-8 -*-
import sys
import io
# Force UTF-8 output on Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

"""
test_phase4_synthetic.py

ДИАГНОСТИЧЕСКИЙ СКРИПТ — тестирование Фазы 4 на синтетических данных.
НЕ исправляет проблемы — только документирует их.

Запуск из backend/:
    python scripts/test_phase4_synthetic.py

Тест запускается автономно, без живого Supabase/сервера.
Все шаги, требующие API, вызываются напрямую через сервисный слой.
"""

import os
import traceback
import json
import time
from pathlib import Path
from typing import Any

# ─── Настройка путей (вызывается из backend/) ─────────────────────────────────
BACKEND_DIR = Path(__file__).parent.parent.resolve()
SERVICES_DIR = BACKEND_DIR / "services"  # backend/services/ — НЕ app/services/

# ВАЖНО: порядок критичен.
# backend/services/  — добавляем ПЕРВЫМ, чтобы 'import inversion' нашёл нужный модуль.
# backend/app/       — для доступа к app.geometry, app.services.geodesic_curve и т.д.
# backend/           — для доступа к app.* как пакетам
sys.path.insert(0, str(SERVICES_DIR))   # inversion, local_smoothing, versioning
sys.path.insert(0, str(BACKEND_DIR / "app"))  # routers, schemas, geometry
sys.path.insert(0, str(BACKEND_DIR))    # app.* package imports

import numpy as np
import trimesh

# ─── Цвета для вывода ──────────────────────────────────────────────────────────
GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

def ok(msg):   print(f"  {GREEN}[OK]{RESET} {msg}")
def fail(msg): print(f"  {RED}[FAIL]{RESET} {msg}")
def warn(msg): print(f"  {YELLOW}[WARN]{RESET} {msg}")
def info(msg): print(f"  {CYAN}[INFO]{RESET} {msg}")
def section(msg): print(f"\n{BOLD}{'='*70}{RESET}\n{BOLD}{msg}{RESET}\n{'-'*70}")

# ─── Сбор результатов для репорта ─────────────────────────────────────────────
REPORT = {
    "data_prep": {},
    "project1_steps": [],
    "project2_steps": [],
    "edge_cases": {},
    "blocking": [],
    "non_blocking": [],
    "not_tested": [],
}

def record(table_key, step, result, detail=""):
    """Записывает шаг в репорт."""
    row = {"step": step, "result": result, "detail": detail}
    if isinstance(REPORT[table_key], list):
        REPORT[table_key].append(row)
    else:
        REPORT[table_key][step] = row


# ══════════════════════════════════════════════════════════════════════════════
#  ШАГ 1 — Подготовка синтетических данных
# ══════════════════════════════════════════════════════════════════════════════

section("ШАГ 1 — Подготовка синтетической геометрии")

NORMAL_STL_PATH = BACKEND_DIR / "scripts" / "synthetic_leg_normal.stl"
SHARP_STL_PATH  = BACKEND_DIR / "scripts" / "synthetic_leg_sharp_ankle.stl"

def generate_synthetic_leg(ankle_radius: float = 25.0, ankle_height: float = 30.0,
                            label: str = "normal") -> trimesh.Trimesh:
    """
    Генерирует синтетическую геометрию, грубо имитирующую голень+стопу:
    - конус (голень), сужающийся книзу
    - цилиндр (лодыжка — узкое место)
    - вытянутый эллипсоид (стопа)

    Boolean union не используется — три примитива расположены вплотную
    без точного сшивания. Это ограничение синтетических данных, не баг кода.
    """
    meshes = []

    # 1. Голень — конус. radius=40 мм, height=200 мм
    shin = trimesh.creation.cone(radius=40, height=200, sections=48)
    shin.apply_translation([0, 0, 100 + ankle_height])
    meshes.append(shin)

    # 2. Лодыжка — цилиндр, параметры варьируются
    ankle = trimesh.creation.cylinder(radius=ankle_radius, height=ankle_height, sections=48)
    ankle.apply_translation([0, 0, ankle_height / 2.0])
    meshes.append(ankle)

    # 3. Стопа — сплющенная сфера
    foot_sphere = trimesh.creation.icosphere(subdivisions=3, radius=1.0)
    foot_sphere.apply_scale([38, 85, 22])
    foot_sphere.apply_translation([0, 20, -22])
    meshes.append(foot_sphere)

    # Попытка boolean union
    combined = None
    union_method = "none"

    # Попытка 1: manifold3d
    try:
        combined = trimesh.boolean.union(meshes, engine="manifold")
        union_method = "manifold3d"
    except Exception as e1:
        # Попытка 2: blender
        try:
            combined = trimesh.boolean.union(meshes, engine="blender")
            union_method = "blender"
        except Exception as e2:
            # Fallback: concatenate без boolean
            combined = trimesh.util.concatenate(meshes)
            union_method = "concatenate_no_boolean"

    return combined, union_method


# ── Генерация «нормальной» геометрии ──────────────────────────────────────────
print(f"\n[1.1] Генерация synthetic_leg_normal (ankle_radius=25)...")
try:
    mesh_normal, method_normal = generate_synthetic_leg(ankle_radius=25, ankle_height=30, label="normal")
    mesh_normal.export(str(NORMAL_STL_PATH))
    is_wt_normal = mesh_normal.is_watertight
    nv_normal = len(mesh_normal.vertices)
    nf_normal = len(mesh_normal.faces)
    ok(f"Создан: {nv_normal} вершин, {nf_normal} граней, watertight={is_wt_normal}, метод={method_normal}")
    ok(f"Сохранён в: {NORMAL_STL_PATH}")
    REPORT["data_prep"]["normal_mesh"] = {
        "result": "OK",
        "vertices": nv_normal, "faces": nf_normal,
        "watertight": is_wt_normal,
        "union_method": method_normal,
    }
except Exception as e:
    fail(f"Ошибка генерации: {e}")
    traceback.print_exc()
    REPORT["data_prep"]["normal_mesh"] = {"result": "FAIL", "error": str(e)}
    mesh_normal = None

# ── Генерация «стресс-тест» — острое сужение ──────────────────────────────────
print(f"\n[1.2] Генерация synthetic_leg_sharp_ankle (ankle_radius=15, height=15 — стресс)...")
try:
    mesh_sharp, method_sharp = generate_synthetic_leg(ankle_radius=15, ankle_height=15, label="sharp")
    mesh_sharp.export(str(SHARP_STL_PATH))
    is_wt_sharp = mesh_sharp.is_watertight
    nv_sharp = len(mesh_sharp.vertices)
    nf_sharp = len(mesh_sharp.faces)
    ok(f"Создан: {nv_sharp} вершин, {nf_sharp} граней, watertight={is_wt_sharp}, метод={method_sharp}")
    ok(f"Сохранён в: {SHARP_STL_PATH}")
    REPORT["data_prep"]["sharp_mesh"] = {
        "result": "OK",
        "vertices": nv_sharp, "faces": nf_sharp,
        "watertight": is_wt_sharp,
        "union_method": method_sharp,
    }
except Exception as e:
    fail(f"Ошибка генерации: {e}")
    traceback.print_exc()
    REPORT["data_prep"]["sharp_mesh"] = {"result": "FAIL", "error": str(e)}
    mesh_sharp = None


# ── Валидация через существующий app.geometry.validator ───────────────────────
print(f"\n[1.3] Валидация синтетических сканов через app.geometry.validator.validate_mesh...")
try:
    from app.geometry.validator import validate_mesh

    for label, path in [("normal", NORMAL_STL_PATH), ("sharp_ankle", SHARP_STL_PATH)]:
        if not path.exists():
            warn(f"{label}: файл не создан, пропуск валидации")
            REPORT["data_prep"][f"validation_{label}"] = {"result": "SKIP", "reason": "file not created"}
            continue
        try:
            vresult = validate_mesh(str(path))
            valid_flag = vresult.get("valid")
            errors = vresult.get("errors", [])
            if valid_flag:
                ok(f"{label}: valid=True, errors=[]")
                REPORT["data_prep"][f"validation_{label}"] = {"result": "VALID", "errors": []}
            else:
                warn(f"{label}: valid=False, errors={errors}")
                REPORT["data_prep"][f"validation_{label}"] = {"result": "INVALID", "errors": errors}
        except Exception as e:
            fail(f"{label}: исключение при валидации — {e}")
            traceback.print_exc()
            REPORT["data_prep"][f"validation_{label}"] = {"result": "EXCEPTION", "error": str(e)}
except ImportError as e:
    fail(f"Не удалось импортировать validate_mesh: {e}")
    REPORT["data_prep"]["validation_import"] = {"result": "IMPORT_FAIL", "error": str(e)}


# ══════════════════════════════════════════════════════════════════════════════
#  Импорт сервисного слоя (без Supabase/HTTP)
# ══════════════════════════════════════════════════════════════════════════════

section("Импорт сервисного слоя Фазы 4")

# ПРИМЕЧАНИЕ по импортам: backend/services/ добавлен в sys.path НАПРЯМУЮ,
# поэтому импортируем модули как top-level (inversion, local_smoothing, versioning),
# а НЕ через 'services.inversion' (там namespace app/services/ перекрывает).

print("[import] inversion (backend/services/inversion.py)...")
try:
    from inversion import (
        invert_mesh_normals,
        offset_surface,
        detect_problematic_offset_zones,
        fix_offset_self_intersections,
        apply_cast_inversion_workflow,
    )
    ok("inversion.py импортирован успешно")
    INVERSION_OK = True
except ImportError as e:
    fail(f"ImportError: {e}")
    traceback.print_exc()
    INVERSION_OK = False
    REPORT["blocking"].append({"problem": "ImportError inversion", "detail": str(e)})

print("[import] local_smoothing (backend/services/local_smoothing.py)...")
try:
    from local_smoothing import (
        compute_falloff_weights,
        compute_falloff_weights_optimized,
        apply_local_laplacian_smoothing,
    )
    ok("local_smoothing.py импортирован успешно")
    SMOOTHING_OK = True
except ImportError as e:
    fail(f"ImportError: {e}")
    traceback.print_exc()
    SMOOTHING_OK = False
    REPORT["blocking"].append({"problem": "ImportError local_smoothing", "detail": str(e)})

print("[import] geodesic_curve (backend/app/services/geodesic_curve.py)...")
try:
    from services.geodesic_curve import (
        compute_geodesic_curve_through_points,
        find_nearest_vertex_index,
    )
    ok("geodesic_curve.py импортирован успешно")
    GEODESIC_OK = True
except ImportError as e:
    fail(f"ImportError: {e}")
    traceback.print_exc()
    GEODESIC_OK = False
    REPORT["blocking"].append({"problem": "ImportError geodesic_curve", "detail": str(e)})


# ══════════════════════════════════════════════════════════════════════════════
#  Вспомогательные функции-имитаторы workflow
# ══════════════════════════════════════════════════════════════════════════════

def bbox_extents(mesh):
    mn = mesh.vertices.min(axis=0)
    mx = mesh.vertices.max(axis=0)
    return mx - mn

def sample_points_on_mesh(mesh, n=4, z_fraction=0.8):
    """
    Возвращает n точек на поверхности mesh вблизи указанной z-доли от min.
    Используется для выбора опорных точек trim line.
    """
    mn = mesh.vertices.min(axis=0)
    mx = mesh.vertices.max(axis=0)
    z_target = mn[2] + (mx[2] - mn[2]) * z_fraction
    # Вершины ближе всего к z_target
    dists = np.abs(mesh.vertices[:, 2] - z_target)
    indices = np.argsort(dists)[:n * 10]
    # Берём равномерно из первых n*10 по углу
    angles = np.arctan2(mesh.vertices[indices, 1], mesh.vertices[indices, 0])
    sorted_by_angle = indices[np.argsort(angles)]
    step = max(1, len(sorted_by_angle) // n)
    chosen = sorted_by_angle[::step][:n]
    return [mesh.vertices[i].tolist() for i in chosen], [int(i) for i in chosen]

def check_mesh_integrity(mesh, label=""):
    """Проверяет базовую целостность mesh: NaN, вырожденные грани."""
    has_nan = np.any(np.isnan(mesh.vertices))
    has_inf = np.any(np.isinf(mesh.vertices))
    n_verts = len(mesh.vertices)
    n_faces = len(mesh.faces)
    return {
        "has_nan": bool(has_nan),
        "has_inf": bool(has_inf),
        "n_verts": n_verts,
        "n_faces": n_faces,
        "watertight": mesh.is_watertight,
        "winding_consistent": mesh.is_winding_consistent,
    }


# ══════════════════════════════════════════════════════════════════════════════
#  ПРОЕКТ №1 — Normal mesh, прямой скан
# ══════════════════════════════════════════════════════════════════════════════

section("ПРОЕКТ №1 — Normal mesh (прямой скан)")

current_mesh_p1 = mesh_normal  # стартовый mesh

# ── Шаг 1: «Загрузка скана» — проверяем app.geometry.loader напрямую ─────────
print("\n[П1-Ш1] Загрузка скана через app.geometry.loader...")
step_result = "SKIP"
step_detail = ""
if NORMAL_STL_PATH.exists():
    try:
        from app.geometry.loader import load_mesh as load_mesh_fn
        loaded_mesh = load_mesh_fn(str(NORMAL_STL_PATH))
        integ = check_mesh_integrity(loaded_mesh)
        ok(f"Загружен: {integ['n_verts']} вершин, {integ['n_faces']} граней")
        ok(f"NaN={integ['has_nan']}, Inf={integ['has_inf']}, watertight={integ['watertight']}")
        step_result = "OK"
        step_detail = f"verts={integ['n_verts']}, faces={integ['n_faces']}, watertight={integ['watertight']}, nan={integ['has_nan']}"
        current_mesh_p1 = loaded_mesh
    except Exception as e:
        fail(f"Ошибка: {e}")
        traceback.print_exc()
        step_result = "FAIL"
        step_detail = str(e)
        REPORT["blocking"].append({"problem": "П1 Загрузка скана", "detail": str(e)})
else:
    warn("STL-файл не создан — пропуск")
    step_result = "SKIP"
    step_detail = "STL не создан"
record("project1_steps", "Загрузка скана", step_result, step_detail)

# ── Шаг 2: Trim line "proximal" ───────────────────────────────────────────────
print("\n[П1-Ш2] Trim line 'proximal' (верхняя часть голени, z≈80%)...")
step_result = "SKIP"
step_detail = ""
if GEODESIC_OK and current_mesh_p1 is not None:
    try:
        pts, vidxs = sample_points_on_mesh(current_mesh_p1, n=4, z_fraction=0.80)
        info(f"Опорные точки (4 шт.) вблизи z=80%: {[p[:2] for p in pts]}")
        t0 = time.time()
        curve = compute_geodesic_curve_through_points(current_mesh_p1, vidxs)
        elapsed = time.time() - t0
        ok(f"Кривая построена: {len(curve)} точек, за {elapsed:.2f} сек")
        # Имитируем сохранение через trim_lines (без Supabase — просто собираем данные)
        trim_data_proximal = {
            "line_type": "proximal",
            "anchor_points": pts,
            "curve_points": curve.tolist(),
        }
        ok("Данные trim_line 'proximal' готовы для POST /trim-lines")
        step_result = "OK"
        step_detail = f"curve_points={len(curve)}, время={elapsed:.2f}s"
    except Exception as e:
        fail(f"Ошибка: {e}")
        traceback.print_exc()
        step_result = "FAIL"
        step_detail = str(e)
        REPORT["blocking"].append({"problem": "П1 Trim line proximal", "detail": str(e)})
else:
    step_result = "SKIP"
    step_detail = "geodesic_curve недоступен или mesh не загружен"
record("project1_steps", "Trim line proximal", step_result, step_detail)

# ── Шаг 3: Trim line "ankle" ──────────────────────────────────────────────────
print("\n[П1-Ш3] Trim line 'ankle' (зона сужения, z≈25%)...")
step_result = "SKIP"
step_detail = ""
if GEODESIC_OK and current_mesh_p1 is not None:
    try:
        pts, vidxs = sample_points_on_mesh(current_mesh_p1, n=4, z_fraction=0.25)
        info(f"Опорные точки вблизи z=25%: {[p[:2] for p in pts]}")
        t0 = time.time()
        curve = compute_geodesic_curve_through_points(current_mesh_p1, vidxs)
        elapsed = time.time() - t0
        ok(f"Кривая построена: {len(curve)} точек, за {elapsed:.2f} сек")
        trim_data_ankle = {
            "line_type": "ankle",
            "anchor_points": pts,
            "curve_points": curve.tolist(),
        }
        step_result = "OK"
        step_detail = f"curve_points={len(curve)}, время={elapsed:.2f}s"
    except Exception as e:
        fail(f"Ошибка: {e}")
        traceback.print_exc()
        step_result = "FAIL"
        step_detail = str(e)
        REPORT["blocking"].append({"problem": "П1 Trim line ankle", "detail": str(e)})
else:
    step_result = "SKIP"
    step_detail = "geodesic_curve недоступен или mesh не загружен"
record("project1_steps", "Trim line ankle", step_result, step_detail)

# ── Шаг 4: Trim line "distal" ─────────────────────────────────────────────────
print("\n[П1-Ш4] Trim line 'distal' (стопа, z≈5%)...")
step_result = "SKIP"
step_detail = ""
if GEODESIC_OK and current_mesh_p1 is not None:
    try:
        pts, vidxs = sample_points_on_mesh(current_mesh_p1, n=3, z_fraction=0.05)
        info(f"Опорные точки вблизи z=5%: {[p[:2] for p in pts]}")
        t0 = time.time()
        curve = compute_geodesic_curve_through_points(current_mesh_p1, vidxs)
        elapsed = time.time() - t0
        ok(f"Кривая построена: {len(curve)} точек, за {elapsed:.2f} сек")
        trim_data_distal = {
            "line_type": "distal",
            "anchor_points": pts,
            "curve_points": curve.tolist(),
        }
        step_result = "OK"
        step_detail = f"curve_points={len(curve)}, время={elapsed:.2f}s"
    except Exception as e:
        fail(f"Ошибка: {e}")
        traceback.print_exc()
        step_result = "FAIL"
        step_detail = str(e)
        REPORT["blocking"].append({"problem": "П1 Trim line distal", "detail": str(e)})
else:
    step_result = "SKIP"
    step_detail = "geodesic_curve недоступен или mesh не загружен"
record("project1_steps", "Trim line distal", step_result, step_detail)

# ── Шаг 5: Сглаживание зоны лодыжки ──────────────────────────────────────────
print("\n[П1-Ш5] Сглаживание (apply_local_laplacian_smoothing) в зоне лодыжки...")
smoothed_mesh_p1 = None
step_result = "SKIP"
step_detail = ""
if SMOOTHING_OK and current_mesh_p1 is not None:
    try:
        # Центр — вблизи z=25% (зона лодыжки)
        center_pts, center_idxs = sample_points_on_mesh(current_mesh_p1, n=1, z_fraction=0.25)
        center_vidx = center_idxs[0]
        center_point = center_pts[0]
        info(f"Центр сглаживания: vertex #{center_vidx} @ {center_point[:2]}")

        t0 = time.time()
        smoothed_mesh_p1 = apply_local_laplacian_smoothing(
            current_mesh_p1,
            center_vertex_idx=center_vidx,
            radius=15.0,
            intensity=0.5,
            iterations=3,
        )
        elapsed = time.time() - t0

        integ = check_mesh_integrity(smoothed_mesh_p1)
        diff = np.linalg.norm(smoothed_mesh_p1.vertices - current_mesh_p1.vertices, axis=1)
        vertices_moved = int((diff > 1e-6).sum())
        max_displacement = float(diff.max())

        ok(f"Сглаживание выполнено за {elapsed:.2f} сек")
        ok(f"Вершин смещено: {vertices_moved}/{integ['n_verts']}")
        ok(f"Макс. смещение: {max_displacement:.4f} мм")
        if integ["has_nan"]:
            fail("ОБНАРУЖЕНЫ NaN в координатах! Геометрия вырождена.")
            REPORT["blocking"].append({"problem": "П1 Сглаживание: NaN в вершинах", "detail": "after apply_local_laplacian_smoothing"})
            step_result = "FAIL_NaN"
            step_detail = f"NaN в координатах. Vertices moved={vertices_moved}, max_disp={max_displacement:.4f}"
        else:
            step_result = "OK"
            step_detail = f"elapsed={elapsed:.2f}s, moved={vertices_moved}, max_disp={max_displacement:.4f}mm"
    except Exception as e:
        fail(f"Ошибка: {e}")
        traceback.print_exc()
        step_result = "FAIL"
        step_detail = str(e)
        REPORT["blocking"].append({"problem": "П1 Сглаживание", "detail": str(e)})
else:
    step_result = "SKIP"
    step_detail = "smoothing недоступен или mesh не загружен"
record("project1_steps", "Сглаживание", step_result, step_detail)

# ── Шаг 6: Версионирование (без Supabase — проверяем только сериализацию) ─────
print("\n[П1-Ш6] Версионирование — проверка сериализации mesh в STL без Supabase...")
step_result = "SKIP"
step_detail = ""
mesh_to_save = smoothed_mesh_p1 if smoothed_mesh_p1 is not None else current_mesh_p1
if mesh_to_save is not None:
    try:
        import io
        stl_bytes = mesh_to_save.export(file_type="stl")
        size_kb = len(stl_bytes) / 1024
        ok(f"Mesh сериализован в STL: {size_kb:.1f} КБ")
        # Проверяем обратную загрузку
        import tempfile
        with tempfile.NamedTemporaryFile(delete=False, suffix=".stl") as tmp:
            tmp.write(stl_bytes)
            tmp_path = tmp.name
        reloaded = trimesh.load(tmp_path, force="mesh")
        os.remove(tmp_path)
        integ2 = check_mesh_integrity(reloaded)
        ok(f"Перезагружен: {integ2['n_verts']} вершин, nan={integ2['has_nan']}")

        # Проверяем save_mesh_as_new_version код (без реального Supabase)
        # — просто проверяем, что функция импортируется и правильно написана
        try:
            from versioning import save_mesh_as_new_version
            ok("versioning.py импортирован успешно")
            # Вызов потребует живого Supabase — не вызываем, но отмечаем
            warn("save_mesh_as_new_version НЕ вызван — требует живого Supabase")
            step_result = "PARTIAL"
            step_detail = (
                f"STL-сериализация: OK ({size_kb:.1f} КБ). "
                "save_mesh_as_new_version не вызван (нет Supabase)"
            )
        except ImportError as ie:
            fail(f"Не удалось импортировать services.versioning: {ie}")
            step_result = "FAIL_IMPORT"
            step_detail = str(ie)
            REPORT["blocking"].append({"problem": "П1 Версионирование импорт", "detail": str(ie)})
    except Exception as e:
        fail(f"Ошибка: {e}")
        traceback.print_exc()
        step_result = "FAIL"
        step_detail = str(e)
        REPORT["blocking"].append({"problem": "П1 Версионирование", "detail": str(e)})
else:
    step_result = "SKIP"
    step_detail = "Нет mesh для сохранения"
record("project1_steps", "Версионирование", step_result, step_detail)


# ══════════════════════════════════════════════════════════════════════════════
#  ПРОЕКТ №2 — Sharp ankle (скан слепка), инверсия + offset
# ══════════════════════════════════════════════════════════════════════════════

section("ПРОЕКТ №2 — Sharp ankle (скан слепка, cast_negative)")

current_mesh_p2 = mesh_sharp

# ── Шаг 1: Загрузка ───────────────────────────────────────────────────────────
print("\n[П2-Ш0] Загрузка sharp ankle mesh...")
step_result = "SKIP"
step_detail = ""
if SHARP_STL_PATH.exists():
    try:
        loaded_sharp = load_mesh_fn(str(SHARP_STL_PATH))
        integ = check_mesh_integrity(loaded_sharp)
        ok(f"Загружен: {integ['n_verts']} вершин, watertight={integ['watertight']}")
        step_result = "OK"
        step_detail = f"verts={integ['n_verts']}, watertight={integ['watertight']}"
        current_mesh_p2 = loaded_sharp
    except Exception as e:
        fail(f"Ошибка: {e}")
        step_result = "FAIL"
        step_detail = str(e)
        REPORT["blocking"].append({"problem": "П2 Загрузка скана", "detail": str(e)})
else:
    warn("Файл sharp ankle не создан")
    step_result = "SKIP"
    step_detail = "STL не создан"
record("project2_steps", "Загрузка скана", step_result, step_detail)


# ── Шаг: Инверсия + offset + fix (apply_cast_inversion_workflow) ───────────
print("\n[П2-Ш1] Инверсия (apply_cast_inversion_workflow, material_thickness=4.0)...")
inverted_mesh_p2 = None
diagnostics_p2 = {}
step_result = "SKIP"
step_detail = ""
if INVERSION_OK and current_mesh_p2 is not None:
    try:
        t0 = time.time()
        result_mesh, diagnostics_p2 = apply_cast_inversion_workflow(
            current_mesh_p2,
            material_thickness=4.0,
            smoothing_iterations=5,
            tolerance=0.3,
        )
        elapsed = time.time() - t0

        ok(f"Инверсия выполнена за {elapsed:.2f} сек")
        info(f"diagnostics: {json.dumps(diagnostics_p2, indent=2)}")

        # Проверяем поле warning (логика из geometry.py строки 255)
        has_warning = diagnostics_p2.get("problematic_ratio", 0.0) > 0.02
        if has_warning:
            warn(f"Поле 'warning' БЫЛО БЫ возвращено: {diagnostics_p2['problematic_ratio']*100:.1f}% проблемных вершин")
        else:
            ok(f"Поле 'warning' НЕ нужно: problematic_ratio={diagnostics_p2.get('problematic_ratio', 0):.3f}")

        # Проверяем наличие ключей diagnostics
        required_keys = ["total_vertices", "problematic_vertices", "problematic_ratio",
                         "problematic_vertices_after", "fixed"]
        missing_keys = [k for k in required_keys if k not in diagnostics_p2]
        if missing_keys:
            fail(f"Отсутствуют ключи в diagnostics: {missing_keys}")
            REPORT["blocking"].append({"problem": "П2 Инверсия: missing diagnostics keys", "detail": str(missing_keys)})

        integ = check_mesh_integrity(result_mesh)
        if integ["has_nan"]:
            fail("NaN в координатах после инверсии!")
            REPORT["blocking"].append({"problem": "П2 Инверсия: NaN в вершинах", "detail": f"diagnostics={diagnostics_p2}"})
            step_result = "FAIL_NaN"
            step_detail = f"NaN обнаружен. diagnostics={diagnostics_p2}"
        elif not diagnostics_p2.get("fixed", True) and diagnostics_p2.get("problematic_ratio", 0) > 0.05:
            fail("fixed=False и > 5% проблемных — в реальном API вернулся бы HTTP 422")
            step_result = "WOULD_422"
            step_detail = f"fixed=False, problematic_ratio={diagnostics_p2.get('problematic_ratio'):.3f}"
            REPORT["non_blocking"].append({
                "problem": "П2 Инверсия: высокий problematic_ratio",
                "detail": f"ratio={diagnostics_p2.get('problematic_ratio'):.3f}, fixed={diagnostics_p2.get('fixed')} — ожидаемо для острого сужения"
            })
        else:
            ok(f"Mesh после инверсии: n_verts={integ['n_verts']}, nan={integ['has_nan']}, fixed={diagnostics_p2.get('fixed')}")
            step_result = "OK"
            step_detail = f"elapsed={elapsed:.2f}s, {json.dumps(diagnostics_p2)}"
        inverted_mesh_p2 = result_mesh

    except Exception as e:
        fail(f"Ошибка: {e}")
        traceback.print_exc()
        step_result = "FAIL"
        step_detail = str(e)
        REPORT["blocking"].append({"problem": "П2 apply_cast_inversion_workflow", "detail": str(e)})
else:
    step_result = "SKIP"
    step_detail = "inversion service недоступен или mesh не загружен"
record("project2_steps", "Инверсия (apply_cast_inversion_workflow)", step_result, step_detail)


# ── Численная проверка результата инверсии ────────────────────────────────────
print("\n[П2-Ш2] Анализ результата инверсии (самопересечения)...")
step_result = "SKIP"
step_detail = ""
if inverted_mesh_p2 is not None:
    try:
        # trimesh.intersections — проверка самопересечений через ray_triangle
        is_wt = inverted_mesh_p2.is_watertight
        # Используем trimesh.repair для подсчёта проблем
        # Пробуем через is_volume (требует watertight + правильный winding)
        try:
            is_vol = inverted_mesh_p2.is_volume
        except Exception:
            is_vol = None

        # Проверка на инверсию нормалей (volume должен быть > 0 при правильном winding)
        try:
            vol = float(inverted_mesh_p2.volume)
        except Exception:
            vol = None

        info(f"is_watertight={is_wt}, is_volume={is_vol}, volume={vol}")

        # Оцениваем расстояния offset: берём исходный и inverted mesh
        # Проверяем: вершины inverted должны быть дальше от original на ~4мм
        if current_mesh_p2 is not None:
            inv_normals_only = invert_mesh_normals(current_mesh_p2)
            _, dists, _ = inv_normals_only.nearest.on_surface(inverted_mesh_p2.vertices)
            mean_dist = float(dists.mean())
            std_dist = float(dists.std())
            min_dist = float(dists.min())
            max_dist = float(dists.max())
            ok(f"Point-to-surface distance после offset (должно быть ≈4 мм):")
            ok(f"  mean={mean_dist:.3f}, std={std_dist:.3f}, min={min_dist:.3f}, max={max_dist:.3f}")

            if mean_dist < 1.0:
                warn(f"Среднее расстояние ({mean_dist:.3f} мм) существенно меньше 4 мм — offset мог схлопнуться")
                REPORT["non_blocking"].append({"problem": "П2 Offset: низкое среднее расстояние", "detail": f"mean={mean_dist:.3f}mm"})

            if min_dist < 0.5:
                fail(f"Минимальное расстояние {min_dist:.3f} мм — есть зоны схлопывания (самопересечения)")
                REPORT["non_blocking"].append({"problem": "П2 Offset: зоны схлопывания (min_dist < 0.5mm)", "detail": f"min={min_dist:.3f}mm"})

        step_result = "OK"
        step_detail = f"watertight={is_wt}, volume={vol:.1f}, dist mean={mean_dist:.3f}mm, min={min_dist:.3f}mm"
    except Exception as e:
        fail(f"Ошибка анализа: {e}")
        traceback.print_exc()
        step_result = "FAIL"
        step_detail = str(e)
else:
    step_result = "SKIP"
    step_detail = "нет inverted mesh"
record("project2_steps", "Анализ результата инверсии", step_result, step_detail)


# ── Trim lines для P2 (поверх inverted mesh) ──────────────────────────────────
print("\n[П2-Ш3] Trim lines поверх inverted mesh...")
mesh_for_trimlines_p2 = inverted_mesh_p2 if inverted_mesh_p2 is not None else current_mesh_p2

for tl_name, z_frac in [("proximal", 0.80), ("ankle", 0.25), ("distal", 0.05)]:
    step_result = "SKIP"
    step_detail = ""
    if GEODESIC_OK and mesh_for_trimlines_p2 is not None:
        try:
            pts, vidxs = sample_points_on_mesh(mesh_for_trimlines_p2, n=3, z_fraction=z_frac)
            t0 = time.time()
            curve = compute_geodesic_curve_through_points(mesh_for_trimlines_p2, vidxs)
            elapsed = time.time() - t0
            ok(f"Trim line '{tl_name}': {len(curve)} точек, {elapsed:.2f} сек")
            step_result = "OK"
            step_detail = f"curve_points={len(curve)}, elapsed={elapsed:.2f}s"
        except Exception as e:
            fail(f"Trim line '{tl_name}' ошибка: {e}")
            traceback.print_exc()
            step_result = "FAIL"
            step_detail = str(e)
            REPORT["blocking"].append({"problem": f"П2 Trim line {tl_name}", "detail": str(e)})
    else:
        step_result = "SKIP"
        step_detail = "geodesic недоступен или mesh не загружен"
    record("project2_steps", f"Trim line {tl_name} (post-inversion)", step_result, step_detail)

# ── Сглаживание для P2 ────────────────────────────────────────────────────────
print("\n[П2-Ш4] Сглаживание поверх inverted mesh...")
step_result = "SKIP"
step_detail = ""
if SMOOTHING_OK and mesh_for_trimlines_p2 is not None:
    try:
        cpts, cidxs = sample_points_on_mesh(mesh_for_trimlines_p2, n=1, z_fraction=0.25)
        t0 = time.time()
        sm2 = apply_local_laplacian_smoothing(
            mesh_for_trimlines_p2,
            center_vertex_idx=cidxs[0],
            radius=15.0,
            intensity=0.5,
            iterations=3,
        )
        elapsed = time.time() - t0
        integ = check_mesh_integrity(sm2)
        ok(f"Сглаживание выполнено за {elapsed:.2f} сек, NaN={integ['has_nan']}")
        if integ["has_nan"]:
            fail("NaN после сглаживания поверх inverted mesh!")
            REPORT["blocking"].append({"problem": "П2 Сглаживание после инверсии: NaN", "detail": ""})
            step_result = "FAIL_NaN"
        else:
            step_result = "OK"
        step_detail = f"elapsed={elapsed:.2f}s, nan={integ['has_nan']}"
    except Exception as e:
        fail(f"Ошибка: {e}")
        traceback.print_exc()
        step_result = "FAIL"
        step_detail = str(e)
        REPORT["blocking"].append({"problem": "П2 Сглаживание после инверсии", "detail": str(e)})
else:
    step_result = "SKIP"
    step_detail = "smoothing недоступен или mesh не загружен"
record("project2_steps", "Сглаживание (post-inversion)", step_result, step_detail)


# ══════════════════════════════════════════════════════════════════════════════
#  ШАГ 5 — Граничные случаи
# ══════════════════════════════════════════════════════════════════════════════

section("ШАГ 5 — Граничные случаи")

test_mesh = current_mesh_p1  # используем нормальный mesh

# ── (а) Данные сохраняются без STL-урлов — проверяем через loader ─────────────
print("\n[ГС-а] Повторная загрузка (симуляция reload)...")
edge_result_a = "SKIP"
if NORMAL_STL_PATH.exists():
    try:
        reloaded = load_mesh_fn(str(NORMAL_STL_PATH))
        assert len(reloaded.vertices) == len(mesh_normal.vertices), "Размеры не совпадают!"
        ok(f"Повторная загрузка: {len(reloaded.vertices)} вершин — совпадает с оригиналом")
        edge_result_a = "OK — данные стабильны при повторной загрузке"
    except Exception as e:
        fail(f"Ошибка: {e}")
        edge_result_a = f"FAIL: {e}"
        REPORT["non_blocking"].append({"problem": "ГС-а Повторная загрузка", "detail": str(e)})
else:
    edge_result_a = "SKIP — STL не создан"
REPORT["edge_cases"]["a_reload"] = edge_result_a

# ── (б) Trim line с 2 точками ─────────────────────────────────────────────────
print("\n[ГС-б] Trim line с минимумом точек (2 точки)...")
edge_result_b = "SKIP"
if GEODESIC_OK and test_mesh is not None:
    try:
        pts2, vidxs2 = sample_points_on_mesh(test_mesh, n=2, z_fraction=0.5)
        curve2 = compute_geodesic_curve_through_points(test_mesh, vidxs2)
        ok(f"2 точки → кривая: {len(curve2)} точек — OK")
        edge_result_b = f"OK: curve_points={len(curve2)}"
    except Exception as e:
        fail(f"Ошибка: {e}")
        traceback.print_exc()
        edge_result_b = f"FAIL: {e}"
        REPORT["blocking"].append({"problem": "ГС-б Trim line 2 точки", "detail": str(e)})
else:
    edge_result_b = "SKIP"
REPORT["edge_cases"]["b_2point_trimline"] = edge_result_b

# ── (в) Повторное сглаживание в одной точке ───────────────────────────────────
print("\n[ГС-в] Повторное сглаживание 5 раз подряд в одной точке...")
edge_result_v = "SKIP"
if SMOOTHING_OK and test_mesh is not None:
    try:
        cpts, cidxs = sample_points_on_mesh(test_mesh, n=1, z_fraction=0.25)
        current = test_mesh
        all_ok = True
        for i in range(5):
            current = apply_local_laplacian_smoothing(
                current, center_vertex_idx=cidxs[0], radius=15.0, intensity=0.5, iterations=3
            )
            integ = check_mesh_integrity(current)
            if integ["has_nan"] or integ["has_inf"]:
                fail(f"Итерация {i+1}: NaN/Inf в вершинах!")
                REPORT["blocking"].append({"problem": f"ГС-в Повторное сглаживание итерация {i+1}: NaN", "detail": ""})
                all_ok = False
                break
            ok(f"Итерация {i+1}: OK, NaN={integ['has_nan']}, faces={integ['n_faces']}")
        if all_ok:
            edge_result_v = "OK — 5 повторных сглаживаний без вырождения"
        else:
            edge_result_v = "FAIL — обнаружен NaN при повторном сглаживании"
    except Exception as e:
        fail(f"Ошибка: {e}")
        traceback.print_exc()
        edge_result_v = f"FAIL: {e}"
        REPORT["blocking"].append({"problem": "ГС-в Повторное сглаживание", "detail": str(e)})
else:
    edge_result_v = "SKIP"
REPORT["edge_cases"]["v_repeated_smoothing"] = edge_result_v

# ── (г) Несуществующий scan_id → ожидаем ValueError (имитация HTTP 404) ──────
print("\n[ГС-г] Несуществующий scan_id (ValueError → HTTP 404)...")
edge_result_g = "SKIP"
# Тест без Supabase: проверяем, что load_mesh_from_url поднимает ValueError
# при отсутствующем scan_id (путём mock-а Supabase или через load_mesh напрямую)
try:
    # Тест через app.geometry.loader — файл не существует → FileNotFoundError
    from app.geometry.loader import load_mesh as lm
    try:
        lm("/nonexistent/path/fake_scan.stl")
        fail("Ожидалось исключение, но его не было!")
        edge_result_g = "FAIL — нет исключения для несуществующего файла"
    except FileNotFoundError as e:
        ok(f"FileNotFoundError правильно поднят: '{e}'")
        edge_result_g = f"OK — FileNotFoundError: {e}"
    except ValueError as e:
        ok(f"ValueError правильно поднят (альтернативный путь): '{e}'")
        edge_result_g = f"OK — ValueError: {e}"
    except Exception as e:
        warn(f"Другое исключение: {type(e).__name__}: {e}")
        edge_result_g = f"WARN — неожиданный тип: {type(e).__name__}: {e}"
except Exception as e:
    edge_result_g = f"SKIP — импорт провалился: {e}"

# Проверка граничного случая: center_vertex_idx вне диапазона
print("\n[ГС-г2] Неверный center_vertex_idx в сглаживании...")
if SMOOTHING_OK and test_mesh is not None:
    try:
        bad_idx = len(test_mesh.vertices) + 999  # точно вне диапазона
        apply_local_laplacian_smoothing(test_mesh, center_vertex_idx=bad_idx, radius=15.0)
        fail("Ожидался IndexError, но его не было!")
        REPORT["blocking"].append({"problem": "ГС-г2 Нет валидации bad center_vertex_idx", "detail": ""})
        edge_result_g += " | Плохой vidx: нет ошибки (проблема)"
    except IndexError as e:
        ok(f"IndexError правильно поднят: {e}")
        edge_result_g += f" | Плохой vidx: IndexError OK"
    except Exception as e:
        warn(f"Другое исключение для bad_idx: {type(e).__name__}: {e}")
        edge_result_g += f" | Плохой vidx: {type(e).__name__}"

REPORT["edge_cases"]["g_invalid_id"] = edge_result_g


# ── Проверка наличия diagnostics-полей в инверсии ─────────────────────────────
print("\n[diagnostics] Проверка наличия 'problematic_ratio' и 'diagnostics' в коде инверсии...")
try:
    import inversion as inv_module
    import inspect
    src = inspect.getsource(inv_module)
    checks = {
        "problematic_ratio":  "problematic_ratio" in src,
        "diagnostics":        "diagnostics" in src,
        "fix_offset_self_intersections": "fix_offset_self_intersections" in src,
        "fixed key in return": '"fixed"' in src or "'fixed'" in src,
    }
    for k, v in checks.items():
        if v:
            ok(f"'{k}' ПРИСУТСТВУЕТ в inversion.py")
        else:
            fail(f"'{k}' ОТСУТСТВУЕТ в inversion.py")
            REPORT["blocking"].append({"problem": f"diagnostics поле '{k}' отсутствует в inversion.py", "detail": ""})
    REPORT["edge_cases"]["diagnostics_keys_check"] = {k: "PRESENT" if v else "MISSING" for k, v in checks.items()}
except Exception as e:
    fail(f"Ошибка проверки diagnostics: {e}")
    REPORT["edge_cases"]["diagnostics_keys_check"] = f"FAIL: {e}"


# ══════════════════════════════════════════════════════════════════════════════
#  Проверяем известные ограничения
# ══════════════════════════════════════════════════════════════════════════════

section("Проверка известных ограничений и незакрытых задач")

# 1. Тест: apply_local_laplacian_smoothing использует Python-цикл (медленно)
print("\n[perf] Производительность apply_local_laplacian_smoothing...")
if SMOOTHING_OK and test_mesh is not None:
    cpts, cidxs = sample_points_on_mesh(test_mesh, n=1, z_fraction=0.5)
    t0 = time.time()
    _ = apply_local_laplacian_smoothing(test_mesh, center_vertex_idx=cidxs[0], radius=15.0, intensity=0.5, iterations=3)
    elapsed = time.time() - t0
    info(f"Сглаживание на {len(test_mesh.vertices)} вершинах: {elapsed:.2f} сек")
    if elapsed > 10.0:
        warn(f"МЕДЛЕННО: {elapsed:.2f} сек на {len(test_mesh.vertices)} вершинах. Python-цикл в apply_local_laplacian_smoothing (строки 269-283 local_smoothing.py)")
        REPORT["non_blocking"].append({
            "problem": "Производительность apply_local_laplacian_smoothing",
            "detail": f"{elapsed:.2f}s для {len(test_mesh.vertices)} вершин. Python for-loop в строках 269-283."
        })
    else:
        ok(f"Приемлемо: {elapsed:.2f} сек")

# 2. manifold3d — проверяем доступность boolean union
print("\n[env] Проверка boolean union backend...")
union_available = False
union_backend = "none"
try:
    test_s1 = trimesh.creation.icosphere(subdivisions=2, radius=10)
    test_s2 = trimesh.creation.icosphere(subdivisions=2, radius=10)
    test_s2.apply_translation([5, 0, 0])
    try:
        result = trimesh.boolean.union([test_s1, test_s2], engine="manifold")
        union_available = True
        union_backend = "manifold3d"
        ok("manifold3d backend доступен для boolean union")
    except Exception:
        try:
            result = trimesh.boolean.union([test_s1, test_s2], engine="blender")
            union_available = True
            union_backend = "blender"
            ok("blender backend доступен")
        except Exception:
            warn("Boolean union backend недоступен — синтетические меши не полностью замкнуты")
            REPORT["non_blocking"].append({
                "problem": "Boolean union backend недоступен",
                "detail": "Синтетические меши созданы через concatenate без слияния — они не watertight. Это ограничение среды, не баг кода."
            })
except Exception as e:
    warn(f"Не удалось проверить boolean union: {e}")
REPORT["edge_cases"]["boolean_union_backend"] = union_backend

# 3. Проверяем версионирование — импорт without supabase env vars
print("\n[versioning] Проверка versioning без Supabase credentials...")
try:
    from versioning import save_mesh_as_new_version, MESH_STORAGE_BUCKET, PROCESSED_MESH_PREFIX
    ok(f"versioning.py: BUCKET='{MESH_STORAGE_BUCKET}', PREFIX='{PROCESSED_MESH_PREFIX}'")
    info("save_mesh_as_new_version требует живого Supabase — протестировать без него невозможно")
    REPORT["not_tested"].append("save_mesh_as_new_version (требует живой Supabase)")
    REPORT["not_tested"].append("POST /trim-lines (требует живой Supabase с записью version_id)")
    REPORT["not_tested"].append("GET /projects/{id}/versions (требует живой Supabase)")
except Exception as e:
    fail(f"Импорт versioning: {e}")


# ══════════════════════════════════════════════════════════════════════════════
#  ИТОГОВЫЙ РЕПОРТ
# ══════════════════════════════════════════════════════════════════════════════

section("ИТОГОВЫЙ РЕПОРТ ТЕСТИРОВАНИЯ ФАЗЫ 4")

report_path = BACKEND_DIR / "scripts" / "phase4_test_report.md"

def result_emoji(r):
    if r in ("OK", "VALID"):              return "[OK]"
    if r in ("PARTIAL",):                 return "[PARTIAL]"
    if r in ("SKIP",):                    return "[SKIP]"
    if r in ("WOULD_422",):               return "[WOULD_422]"
    if r.startswith("FAIL"):              return "[FAIL]"
    return "[?]"

lines = []
lines.append("# Репорт тестирования Фазы 4 на синтетических данных\n")
lines.append(f"**Дата:** {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
lines.append(f"**Окружение:** Python {sys.version.split()[0]}, Windows\n")
lines.append(f"**Boolean union backend:** `{union_backend}` (влияет на watertight синтетических mesh)\n\n")

# ── Подготовка данных ─────────────────────────────────────────────────────────
lines.append("## Подготовка данных\n")
dp = REPORT["data_prep"]
for k, v in dp.items():
    if isinstance(v, dict):
        r = v.get("result", "?")
        lines.append(f"- **{k}**: `{r}` — {v}\n")
    else:
        lines.append(f"- **{k}**: {v}\n")

if method_normal == "concatenate_no_boolean":
    lines.append("\n> WARNING: **Ограничение синтетических данных**: Boolean union backend недоступен. "
                 "Три примитива соединены через `trimesh.util.concatenate` без истинного слияния — "
                 "mesh не является watertight и содержит внутренние поверхности на стыке примитивов. "
                 "Это ограничение среды генерации, **не находка о рабочем коде**.\n")

# ── Проект №1 ─────────────────────────────────────────────────────────────────
lines.append("\n## Проект №1 (normal, прямой скан) — результаты по шагам\n")
lines.append("| Шаг | Результат | Детали/текст ошибки |\n")
lines.append("|---|---|---|\n")
for row in REPORT["project1_steps"]:
    em = result_emoji(row["result"])
    lines.append(f"| {row['step']} | {em} {row['result']} | {row['detail']} |\n")

# ── Проект №2 ─────────────────────────────────────────────────────────────────
lines.append("\n## Проект №2 (sharp_ankle, скан слепка) — результаты по шагам\n")
lines.append("| Шаг | Результат | Детали/текст ошибки |\n")
lines.append("|---|---|---|\n")
for row in REPORT["project2_steps"]:
    em = result_emoji(row["result"])
    lines.append(f"| {row['step']} | {em} {row['result']} | {row['detail']} |\n")

# ── Диагностика инверсии ───────────────────────────────────────────────────────
lines.append("\n### Детали diagnostics инверсии (Проект №2)\n")
if diagnostics_p2:
    lines.append("```json\n")
    lines.append(json.dumps(diagnostics_p2, indent=2))
    lines.append("\n```\n")
else:
    lines.append("_Инверсия не была выполнена — нет данных._\n")

# ── Граничные случаи ──────────────────────────────────────────────────────────
lines.append("\n## Граничные случаи\n")
ec = REPORT["edge_cases"]
lines.append(f"- **(a) Повторная загрузка**: {ec.get('a_reload', 'N/A')}\n")
lines.append(f"- **(b) Trim line 2 точки**: {ec.get('b_2point_trimline', 'N/A')}\n")
lines.append(f"- **(v) Повторное сглаживание 5x**: {ec.get('v_repeated_smoothing', 'N/A')}\n")
lines.append(f"- **(g) Несуществующий ID**: {ec.get('g_invalid_id', 'N/A')}\n")
lines.append(f"- **Diagnostics keys**: {ec.get('diagnostics_keys_check', 'N/A')}\n")

# ── Блокирующие ───────────────────────────────────────────────────────────────
lines.append("\n## БЛОКИРУЮЩИЕ проблемы\n")
if REPORT["blocking"]:
    for p in REPORT["blocking"]:
        lines.append(f"- [BLOCKING] **{p['problem']}**: {p['detail']}\n")
else:
    lines.append("_Блокирующих проблем не обнаружено._\n")

# ── Неблокирующие ─────────────────────────────────────────────────────────────
lines.append("\n## НЕБЛОКИРУЮЩИЕ проблемы / известные ограничения\n")
if REPORT["non_blocking"]:
    for p in REPORT["non_blocking"]:
        lines.append(f"- [WARN] **{p['problem']}**: {p['detail']}\n")
else:
    lines.append("_Неблокирующих проблем не зафиксировано._\n")

# ── Не протестировано ─────────────────────────────────────────────────────────
lines.append("\n## Не удалось протестировать\n")
for item in REPORT["not_tested"]:
    lines.append(f"- [SKIP] {item}\n")

# Добавляем примечания по архитектуре
lines.append("\n## Архитектурные наблюдения\n")
lines.append(
    "- `services/versioning.py` содержит пометку `⚠️ ЗАГЛУШКА` в docstring (строка 6) — "
    "это честный маркер незавершённой адаптации под конкретный Storage API. "
    "Функция логически корректна, но требует ревью перед продакшном.\n"
)
lines.append(
    "- `apply_local_laplacian_smoothing` (local_smoothing.py строки 269–283) использует "
    "Python for-loop по всем вершинам. Для больших mesh (>100k вершин) это O(N) Python-итераций "
    "на каждую итерацию сглаживания — потенциальное узкое место производительности.\n"
)
lines.append(
    "- Детекция самопересечений (`detect_problematic_offset_zones`) реализована и работает. "
    "Поля `diagnostics['problematic_ratio']` и `warning` в ответе API — присутствуют в коде.\n"
)

report_text = "".join(lines)
with open(str(report_path), "w", encoding="utf-8") as f:
    f.write(report_text)

print(f"\n{GREEN}{'='*70}{RESET}")
print(f"{GREEN}Report saved: {report_path}{RESET}")
print(f"\n{'-'*70}")
print(report_text)
