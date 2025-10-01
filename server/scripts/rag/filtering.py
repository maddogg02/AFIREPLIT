"""LLM-assisted relevance filtering helpers."""
from __future__ import annotations

import json
from typing import Any, Dict, List

from .config import RAGConfig


class RelevanceFilter:
    """Runs an LLM-based relevance pass over retrieved passages."""

    def __init__(self, openai_client, config: RAGConfig) -> None:
        self._client = openai_client
        self._config = config

    @property
    def silent(self) -> bool:
        return self._config.silent

    def _build_prompt(self, user_query: str, search_results: List[Dict[str, Any]]) -> Dict[str, str]:
        system_prompt = (
            "You are a filter for Air Force instruction content. Your job is to identify passages that contain information relevant to the user's question.\n\n"
            "REJECT only these types of content:\n"
            "- Pure table of contents entries with no explanation\n"
            "- Section headers with no additional content\n"
            "- Navigation elements that only reference other sections\n\n"
            "KEEP these types of content:\n"
            "- Any text that explains procedures, duties, or responsibilities\n"
            "- Requirements, standards, or compliance information\n"
            "- Explanations of processes, policies, or safety measures\n"
            "- Questions or statements that relate to the user's query\n"
            "- Any substantive paragraphs that provide context or details\n"
            "- Even brief statements if they contain actionable information\n\n"
            "Be somewhat permissive - when in doubt, include the passage rather than exclude it.\n"
            "Respond ONLY with a JSON array of passage numbers."
        )

        user_prompt = f"Question: {user_query}\n\nThe user needs specific duties, responsibilities, procedures, or requirements - NOT section titles or table of contents entries.\n\nPassages:\n"
        for index, result in enumerate(search_results, 1):
            text = result["text"]
            if len(text) > 500:
                text = text[:500] + "..."
            user_prompt += f"[{index}] {text}\n\n"

        if not self.silent:
            print(f"[DEBUG] Relevance filter evaluating {len(search_results)} passages:")
            for index, result in enumerate(search_results, 1):
                preview = result["text"][:100]
                if len(result["text"]) > 100:
                    preview += "..."
                print(f"  [{index}] {preview}")

        user_prompt += (
            "Return ONLY a JSON array of passage numbers that contain substantive, actionable content "
            "that helps answer the question (e.g., [1,3,5]). Exclude table of contents, headers, "
            "and navigation elements. If none contain useful content, return []."
        )

        return {"system": system_prompt, "user": user_prompt}

    def _similarity_fallback(self, search_results: List[Dict[str, Any]], reason: str) -> List[Dict[str, Any]]:
        if not self.silent:
            print(f"⚠️  {reason}. Falling back to similarity-only ranking.")

        if not search_results:
            return []

        threshold = max(0.0, self._config.filter_min_similarity)
        sorted_results = sorted(
            search_results,
            key=lambda item: item.get("similarity_score", 0.0),
            reverse=True,
        )

        candidates = [item for item in sorted_results if item.get("similarity_score", 0.0) >= threshold]

        if not candidates:
            return sorted_results[: min(3, len(sorted_results))]

        limit = min(3, len(candidates))
        return candidates[:limit or 1]

    def filter(self, user_query: str, search_results: List[Dict[str, Any]], model: str) -> List[Dict[str, Any]]:
        if not search_results:
            return []

        filter_model = "gpt-4o-mini" if model.startswith("gpt-5") else model
        prompts = self._build_prompt(user_query, search_results)

        chat_params: Dict[str, Any] = {
            "model": filter_model,
            "messages": [
                {"role": "system", "content": prompts["system"]},
                {"role": "user", "content": prompts["user"]},
            ],
        }

        if filter_model.startswith("gpt-5"):
            chat_params["max_completion_tokens"] = 200
        else:
            chat_params["max_tokens"] = 200
            chat_params["temperature"] = 0.1

        if not self.silent:
            if filter_model != model:
                print(f"🤖 Making relevance call to {filter_model} (fallback from {model})")
            else:
                print(f"🤖 Making relevance call to {filter_model}")

        try:
            response = self._client.chat.completions.create(**chat_params)
        except Exception as exc:
            if not self.silent:
                print(f"⚠️  Relevance filter failed: {exc}, keeping all results")
            return self._similarity_fallback(search_results, "Relevance filter request failed")

        response_content = response.choices[0].message.content.strip() if response.choices else ""
        if not self.silent:
            print(f"🔍 GPT relevance response: '{response_content}'")
            if hasattr(response, "usage"):
                print(f"🔍 Token usage: {response.usage}")

        if not response_content:
            return self._similarity_fallback(search_results, "Empty relevance response")

        keep_indices: List[int] = []
        try:
            parsed = json.loads(response_content)
            if not isinstance(parsed, list):
                raise ValueError("Response is not a list")

            keep_indices = []
            seen = set()
            for idx in parsed:
                if not isinstance(idx, int):
                    raise ValueError("Response items must be integers")
                if not 1 <= idx <= len(search_results):
                    raise ValueError("Index out of range")
                if idx not in seen:
                    keep_indices.append(idx)
                    seen.add(idx)
        except (ValueError, json.JSONDecodeError) as exc:
            return self._similarity_fallback(search_results, f"Invalid relevance filter response ({exc})")

        filtered_results: List[Dict[str, Any]] = []
        for index in keep_indices:
            if 1 <= index <= len(search_results):
                filtered_results.append(search_results[index - 1])

        if not filtered_results:
            return self._similarity_fallback(search_results, "Relevance filter returned no valid indices")

        threshold = max(0.0, self._config.filter_min_similarity)
        filtered_results = [
            result for result in filtered_results if result.get("similarity_score", 0.0) >= threshold
        ]

        if not filtered_results:
            return self._similarity_fallback(
                search_results,
                "No passages met the minimum similarity threshold after filtering",
            )

        if not self.silent:
            print(f"🎯 Relevance filter: {len(search_results)} → {len(filtered_results)} documents")

        return filtered_results
