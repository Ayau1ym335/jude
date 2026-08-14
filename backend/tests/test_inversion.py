"""
Тест инверсии и offset: двойная инверсия + численное сравнение +
детекция/исправление самопересечений + экспорт для визуальной проверки.
"""
import sys
import os
import numpy as np

# Добавляем backend в путь
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import trimesh
from services.inversion import (
    invert_mesh_normals,
    offset_surface,
    detect_problematic_offset_zones,
    fix_offset_self_intersections,
    apply_cast_inversion_workflow,
)

STL_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..",
    "Left Foot.Ankle Detailed Bone Model-Edited STL.stl"
)
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "artifacts")


def test_double_inversion():
    """Двойная инверсия должна вернуть mesh, идентичный оригиналу."""
    print("=" * 60)
    print("ТЕСТ 1: Двойная инверсия (должна вернуть оригинал)")
    print("=" * 60)

    mesh = trimesh.load(STL_PATH)
    print(f"Оригинал: {len(mesh.vertices)} вершин, {len(mesh.faces)} граней")
    print(f"  bounding box extents: {mesh.bounding_box.extents}")

    inverted = invert_mesh_normals(mesh)
    print(f"\nПосле 1-й инверсии: bb={inverted.bounding_box.extents}")

    restored = invert_mesh_normals(inverted)
    print(f"После 2-й инверсии: bb={restored.bounding_box.extents}")

    vertex_diff = np.max(np.abs(mesh.vertices - restored.vertices))
    normal_diff = np.max(np.abs(mesh.vertex_normals - restored.vertex_normals))
    print(f"\n  Макс. разница вершин:   {vertex_diff:.2e}")
    print(f"  Макс. разница нормалей: {normal_diff:.2e}")

    if vertex_diff < 1e-10 and normal_diff < 1e-6:
        print("  [PASS] Двойная инверсия восстанавливает оригинал.")
    else:
        print("  [FAIL] Различия выше допустимых.")


def test_offset():
    """Offset должен увеличить bounding box примерно на 2 * offset_distance."""
    print("\n" + "=" * 60)
    print("ТЕСТ 2: Offset-операция")
    print("=" * 60)

    mesh = trimesh.load(STL_PATH)
    offset_dist = 4.0
    offset_mesh = offset_surface(mesh, offset_dist)

    orig_extents = mesh.bounding_box.extents
    offset_extents = offset_mesh.bounding_box.extents
    diff_extents = offset_extents - orig_extents

    print(f"Оригинал extents: {orig_extents}")
    print(f"Offset   extents: {offset_extents}")
    print(f"Разница extents:  {diff_extents}")
    print(f"Ожидание: ~{2 * offset_dist:.1f} мм по каждой оси (+-)")

    vertex_displacements = np.linalg.norm(
        offset_mesh.vertices - mesh.vertices, axis=1
    )
    print(f"  Средний сдвиг вершин: {vertex_displacements.mean():.2f} мм")
    print(f"  Мин/Макс сдвиг: {vertex_displacements.min():.2f} / {vertex_displacements.max():.2f} мм")


def test_detect_problematic_zones():
    """Детекция проблемных зон должна находить самопересечения после наивного offset."""
    print("\n" + "=" * 60)
    print("ТЕСТ 3: Детекция проблемных зон после наивного offset")
    print("=" * 60)

    mesh = trimesh.load(STL_PATH)
    inverted = invert_mesh_normals(mesh)
    offset_result = offset_surface(inverted, 4.0)

    problematic = detect_problematic_offset_zones(inverted, offset_result, 4.0, tolerance=0.3)
    count = problematic.sum()
    ratio = count / len(offset_result.vertices)

    print(f"Проблемных вершин:  {count} / {len(offset_result.vertices)}")
    print(f"Доля проблемных:    {ratio * 100:.2f}%")

    if count > 0:
        print(f"  [INFO] Обнаружены проблемные зоны - детекция работает корректно.")
    else:
        print(f"  [INFO] Проблемных зон не обнаружено (возможно, mesh слишком простой).")


