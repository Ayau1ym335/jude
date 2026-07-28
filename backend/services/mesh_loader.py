import os
import tempfile
import httpx
import trimesh

from app.services.database import get_supabase
from app.geometry.loader import load_mesh

def load_mesh_from_url(scan_id: str) -> trimesh.Trimesh:
    """
    Downloads and loads a mesh from a scan ID, consistent with validation logic.
    """
    db = get_supabase()
    response = db.table("scans").select("file_url").eq("id", str(scan_id)).maybe_single().execute()
    
    if not response.data or not response.data.get("file_url"):
        raise ValueError(f"Scan with ID {scan_id} not found or has no file_url.")
        
    file_url = response.data["file_url"]
    
    if file_url.startswith("http://") or file_url.startswith("https://"):
        with httpx.Client() as client:
            resp = client.get(file_url)
            resp.raise_for_status()
            file_bytes = resp.content
    else:
        # Supabase Storage
        file_bytes = db.storage.from_("scan-files").download(file_url)
        
    ext = os.path.splitext(file_url)[1]
    if not ext:
        ext = ".stl"
        
    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name
        
    try:
        # use the existing load_mesh function to load it properly
        mesh = load_mesh(tmp_path)
        return mesh
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
