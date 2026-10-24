from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers.geometry import router as geometry_router
from app.routers.landmarks import router as landmarks_router
from app.routers.patients import router as patient_router
from app.routers.projects import router as project_router
from app.routers.scans import router as scan_router
from app.routers.trim_lines import router as trim_lines_router
from app.routers.head_measurements import router_scans as head_meas_scans_router
from app.routers.head_measurements import router_patients as head_meas_patients_router

app = FastAPI(
    title="Jude API",
    description="Backend API для платформы проектирования jude",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "https://jude-cij6.vercel.app",
    ],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(patient_router)
app.include_router(scan_router)
app.include_router(landmarks_router)
app.include_router(project_router)
app.include_router(geometry_router)
app.include_router(trim_lines_router)
app.include_router(head_meas_scans_router)
app.include_router(head_meas_patients_router)


@app.get("/health", tags=["health"])
def health_check() -> dict:
    return {"status": "ok"}
