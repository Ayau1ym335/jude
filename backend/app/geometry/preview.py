import trimesh
from typing import Optional

def create_preview_mesh(original_mesh_path: str, target_faces: int = 50000) -> Optional[trimesh.Trimesh]:
    """
    Создаёт упрощённую версию mesh для быстрого превью в viewer.
    Оригинальный высокодетальный файл остаётся нетронутым для операций
    ректификации (Фазы 3-5) и финального экспорта (Фаза 5).
    """
    try:
        mesh = trimesh.load(original_mesh_path)
        
        # Если загрузилась сцена (например, из OBJ), склеиваем в один меш
        if isinstance(mesh, trimesh.Scene):
            if len(mesh.geometry) == 0:
                return None
            mesh = trimesh.util.concatenate(
                tuple(trimesh.Trimesh(vertices=g.vertices, faces=g.faces) for g in mesh.geometry.values())
            )

        original_face_count = len(mesh.faces)
        
        if original_face_count <= target_faces:
            # Скан уже достаточно лёгкий, decimation не нужен
            return mesh
        
        # Упрощение геометрии
        simplified = mesh.simplify_quadric_decimation(face_count=target_faces)
        return simplified
    except Exception as e:
        print(f"Ошибка при создании превью меша: {e}")
        return None
