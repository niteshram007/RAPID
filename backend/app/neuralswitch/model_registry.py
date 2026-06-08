from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .config import NeuralSwitchRuntimeConfig


@dataclass(frozen=True)
class RegisteredModel:
    id: str
    name: str
    provider: str = "local"
    available: bool = True


class ModelRegistry:
    def __init__(self, runtime_config: NeuralSwitchRuntimeConfig) -> None:
        self.runtime_config = runtime_config
        overrides: dict[str, Any] = runtime_config.model_registry_override or {}
        model_id = str(overrides.get("default_model") or "rapid-neuralswitch-local")
        self._default_model = model_id
        self._models = [
            RegisteredModel(
                id=model_id,
                name=str(overrides.get("name") or "RAPID NeuralSwitch"),
                provider=str(overrides.get("provider") or "local"),
                available=True,
            )
        ]

    @property
    def default_model(self) -> str:
        return self._default_model

    def list_models(self) -> list[RegisteredModel]:
        return list(self._models)
