from app.utils.hardware import HardwareDetector


def test_system_metrics_structure():
    metrics = HardwareDetector.get_system_metrics()
    assert "ram_total_mb" in metrics
    assert "ram_used_mb" in metrics
    assert "ram_available_mb" in metrics
    assert "cpu_percent" in metrics
    assert "cpu_physical_cores" in metrics
    assert metrics["cpu_physical_cores"] >= 1
    assert metrics["disk_free_gb"] > 0


def test_cuda_visible_devices_env():
    env = HardwareDetector.get_cuda_visible_devices_env()
    assert isinstance(env, dict)
    # If NVIDIA GPU is detected, CUDA_VISIBLE_DEVICES must be set
    info = HardwareDetector.get_nvidia_device_info()
    if info.get("available") and info.get("index") is not None:
        assert env.get("CUDA_VISIBLE_DEVICES") == str(info["index"])
