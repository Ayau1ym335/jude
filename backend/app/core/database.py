"""
backend/app/core/database.py

Supabase-клиент — точка входа для работы с базой данных и хранилищем.
Реализован как синглтон с ленивой инициализацией.
"""

import os
from supabase import Client, create_client
from app.core.config import SUPABASE_URL, SUPABASE_SERVICE_KEY

_client: Client | None = None


def get_supabase() -> Client:
    """Вернуть синглтон Supabase-клиента (ленивая инициализация)."""
    global _client
    if _client is None:
        url = SUPABASE_URL or os.environ.get("SUPABASE_URL", "")
        key = SUPABASE_SERVICE_KEY or os.environ.get(
            "SUPABASE_SERVICE_KEY", os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        )
        _client = create_client(url, key)
    return _client
