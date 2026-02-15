/**
 * PDF Generator for NarrativeVerse WhatsApp Bot
 * 
 * Generates two PDFs matching the visual theme of the /live page:
 * 1. Pipeline PDF - Full pipeline view with all agent events
 * 2. Movie Scene PDF - Cinematic narrative view
 */

import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Theme Colors (Light Mode) ────────────────────────────────────────
const COLORS = {
  bg: '#FAFAFE',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  cardHover: '#F5F5F5',
  primary: '#7C4DFF',
  secondary: '#651FFF',
  accent: '#D500F9',
  accentWarm: '#FF6D00',
  neonPurple: '#B388FF',
  neonPink: '#FF80AB',
  neonBlue: '#82B1FF',
  neonCyan: '#18FFFF',
  neonGreen: '#69F0AE',
  textDark: '#1A1A1A',
  textBody: '#424242',
  textGray: '#616161',
  textMuted: '#9E9E9E',
  textLight: '#BDBDBD',
  border: '#E0E0E0',
  borderLight: '#F0F0F0',
};

const CHAR_COLORS = ['#7C4DFF', '#D500F9', '#FF6D00', '#00BCD4', '#69F0AE', '#FF80AB'];

const PHASE_COLORS = {
  director_select: '#7C4DFF',
  character_reason: '#D500F9',
  process_action: '#FF6D00',
  memory_update: '#82B1FF',
  check_conclusion: '#69F0AE',
  conclude_story: '#FF80AB',
};

const PHASE_LABELS = {
  director_select: 'Director Select',
  character_reason: 'Character Reason',
  process_action: 'Process Action',
  memory_update: 'Memory Update',
  check_conclusion: 'Check Conclusion',
  conclude_story: 'Conclude Story',
};

function charColor(name, chars) {
  const idx = chars.findIndex(c => c.name === name);
  return CHAR_COLORS[idx >= 0 ? idx % CHAR_COLORS.length : 0];
}

