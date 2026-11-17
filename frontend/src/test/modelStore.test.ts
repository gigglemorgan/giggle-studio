import { describe, it, expect, beforeEach } from "vitest";
import { useModelStore } from "../store/modelStore";

describe("Model Store", () => {
  beforeEach(() => {
    useModelStore.setState({
      activeStatus: null,
      tokensPerSec: 0,
      loading: false,
    });
  });

  it("should update tokensPerSec", () => {
    useModelStore.getState().setTokensPerSec(42.5);
    expect(useModelStore.getState().tokensPerSec).toBe(42.5);
  });

  it("should update activeStatus", () => {
    useModelStore.getState().setActiveStatus({
      alive: true,
      pid: 1234,
      current_model: "/models/qwen2.5.gguf",
      config: { gpu_layers: 32 },
    });
    const state = useModelStore.getState();
    expect(state.activeStatus?.alive).toBe(true);
    expect(state.activeStatus?.pid).toBe(1234);
    expect(state.activeStatus?.config?.gpu_layers).toBe(32);
  });
});
