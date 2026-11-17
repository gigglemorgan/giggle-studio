import { create } from "zustand";

export interface ActiveModelStatus {
  alive: boolean;
  pid: number | null;
  current_model: string | null;
  config: {
    gpu_layers?: number;
    ctx_size?: number;
    threads?: number;
    [key: string]: any;
  } | null;
}

interface ModelStoreState {
  activeStatus: ActiveModelStatus | null;
  tokensPerSec: number;
  loading: boolean;
  setActiveStatus: (status: ActiveModelStatus | null) => void;
  setTokensPerSec: (tps: number) => void;
  fetchActiveStatus: () => Promise<void>;
  unloadActiveModel: () => Promise<boolean>;
}

export const useModelStore = create<ModelStoreState>((set) => ({
  activeStatus: null,
  tokensPerSec: 0,
  loading: false,

  setActiveStatus: (status) => set({ activeStatus: status }),
  setTokensPerSec: (tps) => set({ tokensPerSec: tps }),

  fetchActiveStatus: async () => {
    try {
      const res = await fetch("/api/models/active");
      if (res.ok) {
        const data = await res.json();
        set({ activeStatus: data });
      }
    } catch {
      // keep existing status on transient failure
    }
  },

  unloadActiveModel: async () => {
    try {
      set({ loading: true });
      const res = await fetch("/api/models/unload", { method: "POST" });
      if (res.ok) {
        set({
          activeStatus: { alive: false, pid: null, current_model: null, config: null },
          tokensPerSec: 0,
        });
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      set({ loading: false });
    }
  },
}));