function hexToRGB(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

function blendColor(hex, alpha, bgHex = '#FAFAFE') {
  const [r1, g1, b1] = hexToRGB(hex);
  const [r2, g2, b2] = hexToRGB(bgHex);
  const r = Math.round(r1 * alpha + r2 * (1 - alpha));
  const g = Math.round(g1 * alpha + g2 * (1 - alpha));
  const b = Math.round(b1 * alpha + b2 * (1 - alpha));
  return [r, g, b];
}

// ── Helper: Check page space & add new page ─────────────────────────
function ensureSpace(doc, needed) {
  if (doc.y + needed > doc.page.height - 60) {
    doc.addPage();
    // Dark background
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(COLORS.bg);
    doc.y = 40;
    return true;
  }
  return false;
}

// ── Helper: Draw rounded rect ───────────────────────────────────────
function drawCard(doc, x, y, w, h, options = {}) {
  const { fillColor = COLORS.card, borderColor = null, borderWidth = 1, radius = 8 } = options;
  
  doc.save();
  doc.roundedRect(x, y, w, h, radius).fill(fillColor);
  
  if (borderColor) {
    doc.roundedRect(x, y, w, h, radius)
      .lineWidth(borderWidth)
      .stroke(borderColor);
  }
  doc.restore();
}

// ── Helper: Draw colored left border on card ────────────────────────
function drawCardWithLeftBorder(doc, x, y, w, h, borderColor, options = {}) {
  const { fillColor = COLORS.card, radius = 8 } = options;
  
  doc.save();
  doc.roundedRect(x, y, w, h, radius).fill(fillColor);
  // Left border stripe
  doc.rect(x, y + 4, 3, h - 8).fill(borderColor);
  doc.restore();
}

// ═══════════════════════════════════════════════════════════════════════
// PIPELINE PDF
// ═══════════════════════════════════════════════════════════════════════

async function generatePipelinePDF(storyResult, outputPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 40,
      bufferPages: true,
    });

    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    const pageW = doc.page.width;
    const contentW = pageW - 80;
    const marginLeft = 40;

    // ── Page background ─────────────────────────────────────────
    doc.rect(0, 0, pageW, doc.page.height).fill(COLORS.bg);

    // ── Title Header ────────────────────────────────────────────
    doc.fontSize(10).fillColor(COLORS.textMuted).text('NARRATIVEVERSE', marginLeft, 30, { align: 'center' });
    doc.fontSize(8).fillColor(COLORS.textLight).text('Pipeline View', marginLeft, 44, { align: 'center' });
    
    doc.fontSize(22).fillColor(COLORS.textDark);
    doc.text(storyResult.title || 'Untitled', marginLeft, 62, { align: 'center' });
    
    // Gradient line
    const lineY = doc.y + 8;
    const lineW = 120;
    const lineX = (pageW - lineW) / 2;
    doc.rect(lineX, lineY, lineW / 2, 2).fill(COLORS.primary);
    doc.rect(lineX + lineW / 2, lineY, lineW / 2, 2).fill(COLORS.accent);
    
    doc.y = lineY + 18;

    // ── Character Legend ────────────────────────────────────────
    const chars = storyResult.characters || [];
    let legendX = marginLeft + 10;
    doc.fontSize(7).fillColor(COLORS.textMuted).text('Cast:', marginLeft, doc.y);
    doc.y += 2;
    const legendY = doc.y;
    for (let i = 0; i < chars.length; i++) {
      const color = CHAR_COLORS[i % CHAR_COLORS.length];
      doc.circle(legendX + 4, legendY + 4, 4).fill(color);
      doc.fontSize(8).fillColor(COLORS.textBody);
      doc.text(chars[i].name, legendX + 12, legendY, { continued: false });
      legendX += doc.widthOfString(chars[i].name) + 24;
    }
    doc.y = legendY + 18;

    // ── Render Timeline Events ──────────────────────────────────
    const timeline = storyResult.timeline || [];

    for (const evt of timeline) {
      if (evt.type === 'done') continue;

      if (evt.type === 'phase') {
        renderPhaseTag(doc, evt, marginLeft, contentW);
      } else if (evt.type === 'director') {
        renderDirectorCard(doc, evt, marginLeft, contentW);
      } else if (evt.type === 'reasoning') {
        renderReasoningCard(doc, evt, marginLeft, contentW, chars);
      } else if (evt.type === 'event') {
        renderEventCard(doc, evt, marginLeft, contentW, chars);
      } else if (evt.type === 'memory') {
        renderMemoryCard(doc, evt, marginLeft, contentW);
      } else if (evt.type === 'conclusion_check') {
        renderConclusionCheckCard(doc, evt, marginLeft, contentW);
      } else if (evt.type === 'concluded') {
        renderConcludedCard(doc, evt, marginLeft, contentW);
      }
    }

    // ── Footer ──────────────────────────────────────────────────
    doc.fontSize(7).fillColor(COLORS.textMuted);
    doc.text('Generated by NarrativeVerse • Pipeline View', marginLeft, doc.page.height - 30, { align: 'center' });

    doc.end();
    stream.on('finish', () => resolve(outputPath));
    stream.on('error', reject);
  });
}

// ── Phase Tag ───────────────────────────────────────────────────────
function renderPhaseTag(doc, evt, x, w) {
  ensureSpace(doc, 20);
  const color = PHASE_COLORS[evt.phase] || COLORS.primary;
  const label = PHASE_LABELS[evt.phase] || evt.phase;
  
  doc.circle(x + 6, doc.y + 5, 3).fill(color);
  doc.fontSize(7).fillColor(color).text(label.toUpperCase(), x + 14, doc.y + 1, { continued: true });
  doc.fillColor(COLORS.textMuted).text(`  T${evt.turn}`, { continued: false });
  doc.y += 6;
}

