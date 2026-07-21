import trimesh
from pathlib import Path
from typing import Union

def load_mesh(filepath: Union[str, Path]) -> trimesh.Trimesh:
    """
    Loads a 3D mesh from an STL, OBJ, or PLY file.
    
    Args:
        filepath (Union[str, Path]): The path to the mesh file.
        
    Returns:
        trimesh.Trimesh: The loaded mesh object.
        
    Raises:
        FileNotFoundError: If the file does not exist.
        ValueError: If the file format is not supported or if the file cannot be loaded.
    """
    filepath = Path(filepath)
    if not filepath.exists():
        raise FileNotFoundError(f"Файл не найден: {filepath}")
        
    supported_extensions = {'.stl', '.obj', '.ply'}
    if filepath.suffix.lower() not in supported_extensions:
        raise ValueError(f"Неподдерживаемый формат файла: {filepath.suffix}. Поддерживаемые форматы: {', '.join(supported_extensions)}")

    try:
        mesh = trimesh.load(str(filepath), force='mesh')
        
        if not isinstance(mesh, trimesh.Trimesh):
            raise ValueError(f"Не удалось загрузить действительный объект Trimesh из {filepath}")
            
        return mesh
    except Exception as e:
        raise ValueError(f"Ошибка при загрузке файла {filepath}: {e}")
