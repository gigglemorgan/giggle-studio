import gc
import os
import re
import shutil
import subprocess
import sys
from typing import Any

from fastapi import APIRouter

from app.core.config import settings
from app.core.logger import redact_dict
from app.utils.hardware import HardwareDetector

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

    # 3. CUDA Toolkit (NVCC compiler >= 12.8 for Giggle Engine / sm_120)
    cuda_home = os.environ.get("CUDA_HOME")
    nvcc_path = shutil.which("nvcc")
    if not nvcc_path and cuda_home:
        candidate = os.path.join(cuda_home, "bin", "nvcc")
        if os.path.exists(candidate):
            nvcc_path = candidate
    if not nvcc_path:
        for fallback_dir in ["/usr/local/cuda-13.0/bin/nvcc", "/usr/local/cuda/bin/nvcc"]:
            if os.path.exists(fallback_dir):
                nvcc_path = fallback_dir
                break

    nvcc_version_tuple = (0, 0)
    nvcc_version_str = "Bulunamadı"
    if nvcc_path:
        try:
            ver_out = subprocess.check_output([nvcc_path, "--version"], text=True)
            m = re.search(r"release\s+([0-9]+)\.([0-9]+)", ver_out)
            if m:
                nvcc_version_tuple = (int(m.group(1)), int(m.group(2)))
                nvcc_version_str = (
                    f"CUDA {nvcc_version_tuple[0]}.{nvcc_version_tuple[1]} ({nvcc_path})"
                )
        except Exception:
            pass

    nvcc_ok = nvcc_version_tuple >= (12, 8)
    checks.append(
        {
            "name": "CUDA Toolkit (NVCC)",
            "target": "nvcc >= 12.8 (Blackwell sm_120)",
            "measured": nvcc_version_str,
            "status": "pass" if nvcc_ok else "fail",
            "fix": None
            if nvcc_ok
            else "Giggle Engine için CUDA Toolkit >= 12.8 gereklidir (RTX 5070 Blackwell sm_120 mimarisi). "
            "CUDA_HOME ortam değişkenini ayarlayın (örn. CUDA_HOME=/usr/local/cuda-13.0) veya CUDA Toolkit 12.8+ kurun.",
        }
    )

    # 4. Memory & VRAM Margin
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
    return redact_dict(report)


@router.post("/free-memory")
async def free_memory() -> dict[str, Any]:
    """Deterministically cleans memory, garbage collects, and returns latest stats."""
    gc.collect()
    try:
        import torch

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.ipc_collect()  # type: ignore[no-untyped-call]
    except ImportError:
        pass

    metrics = HardwareDetector.get_all_metrics()
    return {
        "status": "success",
        "message_tr": "Bellek başarıyla temizlendi.",
        "telemetry": metrics,
    }
