"""
backend/app/core/config.py

Конфигурация приложения.
Загрузка переменных окружения из .env.local (с приоритетом над системными переменными).
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Ищем .env.local в корне backend или проекте
BASE_DIR = Path(__file__).resolve().parent.parent.parent
dotenv_path = BASE_DIR / ".env.local"
if dotenv_path.exists():
    load_dotenv(dotenv_path=dotenv_path)
else:
    load_dotenv()

SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY: str = os.getenv(
    "SUPABASE_SERVICE_KEY", os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
)
GEODESIC_TIMEOUT_SEC: float = 25.0
