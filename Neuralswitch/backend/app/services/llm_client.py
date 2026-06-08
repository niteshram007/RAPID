"""OpenAI-compatible local LLM client.

Works with any server exposing the OpenAI REST API:
Ollama, LM Studio, vLLM, llama.cpp server, Text Generation WebUI, etc.

All LLM traffic goes through this module — the frontend never talks to the LLM.
"""
from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

import httpx


class LLMError(Exception):
    """Raised for any failure while talking to the LLM server."""

    def __init__(self, message: str, *, kind: str = "llm_error"):
        super().__init__(message)
        self.kind = kind


def _friendly_connection_error() -> LLMError:
    return LLMError(
        "I could not connect to the local LLM server. Please check whether the "
        "model server is running and the base URL is correct.",
        kind="connection",
    )


class LLMClient:
    def __init__(self, base_url: str, api_key: str = "local-key", timeout: float = 120.0):
        self.base_url = self._normalize_base_url(base_url)
        self.api_key = api_key or "local-key"
        self.timeout = timeout

    @staticmethod
    def _normalize_base_url(base_url: str) -> str:
        """Accept either a base URL or a full OpenAI-compatible endpoint."""
        url = str(base_url or "").strip().rstrip("/")
        for suffix in ("/chat/completions", "/completions", "/embeddings", "/models"):
            if url.endswith(suffix):
                url = url[: -len(suffix)].rstrip("/")
                break
        return url

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def _endpoint(self, path: str) -> str:
        """Build endpoint path and tolerate base URLs with/without /v1."""
        path = path.lstrip("/")
        if self.base_url.endswith("/v1"):
            return f"{self.base_url}/{path}"
        return f"{self.base_url}/v1/{path}"

    async def list_models(self) -> list[str]:
        urls = [self._endpoint("models")]
        if not self.base_url.endswith("/v1"):
            urls.append(f"{self.base_url}/models")
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                for url in urls:
                    resp = await client.get(url, headers=self._headers)
                    if resp.status_code >= 400:
                        continue
                    data = resp.json()
                    models = [m.get("id") for m in data.get("data", []) if m.get("id")]
                    if models:
                        return models
                raise LLMError("Model list endpoint is not available on this LLM server.", kind="http")
        except httpx.ConnectError as exc:  # pragma: no cover
            raise _friendly_connection_error() from exc
        except httpx.HTTPStatusError as exc:
            raise LLMError(
                f"LLM server returned {exc.response.status_code} when listing models.",
                kind="http",
            ) from exc

    async def health(self) -> dict[str, Any]:
        """Return {ok, message, models}. Never raises."""
        try:
            models = await self.list_models()
            return {"ok": True, "message": "Connected to LLM server.", "models": models}
        except LLMError as exc:
            return {"ok": False, "message": str(exc), "models": []}
        except Exception as exc:  # pragma: no cover
            return {"ok": False, "message": f"Unexpected error: {exc}", "models": []}

    async def chat_completion(
        self,
        messages: list[dict[str, str]],
        model: str,
        temperature: float = 0.3,
        max_tokens: int = 2048,
        top_p: float = 1.0,
    ) -> dict[str, Any]:
        """Non-streaming completion. Returns {content, usage, model}."""
        url = self._endpoint("chat/completions")
        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "top_p": top_p,
            "stream": False,
        }
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(url, headers=self._headers, json=payload)
                resp.raise_for_status()
                data = resp.json()
        except httpx.ConnectError as exc:
            raise _friendly_connection_error() from exc
        except httpx.HTTPStatusError as exc:
            detail = _extract_error(exc.response)
            if exc.response.status_code == 404:
                raise LLMError(
                    f"Model '{model}' not found on the LLM server. {detail}",
                    kind="model_not_found",
                ) from exc
            raise LLMError(f"LLM server error ({exc.response.status_code}): {detail}", kind="http") from exc
        except httpx.TimeoutException as exc:
            raise LLMError("The LLM server timed out while generating a response.", kind="timeout") from exc

        try:
            content = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise LLMError("The LLM returned an invalid response format.", kind="invalid_response") from exc

        return {
            "content": content or "",
            "usage": data.get("usage", {}),
            "model": data.get("model", model),
        }

    async def chat_completion_stream(
        self,
        messages: list[dict[str, str]],
        model: str,
        temperature: float = 0.3,
        max_tokens: int = 2048,
        top_p: float = 1.0,
    ) -> AsyncIterator[str]:
        """Yield content tokens as they arrive (OpenAI SSE format)."""
        url = self._endpoint("chat/completions")
        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "top_p": top_p,
            "stream": True,
        }
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                async with client.stream("POST", url, headers=self._headers, json=payload) as resp:
                    if resp.status_code >= 400:
                        body = await resp.aread()
                        raise LLMError(
                            f"LLM server error ({resp.status_code}): {body.decode('utf-8', 'ignore')[:300]}",
                            kind="http",
                        )
                    async for line in resp.aiter_lines():
                        if not line or not line.startswith("data:"):
                            continue
                        data_str = line[len("data:"):].strip()
                        if data_str == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data_str)
                            delta = chunk["choices"][0].get("delta", {})
                            piece = delta.get("content")
                            if piece:
                                yield piece
                        except (json.JSONDecodeError, KeyError, IndexError):
                            continue
        except httpx.ConnectError as exc:
            raise _friendly_connection_error() from exc
        except httpx.TimeoutException as exc:
            raise LLMError("The LLM server timed out while streaming a response.", kind="timeout") from exc

    async def embeddings(self, texts: list[str], model: str) -> list[list[float]]:
        """Call the server's /embeddings endpoint (used when EMBEDDING_PROVIDER=openai)."""
        url = self._endpoint("embeddings")
        payload = {"model": model, "input": texts}
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(url, headers=self._headers, json=payload)
                resp.raise_for_status()
                data = resp.json()
                return [item["embedding"] for item in data["data"]]
        except httpx.ConnectError as exc:
            raise _friendly_connection_error() from exc
        except (httpx.HTTPStatusError, KeyError) as exc:
            raise LLMError("Embedding generation failed on the LLM server.", kind="embedding") from exc


def _extract_error(response: httpx.Response) -> str:
    try:
        data = response.json()
        if isinstance(data, dict):
            err = data.get("error")
            if isinstance(err, dict):
                return err.get("message", "")
            if isinstance(err, str):
                return err
        return ""
    except Exception:
        return response.text[:300]
