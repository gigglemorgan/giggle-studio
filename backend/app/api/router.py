from fastapi import APIRouter

from app.api.agent import router as agent_router
from app.api.chat import router as chat_router
from app.api.code import router as code_router
from app.api.gmail import router as gmail_router
from app.api.models import router as models_router
from app.api.plugins import router as plugins_router
from app.api.re import router as re_router
from app.api.system import router as system_router

api_router = APIRouter(prefix="/api")
api_router.include_router(system_router)
api_router.include_router(models_router)
api_router.include_router(chat_router)
api_router.include_router(code_router)
api_router.include_router(agent_router)
api_router.include_router(plugins_router)
api_router.include_router(gmail_router)
api_router.include_router(re_router)