// ── Director Card ───────────────────────────────────────────────────
function renderDirectorCard(doc, evt, x, w) {
  const narration = evt.narration || '';
  const textH = narration ? doc.heightOfString(narration, { width: w - 30, fontSize: 9 }) : 0;
  const cardH = 44 + textH;
  
  ensureSpace(doc, cardH + 8);
  const startY = doc.y;
  
  const cardBg = blendColor(COLORS.primary, 0.03, COLORS.bg);
  drawCardWithLeftBorder(doc, x, startY, w, cardH, COLORS.primary, {
    fillColor: [cardBg[0], cardBg[1], cardBg[2]],
  });
  
  // Header
  doc.fontSize(8).fillColor(COLORS.primary).text('⚡ Director Agent', x + 12, startY + 8, { continued: true });
  doc.fillColor(COLORS.textMuted).text(`   Turn ${evt.turn}`, { continued: false });
  
  // Narration
  if (narration) {
    doc.fontSize(9).fillColor(COLORS.textBody);
    doc.text(`"${narration}"`, x + 12, startY + 22, { width: w - 30, oblique: true });
  }
  
  // Badges
  const badgeY = startY + cardH - 16;
  let bx = x + 12;
  
  // Next speaker badge
  drawCard(doc, bx, badgeY, doc.widthOfString(`→ ${evt.nextSpeaker}`) + 12, 14, {
    fillColor: '#F3E5FF', radius: 4,
  });
  doc.fontSize(7).fillColor(COLORS.primary).text(`→ ${evt.nextSpeaker}`, bx + 6, badgeY + 3);
  bx += doc.widthOfString(`→ ${evt.nextSpeaker}`) + 20;
  
  if (evt.forceAct) {
    drawCard(doc, bx, badgeY, 55, 14, { fillColor: '#FFF3E0', radius: 4 });
    doc.fontSize(7).fillColor(COLORS.accentWarm).text('Force ACT', bx + 6, badgeY + 3);
    bx += 62;
  }
  
  if (evt.endgame) {
    drawCard(doc, bx, badgeY, 55, 14, { fillColor: '#FFEBEE', radius: 4 });
    doc.fontSize(7).fillColor('#D32F2F').text('Endgame', bx + 6, badgeY + 3);
    bx += 62;
  }
  
  // Actions count
  drawCard(doc, bx, badgeY, 65, 14, { fillColor: '#F5F5F5', radius: 4 });
  doc.fontSize(7).fillColor(COLORS.textMuted).text(`${evt.distinctActions || 0} actions`, bx + 6, badgeY + 3);
  
  doc.y = startY + cardH + 6;
}

// ── Reasoning Card ──────────────────────────────────────────────────
function renderReasoningCard(doc, evt, x, w, chars) {
  const color = charColor(evt.speaker, chars);
  const obs = evt.observation || '';
  const reas = evt.reasoning || '';
  const textH = (obs ? doc.heightOfString(obs, { width: w - 40, fontSize: 7 }) : 0) +
                (reas ? doc.heightOfString(reas, { width: w - 40, fontSize: 7 }) : 0);
  const cardH = 35 + textH + (evt.mode === 'ACT' ? 14 : 0);
  
  ensureSpace(doc, cardH + 8);
  const startY = doc.y;
  
  const reasoningBg = blendColor(color, 0.05, COLORS.bg);
  drawCardWithLeftBorder(doc, x, startY, w, cardH, color, {
    fillColor: [reasoningBg[0], reasoningBg[1], reasoningBg[2]],
  });
  
  // Speaker avatar + name
  doc.circle(x + 18, startY + 14, 8).fill(color);
  doc.fontSize(7).fillColor('#FFFFFF').text(evt.speaker?.[0] || '?', x + 15, startY + 10.5);
  doc.fontSize(8).fillColor(COLORS.textDark).text(evt.speaker, x + 30, startY + 10);
  
  // Mode badge
  const modeColor = evt.mode === 'ACT' ? COLORS.accentWarm : COLORS.textMuted;
  const modeBg = evt.mode === 'ACT' ? '#FFF3E0' : '#F5F5F5';
  const modeX = x + 32 + doc.widthOfString(evt.speaker);
  drawCard(doc, modeX, startY + 8, 30, 14, { fillColor: modeBg, radius: 4 });
  doc.fontSize(7).fillColor(modeColor).text(evt.mode, modeX + 6, startY + 11);
  
  // Emotion badge
  if (evt.emotion) {
    const emX = modeX + 38;
    drawCard(doc, emX, startY + 8, doc.widthOfString(evt.emotion) + 12, 14, { fillColor: '#F5F5F5', radius: 4 });
    doc.fontSize(7).fillColor(COLORS.textMuted).text(evt.emotion, emX + 6, startY + 11);
  }
  
  let textY = startY + 28;
  
  // Observation
  if (obs) {
    doc.fontSize(7).fillColor(COLORS.textGray);
    doc.text('Observes: ', x + 12, textY, { continued: true }).fillColor(COLORS.textMuted).text(obs, { width: w - 40 });
    textY = doc.y + 2;
  }
  
  // Reasoning
  if (reas) {
    doc.fontSize(7).fillColor(COLORS.textGray);
    doc.text('Thinks: ', x + 12, textY, { continued: true }).fillColor(COLORS.textMuted).text(reas, { width: w - 40 });
    textY = doc.y + 2;
  }
  
  // Action type
  if (evt.mode === 'ACT' && evt.action?.type) {
    doc.fontSize(7).fillColor(COLORS.accentWarm).text(`⚡ ${evt.action.type}`, x + 12, textY);
  }
  
  doc.y = startY + cardH + 6;
}