def test_fix_self_intersections():
    """Исправление должно уменьшить число проблемных вершин."""
    print("\n" + "=" * 60)
    print("ТЕСТ 4: Исправление самопересечений (fix_offset_self_intersections)")
    print("=" * 60)

    mesh = trimesh.load(STL_PATH)
    inverted = invert_mesh_normals(mesh)
    offset_result = offset_surface(inverted, 4.0)

    # Проблемные зоны ДО исправления
    problematic_before = detect_problematic_offset_zones(inverted, offset_result, 4.0)
    count_before = int(problematic_before.sum())

    # Исправляем
    fixed_mesh, diagnostics = fix_offset_self_intersections(
        offset_result, inverted, offset_distance=4.0,
        tolerance=0.3, smoothing_iterations=5
    )
    count_after = diagnostics["problematic_vertices_after"]

    print(f"Проблемных вершин ДО:    {count_before}")
    print(f"Проблемных вершин ПОСЛЕ: {count_after}")
    print(f"Улучшение:               {count_before - count_after} вершин")
    print(f"diagnostics['fixed']:    {diagnostics['fixed']}")
    print(f"problematic_ratio:       {diagnostics['problematic_ratio'] * 100:.2f}%")

    if diagnostics["fixed"]:
        print("  [PASS] Автоисправление дало значимый результат.")
    else:
        print("  [WARN] Автоисправление НЕ дало значимого результата (< 50% улучшения).")

    # Базовые метрики после исправления
    print(f"\n  is_watertight: {fixed_mesh.is_watertight}")
    print(f"  is_winding_consistent: {fixed_mesh.is_winding_consistent}")
    print(f"  volume: {fixed_mesh.volume:.2f} мм3")


def test_full_workflow():
    """Полный cast_negative workflow с новой сигнатурой: возвращает (mesh, diagnostics)."""
    print("\n" + "=" * 60)
    print("ТЕСТ 5: Полный workflow apply_cast_inversion_workflow")
    print("=" * 60)

    mesh = trimesh.load(STL_PATH)

    # Имитируем негатив
    pseudo_negative = mesh.copy()
    pseudo_negative.invert()
    print(f"Оригинал:         {len(mesh.vertices)} вершин")
    print(f"Псевдо-негатив:   {len(pseudo_negative.vertices)} вершин")

    # Применяем полный workflow
    result, diagnostics = apply_cast_inversion_workflow(
        pseudo_negative, material_thickness=4.0
    )
    print(f"Результат:        {len(result.vertices)} вершин")

    print(f"\nОригинал bb:  {mesh.bounding_box.extents}")
    print(f"Результат bb: {result.bounding_box.extents}")

    print(f"\nDiagnostics:")
    for k, v in diagnostics.items():
        print(f"  {k}: {v}")

    # Экспорт для визуальной проверки
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    original_path = os.path.join(OUTPUT_DIR, "inversion_original.stl")
    result_path   = os.path.join(OUTPUT_DIR, "inversion_result.stl")
    fixed_path    = os.path.join(OUTPUT_DIR, "inversion_result_fixed.stl")

    mesh.export(original_path)
    result.export(fixed_path)
    print(f"\nЭкспортировано:")
    print(f"  Оригинал: {original_path}")
    print(f"  Результат (с исправлением): {fixed_path}")

    # Проверка
    print(f"\n--- Проверка результата ---")
    print(f"  is_watertight:          {result.is_watertight}")
    print(f"  is_winding_consistent:  {result.is_winding_consistent}")
    vol = result.volume
    print(f"  volume:                 {vol:.2f} мм3 ({'> 0 [PASS]' if vol > 0 else '< 0 [WARN] нормали вывернуты'})")

    # Тест: контрольные зоны (пологие участки) НЕ должны попасть под сглаживание
    # Косвенная проверка: если после workflow is_watertight сохранился — OK
    if result.is_watertight:
        print("  [PASS] Mesh остался watertight после исправления.")
    else:
        print("  [WARN] Mesh потерял watertight — возможно, исправление создало дыры.")


if __name__ == "__main__":
    test_double_inversion()
    test_offset()
    test_detect_problematic_zones()
    test_fix_self_intersections()
    test_full_workflow()
