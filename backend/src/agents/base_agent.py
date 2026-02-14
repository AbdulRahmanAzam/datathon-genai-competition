import json
from datetime import datetime
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
from ..config import StoryConfig
from ..llm_provider import get_llm_provider


class BaseAgent(ABC):
    def __init__(self, name: str, config: StoryConfig):
        self.name = name
        self.config = config
        self.logs = []  # Store logs in memory
        # Use the failover LLM provider instead of direct ChatGroq
        self._llm_provider = get_llm_provider(
            temperature=config.temperature,
            max_tokens=config.max_tokens_per_prompt,
        )

    async def generate_response(self, prompt: str) -> str:
        """Generate a response using the failover LLM provider."""
        try:
            response_content, provider_used = await self._llm_provider.generate(prompt)
            self._log_interaction(prompt, response_content, provider_used)
            if not response_content or not response_content.strip():
                print(f"[{self.name}] LLM returned empty content via {provider_used}")
            return response_content
        except Exception as e:
            print(f"[{self.name}] LLM call failed: {e}")
            self._log_interaction(prompt, f"[ERROR] {e}", "failed")
            return ""

    def _log_interaction(self, prompt: str, response: str, provider: str = "unknown"):
        """Log interaction to memory with provider info."""
        entry = {
            "timestamp": datetime.now().isoformat(),
            "agent": self.name,
            "provider": provider,
            "prompt": prompt,
            "response": response,
        }
        self.logs.append(entry)

    def _clean_json_response(self, response: str) -> str:
        """Clean markdown formatting from JSON response."""
        cleaned = response.strip()
        if "```json" in cleaned:
            cleaned = cleaned.split("```json")[1].split("```")[0]
        elif "```" in cleaned:
            cleaned = cleaned.split("```")[1].split("```")[0]
        return cleaned.strip()