// ── Event Card (Dialogue or Action) ─────────────────────────────────
function renderEventCard(doc, evt, x, w, chars) {
  const isAction = evt.contentType === 'action' || evt.actionType;
  const color = charColor(evt.speaker, chars);
  const content = evt.content || '';
  const contentH = doc.heightOfString(content, { width: w - 56, fontSize: 9 });
  const reasoningH = (evt.observation ? doc.heightOfString(evt.observation, { width: w - 56, fontSize: 7 }) + 4 : 0) +
                     (evt.reasoning ? doc.heightOfString(evt.reasoning, { width: w - 56, fontSize: 7 }) + 4 : 0);
  const cardH = Math.max(55, 42 + contentH + reasoningH);
  
  ensureSpace(doc, cardH + 8);
  const startY = doc.y;
  
  const bgColor = isAction ? '#FFF8F0' : COLORS.card;
  const borderClr = isAction ? '#FFE0B2' : COLORS.border;
  drawCard(doc, x, startY, w, cardH, { fillColor: bgColor, borderColor: borderClr });
  
  // Avatar
  doc.circle(x + 20, startY + 20, 12).fill(color);
  doc.fontSize(9).fillColor('#FFFFFF').text(evt.speaker?.[0] || '?', x + 16, startY + 15.5);
  
  // Badge + Speaker + Turn
  const badgeText = isAction ? 'ACTION' : 'DIALOGUE';
  const badgeBg = isAction ? '#FFF3E0' : '#E3F2FD';
  const badgeColor = isAction ? COLORS.accentWarm : '#1976D2';
  drawCard(doc, x + 38, startY + 8, doc.widthOfString(badgeText) + 12, 13, { fillColor: badgeBg, radius: 3 });
  doc.fontSize(6).fillColor(badgeColor).text(badgeText, x + 44, startY + 11);
  
  doc.fontSize(9).fillColor(COLORS.textDark).text(evt.speaker, x + 38 + doc.widthOfString(badgeText) + 18, startY + 9);
  doc.fontSize(7).fillColor(COLORS.textMuted).text(`Turn ${evt.turn}`, x + w - 50, startY + 10);
  
  // Action type badge
  if (isAction && evt.actionType) {
    const atY = startY + 8;
    const atX = x + 38 + doc.widthOfString(badgeText) + 20 + doc.widthOfString(evt.speaker) + 8;
    if (atX + 80 < x + w - 50) {
      drawCard(doc, atX, atY, doc.widthOfString(evt.actionType) + 20, 13, { fillColor: '#FFF3E0', radius: 3 });
      doc.fontSize(7).fillColor(COLORS.accentWarm).text(`⚡ ${evt.actionType}`, atX + 6, atY + 3);
    }
  }
  
  // Emotion
  if (evt.emotion) {
    doc.fontSize(7).fillColor(COLORS.textMuted);
    const emX = x + w - 50 - doc.widthOfString(evt.emotion) - 16;
    if (emX > x + 200) {
      doc.text(evt.emotion, emX, startY + 10);
    }
  }
  
  // Content
  const contentColor = isAction ? '#E65100' : COLORS.textBody;
  doc.fontSize(9).fillColor(contentColor);
  if (isAction) {
    doc.text(content, x + 38, startY + 26, { width: w - 56, oblique: true });
  } else {
    doc.text(content, x + 38, startY + 26, { width: w - 56 });
  }
  
  // Reasoning trace
  let traceY = startY + 28 + contentH;
  if (evt.observation || evt.reasoning) {
    // Separator line
    doc.rect(x + 38, traceY, w - 76, 0.5).fill(COLORS.border);
    traceY += 4;
    
    if (evt.observation) {
      doc.fontSize(7).fillColor(COLORS.textGray);
      doc.text('Observes: ', x + 38, traceY, { continued: true });
      doc.fillColor(COLORS.textMuted).text(evt.observation, { width: w - 56 });
      traceY = doc.y + 2;
    }
    if (evt.reasoning) {
      doc.fontSize(7).fillColor(COLORS.textGray);
      doc.text('Thinks: ', x + 38, traceY, { continued: true });
      doc.fillColor(COLORS.textMuted).text(evt.reasoning, { width: w - 56 });
    }
  }
  
  doc.y = startY + cardH + 6;
}

