from dataclasses import dataclass
import os
from dotenv import load_dotenv

load_dotenv()


@dataclass
class StoryConfig:
    """Configuration for the story simulation."""
    model_name: str = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    temperature: float = 0.8  # Slightly higher for more creative dialogue

    max_turns: int = 25
    min_turns: int = 10
    max_tokens_per_prompt: int = 800  # Increased for richer responses
    max_context_length: int = 4000

    max_consecutive_same_character: int = 2

    # Action system - min_actions is dynamically calculated as ~20% of max_turns
    min_actions: int = 5  # Default for 25 turns, will be recalculated
    memory_buffer_size: int = 8
    
