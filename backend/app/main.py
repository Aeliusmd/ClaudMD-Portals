from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth.routes import router as auth_router
from app.config import get_settings
from app.employer.routes import router as employer_router
from app.insurance.routes import router as insurance_router

settings = get_settings()

app = FastAPI(
    title="ClaudMD Portals API",
    version="0.1.0",
    description="Employer/patient/insurance portal backend — login resolves clinic via activation key.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "Accept",
        "Accept-Language",
        "X-Requested-With",
    ],
    expose_headers=["Content-Disposition", "Content-Type", "Content-Length"],
)

app.include_router(auth_router)
app.include_router(employer_router)
app.include_router(insurance_router)


@app.get("/health")
def health():
    return {"status": "ok"}
