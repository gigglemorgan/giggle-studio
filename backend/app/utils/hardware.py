import os
import shutil
import warnings
from typing import Any

import psutil

with warnings.catch_warnings():
    warnings.simplefilter("ignore", category=FutureWarning)
    try:
        import pynvml

        HAS_PYNVML = True
    except ImportError:
        HAS_PYNVML = False


class HardwareDetector:
    _nvidia_device_index: int | None = None
    _nvidia_device_name: str | None = None
    _nvml_initialized: bool = False

    @classmethod
    def init_nvml(cls) -> bool:
        if not HAS_PYNVML:
            return False
        if cls._nvml_initialized:
            return True
        try:
            pynvml.nvmlInit()
            cls._nvml_initialized = True
            return True
        except Exception:
            cls._nvml_initialized = False
            return False

    @classmethod
    def get_nvidia_device_info(cls) -> dict[str, Any]:
        """Resolves the NVIDIA GPU index, strictly ignoring any AMD GPU."""
        if cls._nvidia_device_index is not None and cls._nvidia_device_name is not None:
            return {
                "available": True,
                "index": cls._nvidia_device_index,
                "name": cls._nvidia_device_name,
            }

        if not cls.init_nvml():
            return {"available": False, "error": "NVML initialization failed or not installed"}

        try:
            device_count = pynvml.nvmlDeviceGetCount()
            for i in range(device_count):
                handle = pynvml.nvmlDeviceGetHandleByIndex(i)
                name = pynvml.nvmlDeviceGetName(handle)
                # NVML only reports NVIDIA devices, but verify vendor/name
                if "GeForce" in name or "RTX" in name or "NVIDIA" in name:
                    cls._nvidia_device_index = i
                    cls._nvidia_device_name = name
                    return {
                        "available": True,
                        "index": i,
                        "name": name,
                    }
            return {"available": False, "error": "No compatible NVIDIA GPU found via NVML"}
        except Exception as e:
            return {"available": False, "error": str(e)}

    @classmethod
    def get_cuda_visible_devices_env(cls) -> dict[str, str]:
        """Returns environment variables dictionary with CUDA_VISIBLE_DEVICES pinned to NVIDIA."""
        info = cls.get_nvidia_device_info()
        env = os.environ.copy()
        if info.get("available") and info.get("index") is not None:
            env["CUDA_VISIBLE_DEVICES"] = str(info["index"])
        return env

    @classmethod
    def get_gpu_metrics(cls) -> dict[str, Any]:
        """Retrieves real-time GPU telemetry (VRAM, Util, Temp, Power)."""
        if not cls.init_nvml():
            return {
                "available": False,
                "name": "N/A",
                "vram_total_mb": 0,
                "vram_used_mb": 0,
                "vram_free_mb": 0,
                "utilization_percent": 0,
                "temperature_c": 0,
                "power_watts": 0,
            }

        try:
            info = cls.get_nvidia_device_info()
            if not info.get("available"):
                return {"available": False}
            idx = info["index"]
            handle = pynvml.nvmlDeviceGetHandleByIndex(idx)
            name = pynvml.nvmlDeviceGetName(handle)
            mem = pynvml.nvmlDeviceGetMemoryInfo(handle)
            util = pynvml.nvmlDeviceGetUtilizationRates(handle)
            temp = pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU)
            try:
                power = pynvml.nvmlDeviceGetPowerUsage(handle) / 1000.0  # mW to W
            except Exception:
                power = 0.0

            return {
                "available": True,
                "index": idx,
                "name": name,
                "vram_total_mb": round(mem.total / (1024 * 1024), 1),
                "vram_used_mb": round(mem.used / (1024 * 1024), 1),
                "vram_free_mb": round(mem.free / (1024 * 1024), 1),
                "utilization_percent": util.gpu,
                "temperature_c": temp,
                "power_watts": round(power, 1),
            }
        except Exception as e:
            return {"available": False, "error": str(e)}

    @classmethod
    def get_system_metrics(cls) -> dict[str, Any]:
        """Retrieves host RAM, CPU, Swap and Disk telemetry."""
        mem = psutil.virtual_memory()
        swap = psutil.swap_memory()
        cpu_percent = psutil.cpu_percent(interval=None)
        cpu_count_logical = psutil.cpu_count(logical=True)
        cpu_count_physical = psutil.cpu_count(logical=False) or 6

        # Disk usage for data directory
        total, used, free = shutil.disk_usage(".")

        return {
            "ram_total_mb": round(mem.total / (1024 * 1024), 1),
            "ram_used_mb": round(mem.used / (1024 * 1024), 1),
            "ram_available_mb": round(mem.available / (1024 * 1024), 1),
            "ram_percent": mem.percent,
            "swap_total_mb": round(swap.total / (1024 * 1024), 1),
            "swap_used_mb": round(swap.used / (1024 * 1024), 1),
            "swap_percent": swap.percent,
            "cpu_percent": cpu_percent,
            "cpu_physical_cores": cpu_count_physical,
            "cpu_logical_cores": cpu_count_logical,
            "disk_total_gb": round(total / (1024**3), 1),
            "disk_free_gb": round(free / (1024**3), 1),
        }

    @classmethod
    def get_all_metrics(cls) -> dict[str, Any]:
        """Combines host and GPU telemetry."""
        return {
            "gpu": cls.get_gpu_metrics(),
            "system": cls.get_system_metrics(),
        }
