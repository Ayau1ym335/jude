"""
JWT-авторизация для FastAPI через Supabase access token.
"""

from typing import Callable
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from app.services.database import get_supabase

_bearer = HTTPBearer(auto_error=False)


class CurrentUser(BaseModel):
    id: UUID
    email: str | None = None
    role: str | None = None


def _load_user_role(user_id: UUID) -> str | None:
    db = get_supabase()
    response = (
        db.table("user_profiles")
        .select("role")
        .eq("user_id", str(user_id))
        .maybe_single()
        .execute()
    )
    if response.data is None:
        return None
    return response.data.get("role")


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> CurrentUser:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    token = credentials.credentials
    db = get_supabase()

    try:
        user_response = db.auth.get_user(token)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    
    if user_response.user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    user_id = UUID(user_response.user.id)
    role = _load_user_role(user_id)

    return CurrentUser(
        id=user_id,
        email=user_response.user.email,
        role=role,
    )


def require_role(required: str) -> Callable[..., CurrentUser]:
    def checker(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if user.role != required:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return user

    return checker
