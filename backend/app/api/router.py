from app.api.system import router as system_router
from fastapi import APIRouter

api_router = APIRouter(prefix="/api")
api_router.include_router(system_router)
