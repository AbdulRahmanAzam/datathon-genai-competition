/**
 * Seed Story Parser
 * 
 * Uses Groq LLM to intelligently parse free-form WhatsApp messages
 * into the structured format required by the NarrativeVerse backend.
 */

import Groq from 'groq-sdk';
import dotenv from 'dotenv';
dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

/**
 * Parse a free-form message into structured seed story data.
 * Uses LLM for intelligent extraction.
 * 
 * @param {string} rawText - The raw message from WhatsApp
 * @returns {Promise<{title: string, description: string, characters: Array, maxTurns?: number}>}
 */
async function parseSeedStory(rawText) {
  // First try rule-based parsing
  const ruleBased = tryRuleBasedParse(rawText);
  if (ruleBased && ruleBased.title && ruleBased.description && ruleBased.characters.length >= 2) {
    return ruleBased;
  }

  // Fall back to LLM parsing
  const prompt = `You are a parser. Extract the story seed from the following text into a JSON object.

The JSON must have exactly this structure:
{
  "title": "story title",
  "description": "scenario/scene description",
  "characters": [
    {"name": "Character Name", "description": "character description"},
    ...
  ],
  "maxTurns": 25
}

Rules:
- Extract the title from any "Title:" prefix or the first line
- Extract the scenario/scene description from any "scenario:" or "description:" prefix, or from context
- Extract all character definitions. Characters are usually defined as "name: description"
- Extract max turns from any "Max Turns:" or "Max Turn:" prefix (default to 25 if not specified)
- Capitalize character names properly (e.g., "saleem" -> "Saleem", "ahmed malik" -> "Ahmed Malik")
- There should be at least 2 characters
- Return ONLY valid JSON, no markdown, no extra text

Input text:
${rawText}

JSON output:`;

  const completion = await groq.chat.completions.create({
    messages: [{ role: 'user', content: prompt }],
    model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    temperature: 0.1,
    max_tokens: 1500,
  });

  const responseText = completion.choices[0]?.message?.content || '';
  
  // Extract JSON from response
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to parse seed story: No JSON found in LLM response');
  }

  const parsed = JSON.parse(jsonMatch[0]);
  
  // Validate
  if (!parsed.title || !parsed.description || !Array.isArray(parsed.characters) || parsed.characters.length < 2) {
    throw new Error('Invalid seed story: missing title, description, or need at least 2 characters');
  }

  return {
    title: parsed.title,
    description: parsed.description,
    characters: parsed.characters.map(c => ({
      name: c.name,
      description: c.description,
    })),
    maxTurns: parsed.maxTurns || 25,
  };
}

/**
 * Try to parse using simple rules before falling back to LLM.
 */
function tryRuleBasedParse(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  
  let title = '';
  let description = '';
  const characters = [];
  let maxTurns = 25;
  
  let i = 0;
  
  // Look for title
  for (; i < lines.length; i++) {
    const titleMatch = lines[i].match(/^title\s*[:：]\s*(.+)/i);
    if (titleMatch) {
      title = titleMatch[1].trim();
      i++;
      break;
    }
  }
  
  // Look for scenario/description
  for (; i < lines.length; i++) {
    const scenarioMatch = lines[i].match(/^(?:scenario|description|scene)\s*[:：]\s*(.+)/i);
    if (scenarioMatch) {
      description = scenarioMatch[1].trim();
      i++;
      break;
    }
  }
  
  // Look for max turns (can be anywhere in the message)
  const maxTurnsMatch = text.match(/max\s*turns?\s*[:：]?\s*(\d+)/i);
  if (maxTurnsMatch) {
    maxTurns = parseInt(maxTurnsMatch[1], 10);
  }
  
  // Remaining lines are character definitions
  // They follow pattern: "name: description" or "name - description"
  for (; i < lines.length; i++) {
    const charMatch = lines[i].match(/^([^:：\-]+)\s*[:：\-]\s*(.+)/);
    if (charMatch) {
      const name = charMatch[1].trim();
      const desc = charMatch[2].trim();
      
      // Skip if it looks like a field label
      if (/^(title|scenario|description|scene|max\s*turns?)$/i.test(name)) continue;
      
      // Capitalize each word in name
      const capitalizedName = name.replace(/\b\w/g, c => c.toUpperCase());
      characters.push({ name: capitalizedName, description: desc });
    }
  }
  
  if (title && description && characters.length >= 2) {
    return { title, description, characters, maxTurns };
  }
  
  return null;
}

export { parseSeedStory };
