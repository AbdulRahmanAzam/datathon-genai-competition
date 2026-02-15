/**
 * Session Manager for NarrativeVerse WhatsApp Bot
 * 
 * Manages active user sessions. Only users who have sent the activation
 * phrase "narrative verse" will have their messages processed.
 */

// Session states
const STATE = {
  ACTIVATED: 'activated',        // Just activated, waiting for seed story
  WAITING_SEED: 'waiting_seed',  // Prompted, waiting for seed input
  GENERATING: 'generating',      // Story is being generated
  COMPLETED: 'completed',        // Story complete, can start new or end
};

class SessionManager {
  constructor() {
    /** @type {Map<string, {state: string, seedData: object|null, timeline: array, startedAt: Date}>} */
    this.sessions = new Map();
  }

  /**
   * Check if a message is an activation phrase
   */
  isActivationPhrase(text) {
    const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');
    return normalized === 'narrative verse' || normalized === 'narrativeverse';
  }

  /**
   * Check if a message is a deactivation phrase
   */
  isDeactivationPhrase(text) {
    const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');
    return (
      normalized === 'narrative verse end' ||
      normalized === 'narrativeverse end' ||
      normalized === 'narrative verse stop' ||
      normalized === 'narrativeverse stop'
    );
  }

  /**
   * Check if user has an active session
   */
  hasActiveSession(jid) {
    return this.sessions.has(jid);
  }

  /**
   * Create a new session for a user
   */
  createSession(jid) {
    this.sessions.set(jid, {
      state: STATE.ACTIVATED,
      seedData: null,
      timeline: [],
      startedAt: new Date(),
    });
  }

  /**
   * End a user's session
   */
  endSession(jid) {
    this.sessions.delete(jid);
  }

  /**
   * Get session for a user
   */
  getSession(jid) {
    return this.sessions.get(jid);
  }

  /**
   * Update session state
   */
  setState(jid, state) {
    const session = this.sessions.get(jid);
    if (session) {
      session.state = state;
    }
  }

  /**
   * Store parsed seed data in session
   */
  setSeedData(jid, seedData) {
    const session = this.sessions.get(jid);
    if (session) {
      session.seedData = seedData;
    }
  }

  /**
   * Store timeline events in session
   */
  setTimeline(jid, timeline) {
    const session = this.sessions.get(jid);
    if (session) {
      session.timeline = timeline;
    }
  }

  /**
   * Get all active session JIDs
   */
  getActiveSessions() {
    return Array.from(this.sessions.keys());
  }
}

export { SessionManager, STATE };
