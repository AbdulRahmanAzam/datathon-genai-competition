from dataclasses import dataclass
import os
from dotenv import load_dotenv

load_dotenv()


@dataclass
class StoryConfig:
    """Configuration for the story simulation."""
    model_name: str = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
    temperature: float = 0.7

    max_turns: int = 25
    min_turns: int = 10
    max_tokens_per_prompt: int = 500
    max_context_length: int = 4000

    max_consecutive_same_character: int = 2

    num_characters: int = 4
    max_dialogue_length: int = 200

    # Action system
    min_actions: int = 5
    memory_buffer_size: int = 6
    