// ── Memory Card ─────────────────────────────────────────────────────
function renderMemoryCard(doc, evt, x, w) {
  if (!evt.recentMemories?.length) return;
  
  const textH = evt.recentMemories.reduce((h, m) => 
    h + doc.heightOfString(m, { width: w - 30, fontSize: 7 }) + 3, 0);
  const cardH = 26 + textH;
  
  ensureSpace(doc, cardH + 6);
  const startY = doc.y;
  
  const memBg = blendColor(COLORS.neonBlue, 0.05, COLORS.bg);
  drawCardWithLeftBorder(doc, x, startY, w, cardH, COLORS.neonBlue, {
    fillColor: [memBg[0], memBg[1], memBg[2]],
  });
  
  doc.fontSize(7).fillColor('#1976D2').text('🗄 Memory Buffer', x + 12, startY + 6, { continued: true });
  doc.fillColor(COLORS.textMuted).text(` — ${evt.speaker}`, { continued: false });
  
  let memY = startY + 20;
  for (const m of evt.recentMemories) {
    doc.fontSize(7).fillColor(COLORS.textMuted).text(m, x + 12, memY, { width: w - 30 });
    memY = doc.y + 2;
  }
  
  doc.y = startY + cardH + 4;
}

// ── Conclusion Check Card ───────────────────────────────────────────
function renderConclusionCheckCard(doc, evt, x, w) {
  const cardH = 30 + (evt.reason ? doc.heightOfString(evt.reason, { width: w - 30, fontSize: 7 }) : 0);
  
  ensureSpace(doc, cardH + 6);
  const startY = doc.y;
  
  const conBg = blendColor(COLORS.neonGreen, 0.05, COLORS.bg);
  drawCardWithLeftBorder(doc, x, startY, w, cardH, COLORS.neonGreen, {
    fillColor: [conBg[0], conBg[1], conBg[2]],
  });
  
  doc.fontSize(7).fillColor('#388E3C').text('✓ Conclusion Check', x + 12, startY + 6);
  
  // Status badge
  const statusText = evt.shouldEnd ? 'END' : 'CONTINUE';
  const statusColor = evt.shouldEnd ? '#D32F2F' : COLORS.textMuted;
  const statusBg = evt.shouldEnd ? '#FFEBEE' : '#F5F5F5';
  const statusX = x + w - 70;
  drawCard(doc, statusX, startY + 3, 55, 14, { fillColor: statusBg, radius: 4 });
  doc.fontSize(7).fillColor(statusColor).text(statusText, statusX + 8, startY + 6);
  
  if (evt.reason) {
    doc.fontSize(7).fillColor(COLORS.textMuted).text(evt.reason, x + 12, startY + 20, { width: w - 30 });
  }
  
  doc.y = startY + cardH + 4;
}

