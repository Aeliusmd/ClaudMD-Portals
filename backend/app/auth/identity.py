from __future__ import annotations

import base64
import json
from typing import Any

import httpx
from fastapi import HTTPException, status

from app.config import get_settings


CLAIM_NAME = "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"
CLAIM_NAME_ID = (
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"
)


def request_password_token(
    *,
    username: str,
    password: str,
    activation_key: str,
) -> dict[str, Any]:
    """
    Call IdentityServer password grant (same contract as mother Angular app).
    Does not touch any clinic/master database tables.
    """
    settings = get_settings()
    form = {
        "grant_type": "password",
        "username": username.strip(),
        "password": password,
        "client_id": settings.identity_client_id,
        "client_secret": settings.identity_client_secret,
        "Key": activation_key.strip(),
        "scope": settings.identity_scope,
    }

    try:
        with httpx.Client(timeout=30.0) as client:
            response = client.post(
                settings.identity_token_url,
                data=form,
                headers={
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Accept": "application/json",
                },
            )
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to reach IdentityServer. Please try again later.",
        ) from exc

    try:
        payload = response.json()
    except Exception:
        payload = {}

    if response.is_success and payload.get("access_token"):
        return payload

    detail = _identity_error_message(payload, response.status_code)
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
    )


def decode_access_token_claims(access_token: str) -> dict[str, Any]:
    """Decode JWT payload without signature verification (claims for UI only)."""
    try:
        parts = access_token.split(".")
        if len(parts) < 2:
            return {}
        padded = parts[1] + "=" * (-len(parts[1]) % 4)
        return json.loads(base64.urlsafe_b64decode(padded.encode("utf-8")))
    except Exception:
        return {}


def claims_to_user_fields(claims: dict[str, Any], fallback_username: str) -> dict[str, Any]:
    user_id_raw = claims.get("UserId") or claims.get(CLAIM_NAME_ID) or claims.get("sub")
    try:
        user_id = int(user_id_raw) if user_id_raw is not None else None
    except (TypeError, ValueError):
        user_id = None

    login_id = (
        claims.get("LoginId")
        or claims.get("email")
        or claims.get("preferred_username")
        or fallback_username
    )
    display_name = claims.get(CLAIM_NAME) or ""
    first_name = None
    last_name = None
    if display_name.strip():
        bits = display_name.strip().split(None, 1)
        first_name = bits[0]
        last_name = bits[1] if len(bits) > 1 else None

    return {
        "id": user_id,
        "login_id": str(login_id),
        "email": str(login_id) if "@" in str(login_id) else None,
        "first_name": first_name,
        "last_name": last_name,
        "activation_key": str(claims.get("ActivationKey") or ""),
        "name": display_name or None,
    }


def _identity_error_message(payload: dict[str, Any], status_code: int) -> str:
    error = (payload or {}).get("error")
    description = (payload or {}).get("error_description")

    if error in {"invalid_grant", "invalid_username_or_password"}:
        return "Invalid username or password."
    if error == "invalid_client":
        return "Identity client configuration is invalid."
    if description:
        return str(description)
    if error:
        return f"Identity login failed ({error})."
    if status_code >= 500:
        return "IdentityServer is unavailable. Please try again later."
    return "Invalid username or password."
