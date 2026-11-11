from app.inference.offload import OffloadEstimator


def test_offload_estimator_all_gpu():
    # 7B model file size ~ 4200 MB, 32 layers
    est = OffloadEstimator.estimate(
        file_size_mb=4200.0,
        layer_count=32,
        n_gpu_layers=34,  # All layers
        n_ctx=4096,
        kv_cache_k="f16",
        kv_cache_v="f16",
    )
    assert est["vram"]["weights_mb"] > 4000
    assert est["ram"]["weights_mb"] == 0
    assert est["vram"]["kv_cache_mb"] > 0
    assert est["vram"]["compute_mb"] > 0
    assert len(est["layers_map"]) == 34
    assert est["layers_map"][0]["device"] == "GPU"
    assert est["layers_map"][-1]["device"] == "GPU"


def test_offload_estimator_partial_cpu():
    est = OffloadEstimator.estimate(
        file_size_mb=8000.0,
        layer_count=32,
        n_gpu_layers=16,  # Half
        n_ctx=4096,
    )
    assert est["vram"]["weights_mb"] > 0
    assert est["ram"]["weights_mb"] > 0
    assert est["layers_map"][0]["device"] == "GPU"
    assert est["layers_map"][-1]["device"] == "CPU"


def test_offload_estimator_presets():
    presets = OffloadEstimator.get_presets(file_size_mb=4000.0, layer_count=32)
    assert "all_gpu" in presets
    assert "balanced" in presets
    assert "max_speed" in presets
    assert "min_vram" in presets
    assert presets["all_gpu"] == 34