// ── Concluded Card ──────────────────────────────────────────────────
function renderConcludedCard(doc, evt, x, w) {
  const narration = evt.conclusionNarration || evt.reason || '';
  const narrationH = narration ? doc.heightOfString(narration, { width: w - 40, fontSize: 9 }) : 0;
  const cardH = 100 + narrationH;
  ensureSpace(doc, cardH + 10);
  const startY = doc.y;
  
  drawCard(doc, x, startY, w, cardH, {
    fillColor: '#F3E5FF',
    borderColor: '#7C4DFF40',
  });
  
  // Film emoji and title
  doc.fontSize(20).text('🎬', x, startY + 10, { align: 'center', width: w });
  doc.fontSize(14).fillColor(COLORS.textDark).text('The End', x, startY + 34, { align: 'center', width: w });
  
  // Conclusion narration
  if (narration) {
    doc.fontSize(9).fillColor(COLORS.textBody);
    doc.text(narration, x + 20, startY + 54, { align: 'center', width: w - 40, oblique: true });
  }
  
  // Stats
  const statsY = startY + 58 + narrationH;
  const centerX = x + w / 2;
  
  doc.fontSize(16).fillColor(COLORS.primary).text(String(evt.turn || 0), centerX - 50, statsY, { width: 40, align: 'center' });
  doc.fontSize(7).fillColor(COLORS.textMuted).text('Turns', centerX - 50, statsY + 18, { width: 40, align: 'center' });
  
  doc.fontSize(16).fillColor(COLORS.accent).text(String(evt.totalActions || 0), centerX + 10, statsY, { width: 40, align: 'center' });
  doc.fontSize(7).fillColor(COLORS.textMuted).text('Actions', centerX + 10, statsY + 18, { width: 40, align: 'center' });
  
  doc.y = startY + cardH + 10;
}


// ═══════════════════════════════════════════════════════════════════════
// MOVIE SCENE PDF
// ═══════════════════════════════════════════════════════════════════════

async function generateMovieScenePDF(storyResult, outputPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 40,
      bufferPages: true,
    });

    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    const pageW = doc.page.width;
    const contentW = pageW - 80;
    const marginLeft = 40;
    const chars = storyResult.characters || [];
    const title = storyResult.title || 'Untitled';

    // ── Light background ─────────────────────────────────────────
    doc.rect(0, 0, pageW, doc.page.height).fill('#FAFAF6');

    // ── Cinematic Title Card ────────────────────────────────────
    doc.fontSize(8).fillColor(COLORS.textMuted);
    doc.text('A NARRATIVEVERSE PRODUCTION', marginLeft, 50, { align: 'center', width: contentW, characterSpacing: 3 });
    
    doc.fontSize(24).fillColor(COLORS.textDark);
    doc.text(title, marginLeft, 74, { align: 'center', width: contentW });
    
    // Gradient line
    const lineY = doc.y + 10;
    const lineW = 120;
    const lineX = (pageW - lineW) / 2;
    doc.rect(lineX, lineY, lineW / 2, 2).fill(COLORS.primary);
    doc.rect(lineX + lineW / 2, lineY, lineW / 2, 2).fill(COLORS.accent);
    
    // Cast list
    let castX = marginLeft + 60;
    const castY = lineY + 16;
    for (let i = 0; i < chars.length; i++) {
      const color = CHAR_COLORS[i % CHAR_COLORS.length];
      doc.circle(castX + 4, castY + 4, 3).fill(color);
      doc.fontSize(8).fillColor(COLORS.textMuted).text(chars[i].name, castX + 11, castY, { continued: false });
      castX += doc.widthOfString(chars[i].name) + 22;
    }
    
    // Separator
    const sepY = castY + 18;
    doc.rect(marginLeft, sepY, contentW, 0.5).fill(COLORS.border);
    
    doc.y = sepY + 16;

    // ── Filter scene events ─────────────────────────────────────
    const timeline = storyResult.timeline || [];
    const sceneEvents = timeline.filter(evt =>
      evt.type === 'event' || evt.type === 'director' || evt.type === 'concluded'
    );

    // ── Render scene events ─────────────────────────────────────
    for (const evt of sceneEvents) {
      if (evt.type === 'director' && evt.narration) {
        renderMovieNarration(doc, evt, marginLeft, contentW);
      } else if (evt.type === 'concluded') {
        renderMovieConclusion(doc, evt, marginLeft, contentW);
      } else if (evt.type === 'event') {
        renderMovieEvent(doc, evt, marginLeft, contentW, chars);
      }
    }

    // ── Footer ──────────────────────────────────────────────────
    doc.fontSize(7).fillColor(COLORS.textMuted);
    doc.text('Generated by NarrativeVerse • Movie Scene View', marginLeft, doc.page.height - 30, { align: 'center', width: contentW });

    doc.end();
    stream.on('finish', () => resolve(outputPath));
    stream.on('error', reject);
  });
}

