/**
 * NarrativeVerse WhatsApp Bot
 * 
 * Uses Baileys to connect to WhatsApp and manage story generation sessions.
 * 
 * Activation: Send "narrative verse" or "narrativeverse"
 * Deactivation: Send "narrative verse end" or "narrativeverse end"
 * 
 * Flow:
 * 1. User sends activation phrase
 * 2. Bot prompts for seed story (title, scenario, characters)
 * 3. User sends seed story in one message
 * 4. Bot generates story via backend API
 * 5. Bot sends 2 PDFs: Pipeline view + Movie Scene view
 * 6. User can generate another story or deactivate
 */

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import { SessionManager, STATE } from './sessionManager.js';
import { parseSeedStory } from './seedParser.js';
import { generateStory } from './storyGenerator.js';
import { generatePipelinePDF, generateMovieScenePDF } from './pdfGenerator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const logger = pino({ level: 'silent' });
const sessionManager = new SessionManager();

// Ensure output directory exists
const OUTPUT_DIR = path.join(__dirname, '..', 'output');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// ═══════════════════════════════════════════════════════════════════════
// MESSAGE TEMPLATES
// ═══════════════════════════════════════════════════════════════════════

const MESSAGES = {
  welcome: `🎬 *NarrativeVerse Activated!*

Welcome to NarrativeVerse — an AI-powered multi-agent storytelling engine.

Please send your *seed story* in a single message with this format:

\`\`\`
Title: Your Story Title
Scenario: Describe the scene, setting, and situation...
Max Turns: 25

Character1 Name: Character description...
Character2 Name: Character description...
Character3 Name: Character description...
\`\`\`

_Example:_
Title: The Rickshaw Accident
Scenario: Late afternoon on Shahrah-e-Faisal near Karachi Airport. Rush hour traffic...
Max Turns: 30

Saleem: Poor rickshaw driver, sole earner for family of 5...
Ahmed Malik: Wealthy car owner and businessman...
Constable Raza: 15-year traffic police veteran...

📝 Send your seed story now!`,

  generating: (title) => `🎬 *Generating Story: ${title}*

⏳ The multi-agent AI system is now crafting your narrative...

This involves:
• 🎭 Director Agent planning the story arc
• 🧠 Character agents reasoning and deciding
• ⚡ Action system processing events
• 📝 Memory updates for each character
• ✅ Conclusion checks

_This may take 2-5 minutes. Please wait..._`,

  progress: (phase, turn) => {
    const phaseLabels = {
      director_select: '🎭 Director selecting next speaker',
      character_reason: '🧠 Character reasoning & deciding',
      process_action: '⚡ Processing action/dialogue',
      memory_update: '📝 Updating character memories',
      check_conclusion: '✅ Checking story conclusion',
      conclude_story: '🎬 Concluding story',
    };
    return `_Turn ${turn}: ${phaseLabels[phase] || phase}_`;
  },

  completed: (title, turns, actions) => `✅ *Story Complete: ${title}*

📊 Stats:
• Turns: ${turns}
• Distinct Actions: ${actions}

📄 Sending your PDFs now...`,

  pdfSent: `📄 *PDFs Sent!*

You received:
1. 📋 *Pipeline View* — Full multi-agent pipeline with all reasoning, actions, and memories
2. 🎬 *Movie Scene View* — Cinematic narrative with dialogue and action scenes

Want to generate another story? Just send a new seed story!
Or send *"narrative verse end"* to deactivate the bot.`,

  goodbye: `👋 *NarrativeVerse Deactivated*

Thanks for using NarrativeVerse! Send *"narrative verse"* anytime to start again.`,

  error: (msg) => `❌ *Error:* ${msg}\n\nPlease try again or send *"narrative verse end"* to reset.`,

  parseError: `❌ *Could not parse your seed story.*

Please make sure your message includes:
• A title (e.g., "Title: The Rickshaw Accident")
• A scenario description
• At least 2 characters with descriptions

_Try again with the correct format!_`,

  alreadyGenerating: `⏳ A story is already being generated. Please wait for it to finish.`,
};

// ═══════════════════════════════════════════════════════════════════════
// WHATSAPP CONNECTION
// ═══════════════════════════════════════════════════════════════════════

async function startBot() {
  const authDir = path.join(__dirname, '..', 'auth_info');
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    generateHighQualityLinkPreview: false,
  });

  // ── Connection events ─────────────────────────────────────────
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr: qrCode } = update;

    if (qrCode) {
      console.log('\n📱 Scan this QR code with WhatsApp:\n');
      qrcode.generate(qrCode, { small: true });
      console.log('');
    }

    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      console.log(`Connection closed. Reason: ${reason}`);

      if (reason === DisconnectReason.loggedOut) {
        console.log('Logged out. Delete auth_info/ and restart to re-authenticate.');
      } else {
        // Reconnect
        console.log('Reconnecting...');
        startBot();
      }
    } else if (connection === 'open') {
      console.log('\n✅ WhatsApp Bot Connected!\n');
      console.log('Listening for "narrative verse" activation messages...\n');
    }
  });

  // Save auth credentials on update
  sock.ev.on('creds.update', saveCreds);

  // ── Message handler ───────────────────────────────────────────
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      // Skip non-text messages, status broadcasts, and own messages
      if (!msg.message) continue;
      if (msg.key.fromMe) continue;
      if (msg.key.remoteJid === 'status@broadcast') continue;

      const jid = msg.key.remoteJid;
      const text = msg.message.conversation ||
                   msg.message.extendedTextMessage?.text ||
                   '';

      if (!text.trim()) continue;

      await handleMessage(sock, jid, text.trim(), msg);
    }
  });

  return sock;
}

