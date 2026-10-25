"""
Root conftest.py for backend tests.

Ensures that `backend/` is on sys.path regardless of the working directory
from which pytest is invoked (e.g., repo root, backend/, or CI).
This fixes the import-resolution problem described in the task:
  "запуск зависит от текущей директории".
"""

import sys
from pathlib import Path

# Add the backend/ directory to sys.path so that `from app.xxx import …`
# resolves correctly even when pytest is run from the repository root.
BACKEND_DIR = Path(__file__).parent.resolve()
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
