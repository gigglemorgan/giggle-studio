import gc
import shutil
import sys
from typing import Any, cast

from app.core.config import settings
from app.core.logger import redact_dict
from app.utils.hardware import HardwareDetector
from fastapi import APIRouter

router = APIRouter(prefix="/system", tags=["System"])


@router.get("/status")
async def get_system_status() -> dict[str, Any]:
    """Returns real-time GPU and host telemetry."""
    metrics = HardwareDetector.get_all_metrics()
    return {
        "status": "ok",
        "app": {
            "name": settings.app.name,
            "version": settings.app.version,
            "author": settings.app.author,
            "language": settings.app.language,
        },
        "telemetry": metrics,
    }


@router.get("/doctor")
async def run_doctor_diagnostics() -> dict[str, Any]:
    """Executes environment & hardware diagnostics with privacy redaction."""
    checks: list[dict[str, Any]] = []

    # 1. Python runtime
    py_version = f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
    py_ok = sys.version_info >= (3, 11)
    checks.append(
        {
            "name": "Python Sürümü",
            "target": "Python >= 3.11",
            "measured": py_version,
            "status": "pass" if py_ok else "fail",
            "fix": "Sisteminizde Python 3.11 veya 3.12 kurulu olmalıdır." if not py_ok else None,
        }
    )

    # 2. NVIDIA GPU & NVML
    gpu_info = HardwareDetector.get_nvidia_device_info()
    if gpu_info.get("available"):
        checks.append(
            {
                "name": "NVIDIA GPU Tespiti",
                "target": "NVIDIA GPU (Blackwell / Ada / Ampere)",
                "measured": f"{gpu_info.get('name')} (Index: {gpu_info.get('index')})",
                "status": "pass",
                "fix": None,
            }
        )
    else:
        checks.append(
            {
                "name": "NVIDIA GPU Tespiti",
                "target": "NVIDIA GPU",
                "measured": gpu_info.get("error", "Bulunamadı"),
                "status": "warn",
                "fix": "NVIDIA sürücülerinin (>= 550) ve pynvml kütüphanesinin kurulu olduğunu kontrol edin.",
            }
        )

    # 3. Memory & VRAM Margin
    metrics = HardwareDetector.get_all_metrics()
    ram_mb = metrics["system"]["ram_total_mb"]
    ram_avail = metrics["system"]["ram_available_mb"]
    checks.append(
        {
            "name": "Sistem Belleği (RAM)",
            "target": ">= 16 GB",
            "measured": f"Toplam: {ram_mb} MB, Kullanılabilir: {ram_avail} MB",
            "status": "pass" if ram_mb >= 14000 else "warn",
            "fix": "16 GB altındaki RAM miktarlarında büyük modeller çalıştırılırken takas (swap) alanı kullanılabilir.",
        }
    )

    # 4. Bubblewrap Sandbox
    bwrap_path = shutil.which("bwrap")
    checks.append(
        {
            "name": "Bubblewrap İzolasyon Katmanı",
            "target": "/usr/bin/bwrap",
            "measured": bwrap_path or "Yok",
            "status": "pass" if bwrap_path else "warn",
            "fix": "sudo apt install bubblewrap komutu ile bwrap yükleyebilirsiniz."
            if not bwrap_path
            else None,
        }
    )

    # 5. Linux Unshare
    unshare_path = shutil.which("unshare")
    checks.append(
        {
            "name": "Unshare Çekirdek Alanları",
            "target": "/usr/bin/unshare",
            "measured": unshare_path or "Yok",
            "status": "pass" if unshare_path else "warn",
            "fix": "util-linux paketi kurulu olmalıdır." if not unshare_path else None,
        }
    )

    # 6. Disk Alanı
    disk_free = metrics["system"]["disk_free_gb"]
    checks.append(
        {
            "name": "Veri Diski Boş Alan",
            "target": ">= 20 GB",
            "measured": f"{disk_free} GB Boş",
            "status": "pass" if disk_free >= 20.0 else "warn",
            "fix": "Model indirmeleri ve fine-tuning işlemleri için diskte en az 20 GB boş yer açınız.",
        }
    )

    # 7. Reverse Engineering Araçları (Static Check)
    for tool_name, pkg in [
        ("radare2", "radare2"),
        ("ghidra", "ghidra"),
        ("capa", "capa"),
        ("yara", "yara"),
    ]:
        tool_bin = shutil.which(tool_name)
        checks.append(
            {
                "name": f"Tersine Mühendislik: {tool_name}",
                "target": f"{tool_name} ikili dosyası",
                "measured": tool_bin or "Kurulu değil (isteğe bağlı)",
                "status": "pass" if tool_bin else "info",
                "fix": f"Gelişmiş analiz için isteğe bağlı olarak {pkg} kurabilirsiniz."
                if not tool_bin
                else None,
            }
        )

    report = {
        "status": "healthy" if all(c["status"] in ("pass", "info") for c in checks) else "warning",
        "checks": checks,
    }
    # Ensure all output is redacted
    return cast(dict[str, Any], redact_dict(report))


@router.post("/free-memory")
async def free_memory() -> dict[str, Any]:
    """Deterministically cleans memory, garbage collects, and returns latest stats."""
    gc.collect()
    try:
        import torch

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.ipc_collect()
    except ImportError:
        pass

    metrics = HardwareDetector.get_all_metrics()
    return {
        "status": "success",
        "message_tr": "Bellek başarıyla temizlendi.",
        "telemetry": metrics,
    }
