/**
 * Story Generator
 * 
 * Connects to the NarrativeVerse backend API and processes the SSE stream
 * to collect the full story timeline for PDF generation.
 */

import dotenv from 'dotenv';
dotenv.config();

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

/**
 * Generate a story by calling the backend API and collecting all SSE events.
 * 
 * @param {object} seedData - {title, description, characters, maxTurns?}
 * @param {function} onProgress - Callback for progress updates (phase, turn)
 * @returns {Promise<{timeline: Array, title: string, characters: Array}>}
 */
async function generateStory(seedData, onProgress = null) {
  const maxTurns = seedData.maxTurns || 25;
  const requestBody = {
    title: seedData.title,
    description: seedData.description,
    characters: seedData.characters,
    max_turns: maxTurns,
    min_turns: Math.min(10, maxTurns),
    min_actions: Math.max(2, Math.floor(maxTurns / 5)),
  };

  const response = await fetch(`${BACKEND_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error(`Backend API error: ${response.status} ${response.statusText}`);
  }

  const timeline = [];
  let currentTurn = 0;
  let concluded = false;
  let conclusionData = null;

  // Read the SSE stream
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    let eventType = null;
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith('data: ') && eventType) {
        try {
          const data = JSON.parse(line.slice(6));
          const evt = processSSEEvent(eventType, data);
          if (evt) {
            timeline.push(evt);
            
            if (evt.type === 'phase') {
              currentTurn = evt.turn;
              if (onProgress) onProgress(evt.phase, evt.turn);
            }
            if (evt.type === 'concluded') {
              concluded = true;
              conclusionData = evt;
            }
          }
        } catch {
          // Skip malformed JSON
        }
        eventType = null;
      }
    }
  }

  return {
    timeline,
    title: seedData.title,
    characters: seedData.characters,
    concluded,
    conclusionData,
    totalTurns: currentTurn,
  };
}

/**
 * Process a single SSE event into a timeline entry.
 */
function processSSEEvent(type, data) {
  switch (type) {
    case 'step':
      return { type: 'phase', phase: data.phase, turn: data.turn };

    case 'director_result':
      return { type: 'director', ...data };

    case 'reasoning_result':
      return { type: 'reasoning', ...data };

    case 'action_result':
      return { ...data, type: 'event', contentType: data.type };

    case 'memory_result':
      return { type: 'memory', ...data };

    case 'conclusion_check':
      return { type: 'conclusion_check', ...data };

    case 'concluded':
      return { type: 'concluded', ...data };

    case 'done':
      return { type: 'done' };

    default:
      return null;
  }
}

export { generateStory };
