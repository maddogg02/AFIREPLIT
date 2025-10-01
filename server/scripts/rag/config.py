"""Configuration primitives and constants for the RAG chat system."""
from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml


_DEFAULT_CONFIG_PATH = Path(__file__).with_name("config.yaml")


def _load_raw_config(path: Path) -> Dict[str, Any]:
	try:
		with path.open("r", encoding="utf-8") as handle:
			data = yaml.safe_load(handle) or {}
	except FileNotFoundError:
		data = {}
	except yaml.YAMLError as exc:  # pragma: no cover - defensive
		raise RuntimeError(f"Failed to parse configuration file at {path}: {exc}") from exc
	return data


_CONFIG_DATA = _load_raw_config(_DEFAULT_CONFIG_PATH)

_DEFAULTS_SECTION = _CONFIG_DATA.get("defaults", {})
_RETRIEVAL_SECTION = _CONFIG_DATA.get("retrieval", {})
_PROMPTS_SECTION = _CONFIG_DATA.get("prompts", {})

DEFAULT_MIN_SIMILARITY: float = float(_DEFAULTS_SECTION.get("min_similarity", 0.15))
DEFAULT_CONTEXT_TOKEN_MULTIPLIER: int = int(_DEFAULTS_SECTION.get("context_token_multiplier", 4))
DEFAULT_MAX_COMPLETION_TOKENS: int = int(_DEFAULTS_SECTION.get("default_max_tokens", 1500))
CONTEXT_TRUNCATION_NOTICE: str = _DEFAULTS_SECTION.get("context_truncation_notice", "\n[...truncated for length...]")
EMBEDDING_MODEL: str = _DEFAULTS_SECTION.get("embedding_model", "text-embedding-3-small")
DEFAULT_EMBEDDING_CACHE_SIZE: int = int(_DEFAULTS_SECTION.get("embedding_cache_size", 128))
DEFAULT_FILTER_MIN_SIMILARITY: float = float(_DEFAULTS_SECTION.get("filter_min_similarity", 0.05))

_DEFAULT_IMPORTANT_KEYWORDS = tuple(_RETRIEVAL_SECTION.get("important_keywords", []))
_DEFAULT_TOC_PATTERNS = tuple(_RETRIEVAL_SECTION.get("toc_patterns", []))
_DEFAULT_QUERY_TWEAKS = tuple(_RETRIEVAL_SECTION.get("query_tweaks", []))
_DEFAULT_PROMPTS = _PROMPTS_SECTION if _PROMPTS_SECTION else {}


def _copy_keywords() -> List[str]:
	return list(_DEFAULT_IMPORTANT_KEYWORDS)


def _copy_toc_patterns() -> List[str]:
	return list(_DEFAULT_TOC_PATTERNS)


def _copy_query_tweaks() -> List[Dict[str, Any]]:
	return [deepcopy(rule) for rule in _DEFAULT_QUERY_TWEAKS]


def _copy_prompts() -> Dict[str, Dict[str, str]]:
	return deepcopy(_DEFAULT_PROMPTS)


@dataclass(slots=True)
class RAGConfig:
	"""Static configuration used across retrieval, filtering, and generation."""

	chroma_dir: Path
	silent: bool = False
	hybrid_mode: bool = True
	min_similarity_score: float = DEFAULT_MIN_SIMILARITY
	use_filter: bool = True
	default_max_tokens: int = DEFAULT_MAX_COMPLETION_TOKENS
	context_token_multiplier: int = DEFAULT_CONTEXT_TOKEN_MULTIPLIER
	env_path: Optional[Path] = None
	prompts: Dict[str, Dict[str, str]] = field(default_factory=_copy_prompts)
	query_tweaks: List[Dict[str, Any]] = field(default_factory=_copy_query_tweaks)
	important_keywords: List[str] = field(default_factory=_copy_keywords)
	toc_patterns: List[str] = field(default_factory=_copy_toc_patterns)
	embedding_cache_size: int = DEFAULT_EMBEDDING_CACHE_SIZE
	filter_min_similarity: float = DEFAULT_FILTER_MIN_SIMILARITY

	def get_prompt_template(self, mode: str) -> Dict[str, str]:
		return self.prompts.get(mode, {})

