import json
from typing import List, Tuple, Optional
from .base_agent import BaseAgent
from ..config import StoryConfig
from ..schemas import StoryState
from ..prompts.director_prompts import DIRECTOR_SELECT_SPEAKER_PROMPT, DIRECTOR_CONCLUSION_PROMPT

class DirectorAgent(BaseAgent):
    def __init__(self, config: StoryConfig):
        super().__init__("Director", config)
    
    async def select_next_speaker(self, story_state: StoryState, available_characters: List[str]) -> str:
        """Decide who speaks next."""
        # Format context
        if story_state.dialogue_history:
            recent_dialogue = "\n".join(
                f"{turn.speaker}: {turn.dialogue}" 
                for turn in story_state.dialogue_history[-5:]
            )
        else:
            recent_dialogue = "No dialogue yet. The story is just starting. Select the character most likely to speak first based on the Context."
        
        prompt = DIRECTOR_SELECT_SPEAKER_PROMPT.format(
            description=story_state.seed_story.get('description', ''),
            recent_dialogue=recent_dialogue,
            available_characters=", ".join(available_characters),
            max_consecutive=self.config.max_consecutive_same_character
        )
        
        # print(f"DEBUG: Director Prompt:\n{prompt}\n")
        response = await self.generate_response(prompt)
        
        try:
            cleaned_response = self._clean_json_response(response)
            data = json.loads(cleaned_response)
            next_speaker = data.get("next_speaker")
            narration = data.get("narration")
            
            if next_speaker in available_characters:
                return next_speaker, narration
            return available_characters[0], narration
            
        except Exception as e:
            print(f"Error parsing director selection: {e}")
            print(f"Raw response: {response}")
            return available_characters[0], ""

    async def check_conclusion(self, story_state: StoryState) -> Tuple[bool, Optional[str]]:
        """Check if the story should end."""
        prompt = DIRECTOR_CONCLUSION_PROMPT.format(
            story_summary=f"Context: {story_state.seed_story.get('description', '')}\nLast Turns:\n" + "\n".join([f"{t.speaker}: {t.dialogue}" for t in story_state.dialogue_history[-5:]]),
            current_turn=story_state.current_turn,
            max_turns=self.config.max_turns,
            min_turns=self.config.min_turns
        )
        
        response = await self.generate_response(prompt)
        
        try:
            cleaned_response = self._clean_json_response(response)
            data = json.loads(cleaned_response)
            return data.get("should_end", False), data.get("conclusion_narration")
        except Exception as e:
            print(f"Error parsing director conclusion: {e}")
            return False, None
