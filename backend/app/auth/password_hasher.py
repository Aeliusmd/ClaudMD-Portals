"""ASP.NET Core Identity PasswordHasher V3-compatible helpers (PBKDF2-SHA256)."""

from __future__ import annotations

import base64
import hashlib
import hmac
import os

# Identity V3 defaults used by ClaudMD UserProfiles.Password hashes.
_IDENTITY_VERSION = 0x01
_PRF_HMAC_SHA256 = 1
_ITER_COUNT = 10_000
_SALT_SIZE = 16
_SUBKEY_SIZE = 32


def hash_password(password: str) -> str:
    """Return base64 Identity V3 password hash for storage in UserProfiles.Password."""
    if password is None:
        raise ValueError("password is required")
    salt = os.urandom(_SALT_SIZE)
    subkey = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        _ITER_COUNT,
        dklen=_SUBKEY_SIZE,
    )
    payload = bytearray()
    payload.append(_IDENTITY_VERSION)
    payload.extend(_PRF_HMAC_SHA256.to_bytes(4, "big"))
    payload.extend(_ITER_COUNT.to_bytes(4, "big"))
    payload.extend(_SALT_SIZE.to_bytes(4, "big"))
    payload.extend(salt)
    payload.extend(subkey)
    return base64.b64encode(bytes(payload)).decode("ascii")


def verify_password(hashed_password: str | None, provided_password: str) -> bool:
    """Verify a plaintext password against an Identity V2/V3 stored hash."""
    if not hashed_password or provided_password is None:
        return False
    try:
        decoded = base64.b64decode(hashed_password)
    except Exception:
        return False
    if not decoded:
        return False

    version = decoded[0]
    if version == 0x00:
        return _verify_v2(decoded, provided_password)
    if version == 0x01:
        return _verify_v3(decoded, provided_password)
    return False


def _verify_v3(decoded: bytes, provided_password: str) -> bool:
    if len(decoded) < 13:
        return False
    prf = int.from_bytes(decoded[1:5], "big")
    iter_count = int.from_bytes(decoded[5:9], "big")
    salt_len = int.from_bytes(decoded[9:13], "big")
    if prf != _PRF_HMAC_SHA256 or iter_count <= 0 or salt_len <= 0:
        return False
    if len(decoded) < 13 + salt_len + _SUBKEY_SIZE:
        return False
    salt = decoded[13 : 13 + salt_len]
    expected = decoded[13 + salt_len : 13 + salt_len + _SUBKEY_SIZE]
    actual = hashlib.pbkdf2_hmac(
        "sha256",
        provided_password.encode("utf-8"),
        salt,
        iter_count,
        dklen=len(expected),
    )
    return hmac.compare_digest(actual, expected)


def _verify_v2(decoded: bytes, provided_password: str) -> bool:
    # Legacy Identity V2: 0x00 | salt(16) | subkey(32), 1000 iterations, HMAC-SHA1
    if len(decoded) != 1 + 16 + 32:
        return False
    salt = decoded[1:17]
    expected = decoded[17:49]
    actual = hashlib.pbkdf2_hmac(
        "sha1",
        provided_password.encode("utf-8"),
        salt,
        1000,
        dklen=32,
    )
    return hmac.compare_digest(actual, expected)
