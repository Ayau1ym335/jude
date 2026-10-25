"""
backend/app/dependencies/auth.py

Compatibility re-export module for authentication dependencies.
Moved to app.core.auth.
"""

from app.core.auth import (
    CurrentUser,
    get_current_user,
    require_role,
    _load_user_role,
)

__all__ = ["CurrentUser", "get_current_user", "require_role", "_load_user_role"]
