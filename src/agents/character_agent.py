from typing import List, Dict
from .base_agent import BaseAgent
from ..config import StoryConfig
from ..schemas import StoryState, CharacterProfile
from ..prompts.character_prompts import get_character_prompt

class CharacterAgent(BaseAgent):
    def __init__(self, name: str, config: StoryConfig):
        super().__init__(name, config)

    async def respond(self, story_state: StoryState, context: str) -> str:
        """Generate a response based on the current story state and context."""
        
        # Get character profile
        character_profile = story_state.character_profiles.get(self.name)
        
        # Build prompt
        prompt = get_character_prompt(
            character_name=self.name,
            character_profile=character_profile,
            context=context,
            config=self.config
        )
        # print(f"DEBUG: {self.name} Prompt:\n{prompt}\n")
        
        try:
            content = await self.generate_response(prompt)
            content = content.strip()
            return content
        except Exception as e:
            print(f"Error in character response: {e}")
            return "..."