// ── Movie: Narration Block ──────────────────────────────────────────
function renderMovieNarration(doc, evt, x, w) {
  const narration = evt.narration || '';
  const textH = doc.heightOfString(narration, { width: w - 60, fontSize: 10 });
  const cardH = 36 + textH;
  
  ensureSpace(doc, cardH + 10);
  const startY = doc.y;
  
  // Turn divider
  const divY = startY;
  doc.rect(x, divY, (w - 60) / 2, 0.5).fill(COLORS.border);
  doc.fontSize(7).fillColor(COLORS.textMuted).text(`Turn ${evt.turn}`, x + (w - 40) / 2, divY - 3, { width: 40, align: 'center' });
  doc.rect(x + (w + 60) / 2, divY, (w - 60) / 2, 0.5).fill(COLORS.border);
  
  const blockY = divY + 12;
  
  // "Narration" badge
  drawCard(doc, x + 8, blockY, 55, 14, { fillColor: '#F3E5FF', radius: 3 });
  doc.fontSize(6).fillColor(COLORS.primary).text('NARRATION', x + 15, blockY + 4);
  
  // Narration text (italic, serif-style)
  doc.fontSize(10).fillColor(COLORS.textMuted);
  doc.text(narration, x + 70, blockY + 2, { width: w - 80, oblique: true });
  
  doc.y = blockY + textH + 18;
}

// ── Movie: Event (Dialogue or Action) ───────────────────────────────
function renderMovieEvent(doc, evt, x, w, chars) {
  const isAction = !!evt.actionType;
  const color = charColor(evt.speaker, chars);
  const content = evt.content || '';
  const contentH = doc.heightOfString(content, { width: w - 40, fontSize: 10 });
  const reasoningH = (evt.observation ? doc.heightOfString(evt.observation, { width: w - 40, fontSize: 7 }) + 4 : 0) +
                     (evt.reasoning ? doc.heightOfString(evt.reasoning, { width: w - 40, fontSize: 7 }) + 4 : 0);
  const cardH = 38 + contentH + reasoningH;
  
  ensureSpace(doc, cardH + 8);
  const startY = doc.y;
  
  const bgColor = isAction ? '#FFF8F0' : '#FFFFFF';
  const borderClr = isAction ? '#FFE0B2' : COLORS.border;
  drawCard(doc, x, startY, w, cardH, { fillColor: bgColor, borderColor: borderClr, radius: 8 });
  
  // Header: badge | avatar dot | speaker | emotion | action type | turn
  let hx = x + 12;
  const hy = startY + 8;
  
  // Event type badge
  const badgeText = isAction ? 'ACTION' : 'DIALOGUE';
  const badgeBg = isAction ? '#FFF3E0' : '#E3F2FD';
  const badgeColor = isAction ? COLORS.accentWarm : '#1976D2';
  drawCard(doc, hx, hy, doc.widthOfString(badgeText) + 10, 12, { fillColor: badgeBg, radius: 3 });
  doc.fontSize(6).fillColor(badgeColor).text(badgeText, hx + 5, hy + 3);
  hx += doc.widthOfString(badgeText) + 16;
  
  // Avatar dot
  doc.circle(hx + 4, hy + 6, 4).fill(color);
  hx += 12;
  
  // Speaker name
  doc.fontSize(8).fillColor(color).text(evt.speaker, hx, hy + 2);
  hx += doc.widthOfString(evt.speaker) + 8;
  
  // Emotion
  if (evt.emotion) {
    drawCard(doc, hx, hy, doc.widthOfString(evt.emotion) + 10, 12, { fillColor: '#F5F5F5', radius: 3 });
    doc.fontSize(7).fillColor(COLORS.textMuted).text(evt.emotion, hx + 5, hy + 3);
    hx += doc.widthOfString(evt.emotion) + 16;
  }
  
  // Action type
  if (isAction && evt.actionType) {
    drawCard(doc, hx, hy, doc.widthOfString(evt.actionType) + 16, 12, { fillColor: '#FFF3E0', radius: 3 });
    doc.fontSize(7).fillColor(COLORS.accentWarm).text(`⚡ ${evt.actionType}`, hx + 5, hy + 3);
  }
  
  // Turn number
  doc.fontSize(7).fillColor(COLORS.textMuted).text(`T${evt.turn}`, x + w - 30, hy + 3);
  
  // Content
  const contentY = hy + 18;
  if (isAction) {
    doc.fontSize(10).fillColor('#E65100');
    doc.text(content, x + 14, contentY, { width: w - 40, oblique: true });
  } else {
    doc.fontSize(10).fillColor(COLORS.textBody);
    doc.text(`"${content}"`, x + 14, contentY, { width: w - 40 });
  }
  
  // Reasoning
  let traceY = contentY + contentH + 4;
  if (evt.observation || evt.reasoning) {
    doc.rect(x + 14, traceY, w - 40, 0.5).fill(COLORS.border);
    traceY += 4;
    if (evt.observation) {
      doc.fontSize(7).fillColor(COLORS.textGray).text('Observes: ', x + 14, traceY, { continued: true });
      doc.fillColor(COLORS.textMuted).text(evt.observation, { width: w - 40 });
      traceY = doc.y + 2;
    }
    if (evt.reasoning) {
      doc.fontSize(7).fillColor(COLORS.textGray).text('Thinks: ', x + 14, traceY, { continued: true });
      doc.fillColor(COLORS.textMuted).text(evt.reasoning, { width: w - 40 });
    }
  }
  
  doc.y = startY + cardH + 6;
}

