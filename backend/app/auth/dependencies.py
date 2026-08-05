from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Header, HTTPException, status

from app.auth.identity import CLAIM_NAME, CLAIM_NAME_ID, decode_access_token_claims


class CurrentUser:
    def __init__(
        self,
        *,
        user_id: int | None,
        login_id: str,
        email: str | None,
        activation_key: str,
        display_name: str | None,
    ):
        self.user_id = user_id
        self.login_id = login_id
        self.email = email
        self.activation_key = activation_key
        self.display_name = display_name


def get_bearer_token(authorization: Annotated[str | None, Header()] = None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = authorization[7:].strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return token


def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
) -> CurrentUser:
    token = get_bearer_token(authorization)
    claims = decode_access_token_claims(token)
    if not claims:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id_raw = claims.get("UserId") or claims.get(CLAIM_NAME_ID) or claims.get("sub")
    try:
        user_id = int(user_id_raw) if user_id_raw is not None else None
    except (TypeError, ValueError):
        user_id = None

    login_id = (
        claims.get("LoginId")
        or claims.get("email")
        or claims.get("preferred_username")
        or ""
    )
    activation_key = str(claims.get("ActivationKey") or "").strip()
    if not activation_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Activation key missing from token.",
        )

    email = str(login_id) if "@" in str(login_id) else None
    display_name = claims.get(CLAIM_NAME)

    return CurrentUser(
        user_id=user_id,
        login_id=str(login_id),
        email=email,
        activation_key=activation_key,
        display_name=str(display_name) if display_name else None,
    )
