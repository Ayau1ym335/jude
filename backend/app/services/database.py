"""
Supabase-клиент — единственная точка входа для работы с БД.
Moved to app.core.database.
"""

from app.core.database import get_supabase

__all__ = ["get_supabase"]
