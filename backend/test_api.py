import sys
from pathlib import Path
from uuid import UUID

# Add backend to path so we can import app modules
backend_path = Path("c:/Users/user/Desktop/jude/backend").resolve()
sys.path.insert(0, str(backend_path))

from app.routers.projects import list_projects
from app.dependencies.auth import CurrentUser

def test_api():
    try:
        # Create a mock user
        mock_user = CurrentUser(id=UUID("00000000-0000-0000-0000-000000000000"), email="test@test.com")
        
        # Call list_projects without patient_id
        result_all = list_projects(patient_id=None, user=mock_user)
        print(f"Total projects (no filter): {result_all.total}")
        
        if result_all.items:
            # Pick a patient_id from the first project
            test_patient_id = result_all.items[0].patient_id
            
            # Call list_projects with patient_id filter
            result_filtered = list_projects(patient_id=test_patient_id, user=mock_user)
            print(f"Total projects for patient {test_patient_id}: {result_filtered.total}")
            
            assert all(p.patient_id == test_patient_id for p in result_filtered.items)
            print("SUCCESS: Filtering by patient_id works!")
            
            # Check if scan_validation_status is joined properly
            has_status = hasattr(result_filtered.items[0], 'scan_validation_status')
            print(f"Has scan_validation_status: {has_status}")
            
            # Note: in real db, if there are no scans or it wasn't validated, it might be None
            # But the property should exist
        else:
            print("No projects found in DB to test filtering.")
            
    except Exception as e:
        print(f"ERROR: {e}")

if __name__ == "__main__":
    test_api()
