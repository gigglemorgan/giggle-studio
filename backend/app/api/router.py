from fastapi import APIRouter

from app.api.chat import router as chat_router
from app.api.models import router as models_router
from app.api.system import router as system_router

api_router = APIRouter(prefix="/api")
api_router.include_router(system_router)
api_router.include_router(models_router)
api_router.include_router(chat_router)
