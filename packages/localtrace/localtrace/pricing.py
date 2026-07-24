"""Model pricing used to estimate cost at query time.

Prices are USD per **1K tokens** as ``(input, output)`` pairs. The defaults
below are a convenience only -- model prices change constantly, so they MUST
be treated as estimates, never as authoritative. Override them via any of:

* ``TraceQuery(log_dir, pricing={"gpt-4o-mini": (0.00015, 0.0006)})``
* a ``pricing.json`` file inside the log directory, e.g.
  ``{"gpt-4o-mini": [0.00015, 0.0006]}`` or
  ``{"gpt-4o-mini": {"input_per_1k": 0.00015, "output_per_1k": 0.0006}}``
* ``localtrace.pricing.update_pricing({...})`` (process-wide)

Model matching is exact first, then longest-substring (so
``openai/gpt-4o-mini-2024-07-18`` still resolves to ``gpt-4o-mini``).
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Mapping, Optional, Tuple

logger = logging.getLogger("localtrace")

#: USD per 1K tokens: model -> (input, output). Editable defaults, not truth.
DEFAULT_PRICING: dict[str, Tuple[float, float]] = {
    # OpenAI
    "gpt-4o": (0.0025, 0.01),
    "gpt-4o-mini": (0.00015, 0.0006),
    "gpt-4.1": (0.002, 0.008),
    "gpt-4.1-mini": (0.0004, 0.0016),
    "gpt-4.1-nano": (0.0001, 0.0004),
    "gpt-4-turbo": (0.01, 0.03),
    "gpt-3.5-turbo": (0.0005, 0.0015),
    "o3": (0.002, 0.008),
    "o4-mini": (0.0011, 0.0044),
    # Anthropic
    "claude-opus-4": (0.015, 0.075),
    "claude-sonnet-4": (0.003, 0.015),
    "claude-3-7-sonnet": (0.003, 0.015),
    "claude-3-5-sonnet": (0.003, 0.015),
    "claude-3-5-haiku": (0.0008, 0.004),
    "claude-haiku-4-5": (0.001, 0.005),
    # Google
    "gemini-2.5-pro": (0.00125, 0.01),
    "gemini-2.5-flash": (0.0003, 0.0025),
    "gemini-2.0-flash": (0.0001, 0.0004),
    "gemini-1.5-pro": (0.00125, 0.005),
    # Mistral
    "mistral-large": (0.002, 0.006),
    "mistral-small": (0.0001, 0.0003),
    # Meta (typical hosted rates)
    "llama-3.3-70b": (0.00059, 0.00079),
    "llama-3.1-8b": (0.00005, 0.00008),
}

_RUNTIME_OVERRIDES: dict[str, Tuple[float, float]] = {}


def _normalize_entry(value) -> Tuple[float, float]:
    """Accept (in, out) pairs or {'input_per_1k': .., 'output_per_1k': ..} dicts."""
    if isinstance(value, Mapping):
        inp = value.get("input_per_1k", value.get("input", 0.0))
        out = value.get("output_per_1k", value.get("output", 0.0))
        return (float(inp or 0.0), float(out or 0.0))
    inp, out = value
    return (float(inp), float(out))


def update_pricing(mapping: Mapping) -> None:
    """Merge process-wide pricing overrides on top of the defaults."""
    for model, value in mapping.items():
        _RUNTIME_OVERRIDES[str(model)] = _normalize_entry(value)


def load_pricing(overrides: Optional[Mapping] = None, log_dir=None) -> dict[str, Tuple[float, float]]:
    """Defaults <- <log_dir>/pricing.json <- update_pricing() <- explicit overrides."""
    merged = dict(DEFAULT_PRICING)
    if log_dir is not None:
        path = Path(log_dir) / "pricing.json"
        if path.exists():
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                merged.update({str(k): _normalize_entry(v) for k, v in data.items()})
            except (ValueError, OSError, TypeError):
                logger.warning("localtrace: could not parse %s; ignoring it", path)
    merged.update(_RUNTIME_OVERRIDES)
    if overrides:
        merged.update({str(k): _normalize_entry(v) for k, v in overrides.items()})
    return merged


def resolve_price(model: Optional[str], pricing: Mapping[str, Tuple[float, float]]) -> Optional[Tuple[float, float]]:
    """Exact match first, then the longest pricing key contained in the model name."""
    if not model:
        return None
    if model in pricing:
        return pricing[model]
    model_lower = model.lower()
    if model_lower in pricing:
        return pricing[model_lower]
    best: Optional[Tuple[int, Tuple[float, float]]] = None
    for key, value in pricing.items():
        key_lower = key.lower()
        if key_lower and key_lower in model_lower:
            if best is None or len(key_lower) > best[0]:
                best = (len(key_lower), value)
    return best[1] if best else None


def estimate_cost(
    model: Optional[str],
    prompt_tokens: Optional[int],
    completion_tokens: Optional[int],
    pricing: Mapping[str, Tuple[float, float]],
) -> Optional[float]:
    """USD estimate for one call, or None when the model has no known price."""
    price = resolve_price(model, pricing)
    if price is None:
        return None
    return (prompt_tokens or 0) / 1000.0 * price[0] + (completion_tokens or 0) / 1000.0 * price[1]
