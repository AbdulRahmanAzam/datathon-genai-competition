import json
from datetime import datetime
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
from langchain_google_genai import ChatGoogleGenerativeAI
from ..config import StoryConfig

class BaseAgent(ABC):
    def __init__(self, name: str, config: StoryConfig):
        self.name = name
        self.config = config
        self.logs = [] # Store logs in memory
        self.llm = ChatGoogleGenerativeAI(
            model=config.model_name,
            temperature=config.temperature,
            max_output_tokens=config.max_tokens_per_prompt
        )
    
    async def generate_response(self, prompt: str) -> str:
        """Generate a response using the LLM."""
        try:
            # Merging system prompt concept into single message if needed, 
            # but here we just take the prompt as is, assuming it contains everything.
            messages = [
                ("human", prompt)
            ]
            
            response = await self.llm.ainvoke(messages)
            
            # Log the prompt and response
            self._log_interaction(prompt, response.content)
            
            return response.content
        except Exception as e:
            print(f"Error generating response for {self.name}: {e}")
            return ""

    def _log_interaction(self, prompt: str, response: str):
        """Log interaction to memory."""
        entry = {
            "timestamp": datetime.now().isoformat(),
            "agent": self.name,
            "prompt": prompt,
            "response": response
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