// ═══════════════════════════════════════════════════════════════════════
// MESSAGE HANDLER
// ═══════════════════════════════════════════════════════════════════════

async function handleMessage(sock, jid, text, rawMsg) {
  // ── Check for deactivation ────────────────────────────────────
  if (sessionManager.isDeactivationPhrase(text)) {
    if (sessionManager.hasActiveSession(jid)) {
      sessionManager.endSession(jid);
      await sendText(sock, jid, MESSAGES.goodbye);
    }
    return;
  }

  // ── Check for activation ──────────────────────────────────────
  if (sessionManager.isActivationPhrase(text)) {
    sessionManager.createSession(jid);
    sessionManager.setState(jid, STATE.WAITING_SEED);
    await sendText(sock, jid, MESSAGES.welcome);
    return;
  }

  // ── Only process messages from active sessions ────────────────
  if (!sessionManager.hasActiveSession(jid)) {
    // Silently ignore messages from non-activated users
    return;
  }

  const session = sessionManager.getSession(jid);

  // ── Handle based on session state ─────────────────────────────
  switch (session.state) {
    case STATE.ACTIVATED:
    case STATE.WAITING_SEED:
      await handleSeedInput(sock, jid, text);
      break;

    case STATE.GENERATING:
      await sendText(sock, jid, MESSAGES.alreadyGenerating);
      break;

    case STATE.COMPLETED:
      // After completion, user can send another seed story
      await handleSeedInput(sock, jid, text);
      break;

    default:
      break;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// SEED INPUT HANDLER
// ═══════════════════════════════════════════════════════════════════════

async function handleSeedInput(sock, jid, text) {
  try {
    // Parse the seed story
    const seedData = await parseSeedStory(text);
    sessionManager.setSeedData(jid, seedData);
    sessionManager.setState(jid, STATE.GENERATING);

    // Notify user that generation is starting
    await sendText(sock, jid, MESSAGES.generating(seedData.title));

    // Generate the story
    let lastProgressUpdate = 0;
    const storyResult = await generateStory(seedData, (phase, turn) => {
      // Send progress updates every 3 turns
      const now = Date.now();
      if (now - lastProgressUpdate > 15000) { // max once per 15 seconds
        lastProgressUpdate = now;
        sendText(sock, jid, MESSAGES.progress(phase, turn)).catch(() => {});
      }
    });

    // Store timeline in session
    sessionManager.setTimeline(jid, storyResult.timeline);

    // Notify completion
    const totalTurns = storyResult.conclusionData?.turn || storyResult.totalTurns || 0;
    const totalActions = storyResult.conclusionData?.totalActions || 0;
    await sendText(sock, jid, MESSAGES.completed(seedData.title, totalTurns, totalActions));

    // Generate PDFs
    const timestamp = Date.now();
    const safeTitle = seedData.title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
    const pipelinePath = path.join(OUTPUT_DIR, `${safeTitle}_pipeline_${timestamp}.pdf`);
    const moviePath = path.join(OUTPUT_DIR, `${safeTitle}_movie_scene_${timestamp}.pdf`);

    await Promise.all([
      generatePipelinePDF(storyResult, pipelinePath),
      generateMovieScenePDF(storyResult, moviePath),
    ]);

    // Send PDFs
    await sendDocument(sock, jid, pipelinePath, `${seedData.title} - Pipeline View.pdf`);
    await sendDocument(sock, jid, moviePath, `${seedData.title} - Movie Scene.pdf`);

    // Send completion message
    await sendText(sock, jid, MESSAGES.pdfSent);

    // Update session state
    sessionManager.setState(jid, STATE.COMPLETED);

    // Clean up PDF files after sending
    setTimeout(() => {
      try {
        if (fs.existsSync(pipelinePath)) fs.unlinkSync(pipelinePath);
        if (fs.existsSync(moviePath)) fs.unlinkSync(moviePath);
      } catch { /* ignore cleanup errors */ }
    }, 30000);

  } catch (error) {
    console.error(`[Error] Story generation failed for ${jid}:`, error.message);

    if (error.message.includes('parse') || error.message.includes('Parse') ||
        error.message.includes('Invalid seed') || error.message.includes('No JSON')) {
      await sendText(sock, jid, MESSAGES.parseError);
    } else {
      await sendText(sock, jid, MESSAGES.error(error.message));
    }

    // Reset state so user can try again
    sessionManager.setState(jid, STATE.WAITING_SEED);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// SEND HELPERS
// ═══════════════════════════════════════════════════════════════════════

async function sendText(sock, jid, text) {
  await sock.sendMessage(jid, { text });
}

async function sendDocument(sock, jid, filePath, fileName) {
  const buffer = fs.readFileSync(filePath);
  await sock.sendMessage(jid, {
    document: buffer,
    mimetype: 'application/pdf',
    fileName,
  });
}

// ═══════════════════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════════════════

console.log('');
console.log('╔══════════════════════════════════════════════════╗');
console.log('║         🎬 NarrativeVerse WhatsApp Bot          ║');
console.log('║                                                  ║');
console.log('║  Activation:   "narrative verse"                 ║');
console.log('║  Deactivation: "narrative verse end"             ║');
console.log('╚══════════════════════════════════════════════════╝');
console.log('');

startBot().catch(err => {
  console.error('Failed to start bot:', err);
  process.exit(1);
});
