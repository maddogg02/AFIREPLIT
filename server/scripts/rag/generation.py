"""Response generation helpers for the RAG chat system."""
from __future__ import annotations

from typing import Any, Dict, List, Tuple

from jinja2 import Environment, StrictUndefined

from .config import RAGConfig
from .utils import (
    annotate_answer_with_sources,
    normalize_answer_markdown,
    summarize_sources_for_prompt,
)


class ResponseGenerator:
    def __init__(self, openai_client, config: RAGConfig) -> None:
        self._client = openai_client
        self._config = config
        self._jinja_env = Environment(autoescape=False, trim_blocks=True, lstrip_blocks=True, undefined=StrictUndefined)

        self._sections_by_mode = {
            "knowledge_only": [
                "## Compliance Summary",
                "## Immediate Actions",
                "## Model Knowledge",
                "## Citations",
            ],
            "hybrid": [
                "## Compliance Summary",
                "## Immediate Actions",
                "## Model Knowledge",
                "## Citations",
            ],
            "strict": [
                "## Compliance Summary",
                "## Immediate Actions",
                "## Model Knowledge",
                "## Citations",
            ],
        }

        self._notes_by_mode = {
            "knowledge_only": "\nState 'Model knowledge only — no AFI context retrieved.' in the Citations section.",
            "hybrid": "\nTag any doctrine not in the context under Model Knowledge and add a 'Model knowledge' entry in Citations.",
            "strict": "\nModel Knowledge must read 'None'.",
        }

        self._default_templates = {
            "knowledge_only": {
                "system": (
                    "You are an Air Force maintenance assistant with no retrieved AFI/DAFI passages. "
                    "Answer from doctrine only and flag model knowledge explicitly."
                ),
                "user": (
                    "Question:\n{{ query }}\n\n"
                    "Sources:\n{{ sources_summary }}\n\n"
                    "Context:\n{{ context or '(No AFI/DAFI passages were retrieved.)' }}\n\n"
                    "Format the reply in Markdown with:\n"
                    "{% for section in sections -%}\n- {{ section }}\n{% endfor %}\n"
                    "{{ additional_notes }}"
                ),
            },
            "hybrid": {
                "system": (
                    "You are an Air Force maintenance assistant. Ground answers in the AFI/DAFI context. "
                    "You may add model knowledge when needed, but label it clearly."
                ),
                "user": (
                    "Question:\n{{ query }}\n\n"
                    "Sources:\n{{ sources_summary }}\n\n"
                    "Context:\n{{ context or '(No AFI/DAFI passages were retrieved.)' }}\n\n"
                    "Format the reply in Markdown with:\n"
                    "{% for section in sections -%}\n- {{ section }}\n{% endfor %}\n"
                    "{{ additional_notes }}"
                ),
            },
            "strict": {
                "system": (
                    "You are an AFI/DAFI assistant. Respond only with information from the provided context. "
                    "If the context is insufficient, say so plainly."
                ),
                "user": (
                    "Question:\n{{ query }}\n\n"
                    "Sources:\n{{ sources_summary }}\n\n"
                    "Context:\n{{ context or '(No AFI/DAFI passages were retrieved.)' }}\n\n"
                    "Format the reply in Markdown with:\n"
                    "{% for section in sections -%}\n- {{ section }}\n{% endfor %}\n"
                    "{{ additional_notes }}"
                ),
            },
        }

    @property
    def silent(self) -> bool:
        return self._config.silent

    def _get_completion_params(self, model: str, max_tokens: int = 1000) -> Dict[str, Any]:
        params: Dict[str, Any] = {"model": model}
        if model.startswith("gpt-5"):
            params["max_completion_tokens"] = max_tokens
        else:
            params["max_tokens"] = max_tokens
            params["temperature"] = 0.1
        return params

    def _render_template(self, template_text: str, context: Dict[str, Any], fallback: str) -> str:
        try:
            rendered = self._jinja_env.from_string(template_text).render(**context)
            rendered_stripped = rendered.strip()
            return rendered_stripped or fallback
        except Exception as exc:  # pragma: no cover - defensive
            if not self.silent:
                print(f"⚠️  Failed to render prompt template: {exc}. Using fallback text.")
            return fallback

    def _build_prompts(
        self,
        user_query: str,
        context: str,
        sources: List[Dict[str, Any]],
        model: str,
        knowledge_only: bool,
    ) -> Tuple[List[Dict[str, str]], int]:
        sources_for_prompt = summarize_sources_for_prompt(sources)
        context_for_prompt = context.strip() or "(No retrieved AFI/DAFI passages were available.)"
        max_tokens = self._config.default_max_tokens
        mode_key = "knowledge_only" if knowledge_only else ("hybrid" if self._config.hybrid_mode else "strict")
        template_config = self._config.get_prompt_template(mode_key) or {}
        default_template = self._default_templates[mode_key]

        template_context: Dict[str, Any] = {
            "query": user_query,
            "sources_summary": sources_for_prompt,
            "context": context_for_prompt,
            "sections": self._sections_by_mode[mode_key],
            "additional_notes": self._notes_by_mode[mode_key],
            "model": model,
        }

        system_template = template_config.get("system") or default_template["system"]
        user_template = template_config.get("user") or default_template["user"]

        system_prompt = self._render_template(system_template, template_context, default_template["system"])
        user_prompt = self._render_template(user_template, template_context, default_template["user"])

        if not self.silent:
            preview_sections = ", ".join(self._sections_by_mode[mode_key])
            print(f"📝 Prompt mode: {mode_key} (sections: {preview_sections})")

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        return messages, max_tokens

    def _fallback_generation(
        self,
        error: Exception,
        original_model: str,
        messages: List[Dict[str, str]],
        max_tokens: int,
    ) -> Tuple[Any, str]:
        if not original_model.startswith("gpt-5"):
            raise error

        fallback_model = "gpt-4o"
        if not self.silent:
            print(f"⚠️  GPT-5 generation issue ({error}). Falling back to {fallback_model}...")

        fallback_params = self._get_completion_params(fallback_model, max_tokens=max_tokens)
        fallback_params["messages"] = messages
        response = self._client.chat.completions.create(**fallback_params)
        return response, fallback_model

    def generate(
        self,
        user_query: str,
        context: str,
        model: str,
        sources: List[Dict[str, Any]],
        knowledge_only: bool = False,
    ) -> Tuple[str, str]:
        messages, max_tokens = self._build_prompts(user_query, context, sources, model, knowledge_only)
        params = self._get_completion_params(model, max_tokens=max_tokens)
        params["messages"] = messages

        try:
            response = self._client.chat.completions.create(**params)
            generation_model = model
        except Exception as error:
            response, generation_model = self._fallback_generation(error, model, messages, max_tokens)

        answer_text = response.choices[0].message.content.strip() if response.choices else ""
        if not answer_text and generation_model.startswith("gpt-5"):
            response, generation_model = self._fallback_generation(RuntimeError("Empty response"), model, messages, max_tokens)
            answer_text = response.choices[0].message.content.strip() if response.choices else ""

        if not answer_text:
            raise RuntimeError("Model returned an empty response after fallback attempts")

        normalized = normalize_answer_markdown(answer_text)
        annotated = annotate_answer_with_sources(normalized, sources)
        return annotated, generation_model