// ── Movie: Conclusion ("The End") ───────────────────────────────────
function renderMovieConclusion(doc, evt, x, w) {
  const narration = evt.conclusionNarration || evt.reason || '';
  const narrationH = narration ? doc.heightOfString(narration, { width: w - 80, fontSize: 9 }) : 0;
  const cardH = 110 + narrationH;
  ensureSpace(doc, cardH + 10);
  const startY = doc.y;
  
  // Top line
  const lineW = 80;
  doc.rect(x + (w - lineW) / 2, startY, lineW, 1).fill(COLORS.border);
  
  // "THE END"
  doc.fontSize(20).fillColor(COLORS.textDark);
  doc.text('THE END', x, startY + 16, { align: 'center', width: w, characterSpacing: 4 });
  
  // Conclusion narration
  if (narration) {
    doc.fontSize(9).fillColor(COLORS.textBody);
    doc.text(narration, x + 40, startY + 44, { align: 'center', width: w - 80, oblique: true });
  }
  
  // Stats
  const statsY = startY + 52 + narrationH;
  const centerX = x + w / 2;
  
  doc.fontSize(14).fillColor(COLORS.primary).text(String(evt.turn || 0), centerX - 50, statsY, { width: 40, align: 'center' });
  doc.fontSize(7).fillColor(COLORS.textMuted).text('Turns', centerX - 50, statsY + 16, { width: 40, align: 'center' });
  
  doc.fontSize(14).fillColor(COLORS.accent).text(String(evt.totalActions || 0), centerX + 10, statsY, { width: 40, align: 'center' });
  doc.fontSize(7).fillColor(COLORS.textMuted).text('Actions', centerX + 10, statsY + 16, { width: 40, align: 'center' });
  
  // Actions taken badges
  if (evt.actionsTaken?.length > 0) {
    let bx = x + 40;
    const by = statsY + 34;
    for (const a of evt.actionsTaken) {
      const bw = doc.widthOfString(a) + 12;
      if (bx + bw > x + w - 40) break;
      drawCard(doc, bx, by, bw, 13, { fillColor: '#F5F5F5', radius: 3 });
      doc.fontSize(7).fillColor(COLORS.textMuted).text(a, bx + 6, by + 3);
      bx += bw + 6;
    }
  }
  
  // Bottom line
  doc.rect(x + (w - lineW) / 2, startY + cardH - 5, lineW, 1).fill(COLORS.border);
  
  doc.y = startY + cardH + 10;
}


// ═══════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════

export { generatePipelinePDF, generateMovieScenePDF };
