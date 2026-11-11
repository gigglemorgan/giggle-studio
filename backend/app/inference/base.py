from abc import ABC, abstractmethod
from typing import Any


class InferenceBackend(ABC):
    """Abstract base class for all inference backends in Giggle Studio."""

    def __init__(self) -> None:
        self.is_active: bool = False
        self.current_model_path: str | None = None
        self.current_config: dict[str, Any] = {}

    @abstractmethod
    def load(self, model_path: str, config: dict[str, Any]) -> dict[str, Any]:
        """Loads model into memory/VRAM according to configuration."""
        pass

    @abstractmethod
    def unload(self) -> None:
        """Frees all allocations and closes handles."""
        pass

    @abstractmethod
    def generate_stream(
        self,
        prompt: str,
        sampling_params: dict[str, Any],
    ) -> Any:
        """Yields generated token dictionaries: {'token': str, 'done': bool, 'stats': dict}."""
        pass

    @abstractmethod
    def get_info(self) -> dict[str, Any]:
        """Returns loaded model parameters and status."""
        pass
