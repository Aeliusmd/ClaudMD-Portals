# ClaudMD Portals API

FastAPI backend for portal login via ClaudMD IdentityServer.

## Login flow

1. Frontend posts username + password + `activationKey` to `POST /api/auth/login`
2. Backend proxies IdentityServer password grant:
   `POST {IDENTITY_URL}/connect/token`
3. Identity returns `access_token` / `refresh_token`
4. Backend returns those tokens to the frontend (plus user claims)
5. Later API calls use `Authorization: Bearer {access_token}`

Login does **not** write to any database. Optional master-DB clinic lookup is SELECT-only metadata.

## Setup

```bash
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

## Endpoints

- `GET /health`
- `GET /api/auth/clinic?activationKey=20000002` (optional read-only)
- `POST /api/auth/login`
- `POST /api/auth/change-password` (Bearer token; same as Profile → Security)

  1. IdentityServer password grant verifies the current password
  2. `UserProfiles.Password` is updated with an ASP.NET Identity V3 hash
  3. `IsPasswordChanged` is set to `1`
  4. IdentityServer password grant confirms the new password before success is returned

```json
{
  "username": "testclaudmd@gmail.com",
  "password": "1234",
  "activationKey": "20000002"
}
```
