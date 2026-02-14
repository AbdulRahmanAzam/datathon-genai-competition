"""
Multi-API LLM Provider with automatic failover.

Priority order:
1. Gemini API keys (GEMINI_API_KEY_1, GEMINI_API_KEY_2)
2. Groq API keys (GROQ_API_KEY_1, GROQ_API_KEY_2)

If a key is exhausted or returns an error, automatically tries the next one.
"""

import os
import re
import asyncio
from typing import List, Optional, Tuple, Any
from dataclasses import dataclass
from datetime import datetime, timedelta
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_groq import ChatGroq


@dataclass
class APIKeyStatus:
    """Track status of each API key."""
    key: str
    provider: str  # 'gemini' or 'groq'
    model: str
    is_exhausted: bool = False
    last_error: Optional[str] = None
    last_error_time: Optional[datetime] = None
    cooldown_until: Optional[datetime] = None


class LLMProvider:
    """
    Manages multiple LLM API keys with automatic failover.
    Tries Gemini first, then falls back to Groq.
    """

    def __init__(self, temperature: float = 0.7, max_tokens: int = 500):
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.api_keys: List[APIKeyStatus] = []
        self._current_index = 0
        self._lock = asyncio.Lock()
        self._last_request_time: Optional[datetime] = None
        self._min_request_interval = 2.0  # seconds between requests to avoid RPM limits
        
        # Load all available API keys
        self._load_api_keys()
        
        # Track which LLM instances are created
        self._llm_cache: dict = {}

    def _load_api_keys(self):
        """Load API keys from environment variables, respecting GEMINI_ENABLED / GROQ_ENABLED toggles."""
        gemini_enabled = os.getenv("GEMINI_ENABLED", "true").strip().lower() == "true"
        groq_enabled = os.getenv("GROQ_ENABLED", "true").strip().lower() == "true"

        # Load Gemini keys (priority) — only if enabled
        if gemini_enabled:
            gemini_model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
            for i in range(1, 5):
                key = os.getenv(f"GEMINI_API_KEY_{i}")
                if key and key.strip():
                    self.api_keys.append(APIKeyStatus(
                        key=key.strip(),
                        provider="gemini",
                        model=gemini_model,
                    ))
            gemini_key = os.getenv("GEMINI_API_KEY")
            if gemini_key and gemini_key.strip():
                if not any(k.key == gemini_key.strip() for k in self.api_keys):
                    self.api_keys.insert(0, APIKeyStatus(
                        key=gemini_key.strip(),
                        provider="gemini",
                        model=gemini_model,
                    ))
        else:
            print("[LLM Provider] Gemini DISABLED (GEMINI_ENABLED=false)")

        # Load Groq keys (fallback) — only if enabled
        if groq_enabled:
            groq_model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
            for i in range(1, 5):
                key = os.getenv(f"GROQ_API_KEY_{i}")
                if key and key.strip():
                    self.api_keys.append(APIKeyStatus(
                        key=key.strip(),
                        provider="groq",
                        model=groq_model,
                    ))
            groq_key = os.getenv("GROQ_API_KEY")
            if groq_key and groq_key.strip():
                if not any(k.key == groq_key.strip() for k in self.api_keys):
                    self.api_keys.append(APIKeyStatus(
                        key=groq_key.strip(),
                        provider="groq",
                        model=groq_model,
                    ))
        else:
            print("[LLM Provider] Groq DISABLED (GROQ_ENABLED=false)")

        if not self.api_keys:
            raise ValueError(
                "No API keys loaded! Check GEMINI_ENABLED / GROQ_ENABLED in .env "
                "and ensure at least one provider is enabled with valid keys."
            )

        print(f"[LLM Provider] Loaded {len(self.api_keys)} API keys:")
        for i, k in enumerate(self.api_keys):
            print(f"  {i+1}. {k.provider.upper()} ({k.model}) - {k.key[:8]}...{k.key[-4:]}")

    def _create_llm(self, api_key_status: APIKeyStatus) -> BaseChatModel:
        """Create an LLM instance for the given API key."""
        cache_key = api_key_status.key[:16]
        
        if cache_key in self._llm_cache:
            return self._llm_cache[cache_key]

        if api_key_status.provider == "gemini":
            # Import here to avoid issues if langchain-google-genai not installed
            try:
                from langchain_google_genai import ChatGoogleGenerativeAI
                llm = ChatGoogleGenerativeAI(
                    model=api_key_status.model,
                    google_api_key=api_key_status.key,
                    temperature=self.temperature,
                    max_output_tokens=self.max_tokens,
                )
            except ImportError:
                raise ImportError(
                    "langchain-google-genai is required for Gemini. "
                    "Install it with: pip install langchain-google-genai"
                )
        else:  # groq
            llm = ChatGroq(
                model=api_key_status.model,
                api_key=api_key_status.key,
                temperature=self.temperature,
                max_tokens=self.max_tokens,
            )

        self._llm_cache[cache_key] = llm
        return llm

    def _is_rate_limit_error(self, error: Exception) -> bool:
        """Check if error is a rate limit / quota exhaustion error."""
        error_str = str(error).lower()
        rate_limit_indicators = [
            "rate limit",
            "rate_limit",
            "quota",
            "exhausted",
            "too many requests",
            "429",
            "resource_exhausted",
            "tokens per minute",
            "requests per minute",
        ]
        return any(indicator in error_str for indicator in rate_limit_indicators)

    def _is_model_error(self, error: Exception) -> bool:
        """Check if error is a model-not-found or permanent config error."""
        error_str = str(error).lower()
        model_indicators = [
            "not_found",
            "404",
            "model not found",
            "not supported",
            "invalid model",
        ]
        return any(indicator in error_str for indicator in model_indicators)

    def _is_auth_error(self, error: Exception) -> bool:
        """Check if error is an authentication error (bad key)."""
        error_str = str(error).lower()
        auth_indicators = [
            "invalid api key",
            "unauthorized",
            "authentication",
            "401",
            "403",
            "api key not valid",
            "invalid_api_key",
        ]
        return any(indicator in error_str for indicator in auth_indicators)

    def _parse_retry_delay(self, error: Exception) -> float:
        """Extract retry delay from API error message, default to 15s."""
        error_str = str(error)
        # Match patterns like "retry in 13.42s", "retryDelay: 13s", "Please retry in 13.42547817s"
        match = re.search(r'retry\s*(?:in|Delay["\']?\s*[:=]\s*["\']?)\s*(\d+(?:\.\d+)?)\s*s', error_str, re.IGNORECASE)
        if match:
            return min(float(match.group(1)) + 2.0, 30.0)  # add 2s buffer, cap at 30s
        return 15.0  # default: 15s instead of 60s

    async def _mark_key_exhausted(self, index: int, error: Exception, temporary: bool = True):
        """Mark an API key as temporarily or permanently exhausted."""
        async with self._lock:
            if index < len(self.api_keys):
                key_status = self.api_keys[index]
                key_status.last_error = str(error)
                key_status.last_error_time = datetime.now()
                
                if temporary:
                    # Rate limit: use actual retry delay from API instead of hardcoded 60s
                    cooldown = self._parse_retry_delay(error)
                    key_status.cooldown_until = datetime.now() + timedelta(seconds=cooldown)
                    print(f"[LLM Provider] Key {index+1} ({key_status.provider}) rate limited, cooldown {cooldown:.0f}s")
                else:
                    # Auth error: permanently mark as exhausted
                    key_status.is_exhausted = True
                    print(f"[LLM Provider] Key {index+1} ({key_status.provider}) permanently disabled")

    def _get_available_key_index(self) -> Optional[int]:
        """Get the next available API key index."""
        now = datetime.now()
        
        # First pass: find a non-exhausted, non-cooldown key
        for i, key_status in enumerate(self.api_keys):
            if key_status.is_exhausted:
                continue
            if key_status.cooldown_until and now < key_status.cooldown_until:
                continue
            return i
        
        # Second pass: find earliest cooldown expiry
        earliest_cooldown = None
        earliest_index = None
        for i, key_status in enumerate(self.api_keys):
            if key_status.is_exhausted:
                continue
            if key_status.cooldown_until:
                if earliest_cooldown is None or key_status.cooldown_until < earliest_cooldown:
                    earliest_cooldown = key_status.cooldown_until
                    earliest_index = i
        
        return earliest_index

    async def generate(self, prompt: str) -> Tuple[str, str]:
        """
        Generate a response using the best available LLM.
        Returns (response_text, provider_name).
        
        Automatically handles failover between API keys.
        """
        max_attempts = len(self.api_keys) * 3  # Allow more retries after cooldowns
        attempts = 0
        last_error = None

        while attempts < max_attempts:
            key_index = self._get_available_key_index()
            
            if key_index is None:
                # All keys permanently exhausted
                non_exhausted = [k for k in self.api_keys if not k.is_exhausted]
                if not non_exhausted:
                    break
                await asyncio.sleep(3)
                attempts += 1
                continue

            key_status = self.api_keys[key_index]

            # Wait for cooldown to expire before trying this key
            if key_status.cooldown_until:
                now = datetime.now()
                if now < key_status.cooldown_until:
                    wait_secs = (key_status.cooldown_until - now).total_seconds()
                    if wait_secs > 0:
                        print(f"[LLM Provider] Waiting {wait_secs:.1f}s for key {key_index+1} ({key_status.provider}) cooldown...")
                        await asyncio.sleep(wait_secs)
                    # Clear cooldown after waiting
                    key_status.cooldown_until = None
            
            # Throttle: ensure minimum interval between requests
            if self._last_request_time:
                elapsed = (datetime.now() - self._last_request_time).total_seconds()
                if elapsed < self._min_request_interval:
                    await asyncio.sleep(self._min_request_interval - elapsed)
            
            try:
                llm = self._create_llm(key_status)
                messages = [("human", prompt)]
                self._last_request_time = datetime.now()
                response = await llm.ainvoke(messages)
                
                # Success! Clear any previous cooldown
                key_status.cooldown_until = None
                key_status.last_error = None
                
                return response.content, f"{key_status.provider}:{key_status.model}"

            except Exception as e:
                last_error = e
                error_msg = str(e)
                print(f"[LLM Provider] Error with key {key_index+1} ({key_status.provider}): {error_msg[:150]}...")

                if self._is_auth_error(e):
                    await self._mark_key_exhausted(key_index, e, temporary=False)
                elif self._is_model_error(e):
                    print(f"[LLM Provider] Model error for {key_status.provider}, disabling key {key_index+1}")
                    await self._mark_key_exhausted(key_index, e, temporary=False)
                elif self._is_rate_limit_error(e):
                    await self._mark_key_exhausted(key_index, e, temporary=True)
                else:
                    await self._mark_key_exhausted(key_index, e, temporary=True)

                attempts += 1

        # All retries failed
        raise RuntimeError(
            f"All API keys exhausted after {max_attempts} attempts. "
            f"Last error: {last_error}"
        )

    def get_status(self) -> List[dict]:
        """Get status of all API keys for debugging."""
        return [
            {
                "index": i + 1,
                "provider": k.provider,
                "model": k.model,
                "key_prefix": k.key[:8],
                "is_exhausted": k.is_exhausted,
                "in_cooldown": k.cooldown_until and datetime.now() < k.cooldown_until,
                "last_error": k.last_error[:50] if k.last_error else None,
            }
            for i, k in enumerate(self.api_keys)
        ]


# Singleton instance
_provider_instance: Optional[LLMProvider] = None


def get_llm_provider(temperature: float = 0.7, max_tokens: int = 500) -> LLMProvider:
    """Get or create the singleton LLM provider."""
    global _provider_instance
    if _provider_instance is None:
        _provider_instance = LLMProvider(temperature=temperature, max_tokens=max_tokens)
    return _provider_instance


def reset_llm_provider():
    """Reset the singleton (useful for testing)."""
    global _provider_instance
    _provider_instance = None
