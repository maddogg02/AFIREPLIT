"""Shared helpers for the RAG chat system."""
from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from dotenv import load_dotenv
import tiktoken

from .config import CONTEXT_TRUNCATION_NOTICE, RAGConfig


def load_environment(config: RAGConfig) -> None:
    """Load environment variables from a .env file if configured."""
    env_candidates: List[Path] = []
    if config.env_path:
        env_candidates.append(config.env_path)
    # Fall back to repo root two levels up from scripts directory
    current_file = Path(__file__).resolve()
    env_candidates.append(current_file.parents[3] / ".env")

    for env_path in env_candidates:
        try:
            if not env_path or not env_path.exists():
                continue
            load_dotenv(dotenv_path=env_path, override=False)
            if not config.silent:
                print(f"[ENV] Loaded environment variables from {env_path}")
            # Only load the first existing .env file.
            break
        except Exception as exc:  # pragma: no cover - defensive
            if not config.silent:
                print(f"[WARN] Failed to load .env file at {env_path}: {exc}")


def format_source_label(reference: int, metadata: Dict[str, Any]) -> str:
    afi_number = metadata.get("afi_number", "N/A")
    chapter = metadata.get("chapter") or "N/A"
    paragraph = metadata.get("paragraph") or "N/A"
    section_title = metadata.get("section_title") or metadata.get("title")
    location = f"Ch.{chapter} Para.{paragraph}" if paragraph != "N/A" else f"Ch.{chapter}"
    if section_title:
        return f"[{reference}] {afi_number} {location} — {section_title}"
    return f"[{reference}] {afi_number} {location}"


def summarize_sources_for_prompt(sources: Iterable[Dict[str, Any]]) -> str:
    sources_list = list(sources)
    if not sources_list:
        return "(No AFI/DAFI passages retrieved for this query.)"

    lines: List[str] = []
    for source in sources_list:
        label = format_source_label(source["reference"], source["metadata"])
        similarity = source.get("similarity_score")
        if similarity is not None:
            lines.append(f"{label} | similarity {similarity:.3f}")
        else:
            lines.append(label)
    return "\n".join(lines)


def split_inline_bullets(text: str) -> List[str]:
    if not text:
        return []
    stripped = text.strip()
    if not stripped:
        return [""]
    if stripped.startswith("-"):
        return [stripped]
    if " - " in stripped:
        segments = stripped.split(" - ")
        bullet_lines: List[str] = []
        for segment in segments:
            segment = segment.strip()
            if segment:
                bullet_lines.append(f"- {segment}")
        if bullet_lines:
            return bullet_lines
    return [stripped]


def collapse_blank_lines(lines: Iterable[str]) -> List[str]:
    collapsed: List[str] = []
    for line in lines:
        if not line.strip():
            if collapsed and collapsed[-1] == "":
                continue
            collapsed.append("")
        else:
            collapsed.append(line.rstrip())
    while collapsed and collapsed[-1] == "":
        collapsed.pop()
    return collapsed


def normalize_answer_markdown(answer: str) -> str:
    if not answer:
        return answer

    normalized_lines: List[str] = []
    expected_sections = {
        "compliance summary": "## Compliance Summary",
        "immediate actions": "## Immediate Actions",
        "model knowledge": "## Model Knowledge",
        "citations": "## Citations",
    }

    for raw_line in answer.replace("\r\n", "\n").split("\n"):
        stripped_line = raw_line.strip()
        if not stripped_line:
            normalized_lines.append("")
            continue
        lower_line = stripped_line.lower()
        matched_heading: Optional[str] = None
        for key, canonical in expected_sections.items():
            if lower_line.startswith(f"## {key}"):
                matched_heading = canonical
                suffix = stripped_line[len(matched_heading):].strip()
                normalized_lines.append(canonical)
                normalized_lines.append("")
                for fragment in split_inline_bullets(suffix):
                    if fragment:
                        normalized_lines.append(fragment)
                break
        if matched_heading:
            continue
        for fragment in split_inline_bullets(stripped_line):
            normalized_lines.append(fragment)

    collapsed = collapse_blank_lines(normalized_lines)
    return "\n".join(collapsed)


def annotate_answer_with_sources(answer: str, sources: List[Dict[str, Any]]) -> str:
    if not answer or not sources:
        return answer

    citation_lines = []
    for source in sources:
        label = format_source_label(source["reference"], source["metadata"])
        full_text = source.get("text", "")
        if full_text:
            citation_lines.append(f"- {label}\n  {full_text}")
        else:
            citation_lines.append(f"- {label}")

    citations_block = "## Citations\n" + "\n\n".join(citation_lines)

    if "model knowledge" in answer.lower() and "model knowledge" not in "\n".join(citation_lines).lower():
        citations_block += "\n- Model knowledge: See 'Model Knowledge' section"

    if "## Citations" in answer:
        return re.sub(r"## Citations\b[\s\S]*$", citations_block, answer).strip() + "\n"

    return answer.rstrip() + "\n\n" + citations_block + "\n"


@lru_cache(maxsize=128)
def _encoding_for_model(model: str):
    try:
        return tiktoken.encoding_for_model(model)
    except KeyError:
        return tiktoken.get_encoding("cl100k_base")


def truncate_context_if_needed(context: str, token_limit: int, model: str, silent: bool = False) -> Tuple[str, bool, int]:
    encoding = _encoding_for_model(model)
    tokens = encoding.encode(context)
    token_count = len(tokens)

    if token_limit <= 0:
        return context, False, token_count

    if token_count <= token_limit:
        return context, False, token_count

    notice_tokens = encoding.encode(CONTEXT_TRUNCATION_NOTICE)
    notice_len = len(notice_tokens)

    if notice_len >= token_limit:
        truncated_tokens = tokens[:token_limit]
        truncated_text = encoding.decode(truncated_tokens)
        final_token_count = len(truncated_tokens)
    else:
        effective_limit = max(0, token_limit - notice_len)
        truncated_tokens = tokens[:effective_limit]
        truncated_text = encoding.decode(truncated_tokens) + CONTEXT_TRUNCATION_NOTICE
        final_token_count = len(truncated_tokens) + notice_len

    if not silent:
        print(f"⚠️  Context truncated to {token_limit} tokens to stay within limits")

    return truncated_text, True, final_token_count
