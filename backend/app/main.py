from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path

from app.api.router import api_router
from app.core.config import settings
from app.core.errors import (
    GiggleException,
    generic_exception_handler,
    giggle_exception_handler,
)
from app.core.logger import logger, setup_logging
from app.db.session import init_db
from app.utils.hardware import HardwareDetector
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # 1. Initialize logging
    setup_logging(settings.storage.logs_dir, settings.debug)
    logger.info("Initializing Giggle Studio backend...")

    # 2. Initialize Database tables
    await init_db()
    logger.info("Database initialized successfully at %s", settings.storage.sqlite_path)

    # 3. Detect and pin NVIDIA GPU
    gpu_info = HardwareDetector.get_nvidia_device_info()
    if gpu_info.get("available"):
        logger.info(
            "Primary GPU resolved: %s (NVML Index: %s)",
            gpu_info.get("name"),
            gpu_info.get("index"),
        )
    else:
        logger.warning("No NVIDIA GPU resolved! Fallback CPU mode active.")

    yield

    logger.info("Shutting down Giggle Studio backend...")


app = FastAPI(
    title=settings.app.name,
    version=settings.app.version,
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.server.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Error handlers
app.add_exception_handler(GiggleException, giggle_exception_handler)
app.add_exception_handler(Exception, generic_exception_handler)

# Include main API router
app.include_router(api_router)

# Mount frontend build if it exists
frontend_dist = Path("frontend/dist")
if frontend_dist.exists() and (frontend_dist / "index.html").exists():
    app.mount("/assets", StaticFiles(directory=frontend_dist / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str) -> FileResponse:
        file_path = frontend_dist / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(frontend_dist / "index.html")
else:

    @app.get("/")
    async def root_fallback() -> dict[str, str]:
        return {
            "app": settings.app.name,
            "version": settings.app.version,
            "status": "online",
            "message_tr": "Giggle Studio API servisi aktif. Frontend derlemesi bekleniyor.",
        }
