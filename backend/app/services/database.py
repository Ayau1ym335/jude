"""
Supabase-клиент — единственная точка входа для работы с БД.

Используется как синглтон: один объект Client на весь процесс.
Роутеры получают клиент через get_supabase() — это позволяет
при необходимости легко подменить его в тестах (monkeypatch).
"""

import os

from dotenv import load_dotenv
from supabase import Client, create_client

# Загружаем .env.local (приоритет над системными переменными).
# В продакшене переменные проставляются напрямую — load_dotenv их не перезапишет.
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", "..", ".env.local"))

_client: Client | None = None


def get_supabase() -> Client:
    """Вернуть синглтон Supabase-клиента (ленивая инициализация)."""
    global _client
    if _client is None:
        url = os.environ["SUPABASE_URL"]
        key = os.environ["SUPABASE_SERVICE_KEY"]
        _client = create_client(url, key)
    return _client
