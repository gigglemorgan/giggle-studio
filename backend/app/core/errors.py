from fastapi import Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel


class ErrorDetail(BaseModel):
    code: str
    message_tr: str
    detail: str | None = None
    hint: str | None = None


class ErrorEnvelope(BaseModel):
    error: ErrorDetail


class GiggleException(Exception):
    def __init__(
        self,
        code: str,
        message_tr: str,
        detail: str | None = None,
        hint: str | None = None,
        status_code: int = 400,
    ):
        self.code = code
        self.message_tr = message_tr
        self.detail = detail
        self.hint = hint
        self.status_code = status_code
        super().__init__(detail or message_tr)


class HardwareLimitException(GiggleException):
    def __init__(self, message_tr: str, detail: str | None = None, hint: str | None = None):
        super().__init__(
            code="HARDWARE_LIMIT_EXCEEDED",
            message_tr=message_tr,
            detail=detail,
            hint=hint,
            status_code=422,
        )


class ModelNotFoundException(GiggleException):
    def __init__(self, model_id: str):
        super().__init__(
            code="MODEL_NOT_FOUND",
            message_tr=f"Belirtilen model bulunamadı: {model_id}",
            detail=f"Model with id '{model_id}' does not exist on disk or database.",
            hint="Model Yöneticisi sayfasından modelleri yeniden tarayın veya indirin.",
            status_code=404,
        )


class WorkerCrashException(GiggleException):
    def __init__(self, detail: str | None = None):
        super().__init__(
            code="INFERENCE_WORKER_CRASHED",
            message_tr="Çıkarım (inference) arka plan süreci beklenmedik şekilde sonlandı.",
            detail=detail or "Inference worker died with non-zero exit code.",
            hint="VRAM/RAM limitlerini aşmış olabilirsiniz. Katman sayısını düşürüp modeli yeniden yükleyin.",
            status_code=500,
        )


async def giggle_exception_handler(request: Request, exc: GiggleException) -> JSONResponse:
    content = ErrorEnvelope(
        error=ErrorDetail(
            code=exc.code,
            message_tr=exc.message_tr,
            detail=exc.detail,
            hint=exc.hint,
        )
    ).model_dump()
    return JSONResponse(status_code=exc.status_code, content=content)


async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    content = ErrorEnvelope(
        error=ErrorDetail(
            code="INTERNAL_SERVER_ERROR",
            message_tr="Sunucu tarafında beklenmeyen bir hata oluştu.",
            detail=str(exc),
            hint="Sistem günlüklerini (logs/giggle.log) inceleyiniz.",
        )
    ).model_dump()
    return JSONResponse(status_code=500, content=content)
