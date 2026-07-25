import trimesh
from pygeodesic.geodesic import PyGeodesicAlgorithmExact

def main():
    print("Creating icosphere...")
    mesh = trimesh.creation.icosphere()
    
    vertices = mesh.vertices
    faces = mesh.faces
    
    print(f"Mesh has {len(vertices)} vertices and {len(faces)} faces.")
    
    source_index = 0
    target_index = len(vertices) // 2
    
    print(f"Computing geodesic from vertex {source_index} to {target_index}...")
    
    geoalg = PyGeodesicAlgorithmExact(vertices, faces)
    distance, path = geoalg.geodesicDistance(source_index, target_index)
    
    print(f"Path length: {distance}")
    print(f"Number of points in path: {len(path)}")
    
    if len(path) > 2:
        print("Success: path has more than 2 points!")
    else:
        print("Warning: path has 2 or fewer points.")

if __name__ == "__main__":
    main()
