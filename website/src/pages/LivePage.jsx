import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';
import Navbar from '../components/Navbar';
import {
  FiPlay, FiLoader, FiChevronDown, FiChevronUp,
  FiUser, FiUsers, FiMessageSquare, FiZap, FiDatabase,
  FiCheckCircle, FiClock, FiActivity, FiAlertCircle,
  FiFilm, FiTerminal,
} from 'react-icons/fi';

/* ── view modes ─────────────────────────────────────────────────────── */
const VIEW_MODES = [
  { key: 'pipeline', label: 'Pipeline',    icon: FiTerminal },
  { key: 'dialogue', label: 'Dialogue',    icon: FiMessageSquare },
  { key: 'movie',    label: 'Movie Scene', icon: FiFilm },
  { key: 'agents',   label: 'Agents',      icon: FiUsers },
];

/* ── pipeline phases (order matters) ────────────────────────────────── */
const PHASES = [
  { key: 'director_select',   label: 'Director Select',   icon: FiActivity,    color: '#7C4DFF' },
  { key: 'character_reason',  label: 'Character Reason',  icon: FiUser,        color: '#D500F9' },
  { key: 'process_action',    label: 'Process Action',    icon: FiZap,         color: '#FF6D00' },
  { key: 'memory_update',     label: 'Memory Update',     icon: FiDatabase,    color: '#82B1FF' },
  { key: 'check_conclusion',  label: 'Check Conclusion',  icon: FiCheckCircle, color: '#69F0AE' },
  { key: 'conclude_story',    label: 'Conclude Story',    icon: FiAlertCircle, color: '#FF80AB' },
];

const CHAR_COLORS = [
  '#7C4DFF', '#D500F9', '#FF6D00', '#00BCD4', '#69F0AE', '#FF80AB',
];

/* default seed */
const DEFAULT_SEED = {
  title: 'The Rickshaw Accident',
  description: 'Late afternoon on Shahrah-e-Faisal near Karachi Airport. Rush hour traffic. Hot and humid. A rickshaw and a car have collided, both drivers blaming each other. Horns honking, crowd gathering. Traffic police known to ask for bribe. Everyone wants this over fast but for different reasons.',
  characters: [
    { name: 'Saleem', description: 'Poor rickshaw driver, sole earner for family of 5. Speaks Urdu-English mix, uses \'bhai\' and \'yaar\'. Panicked and defensive after minor accident with expensive car.' },
    { name: 'Ahmed Malik', description: 'Wealthy car owner and businessman, late for an international flight. Impatient, entitled. Speaks formally but stressed about missing his flight and the damage to his expensive sedan.' },
    { name: 'Constable Raza', description: '15-year traffic police veteran, underpaid and cynical. Just wants to clear traffic and maybe get a \'facilitation fee\'. Sees this as everyday nuisance.' },
    { name: 'Uncle Jameel', description: 'Local shopkeeper who witnessed everything. Nosy, loves drama, gives unsolicited advice in thick Urdu accent. Claims to know \'someone in police\'.' },
  ],
};

/* ── helper: character color ────────────────────────────────────────── */
function charColor(name, chars) {
  const idx = chars.findIndex(c => c.name === name);
  return CHAR_COLORS[idx % CHAR_COLORS.length];
}

/* ═══════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════ */
export default function LivePage() {
  const { isDark } = useTheme();

  /* ── form state ──────────────────────────────────────────────────── */
  const [title, setTitle] = useState(DEFAULT_SEED.title);
  const [description, setDescription] = useState(DEFAULT_SEED.description);
  const [characters, setCharacters] = useState(DEFAULT_SEED.characters);
  const [maxTurns, setMaxTurns] = useState(25);
  const [seedOpen, setSeedOpen] = useState(true);

  /* ── generation state ────────────────────────────────────────────── */
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [currentPhase, setCurrentPhase] = useState(null);
  const [currentTurn, setCurrentTurn] = useState(0);
  const [timeline, setTimeline] = useState([]);       // array of turn blocks
  const [, setWorldState] = useState(null);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('pipeline');

  const timelineEndRef = useRef(null);
  const abortRef = useRef(null);

  /* auto-scroll */
  useEffect(() => {
    timelineEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [timeline]);

  /* ── add event to timeline ───────────────────────────────────────── */
  const pushEvent = useCallback((evt) => {
    setTimeline(prev => [...prev, evt]);
  }, []);

  /* ── character helpers ───────────────────────────────────────────── */
  const addCharacter = () => {
    if (characters.length >= 6) return;
    setCharacters(prev => [...prev, { name: '', description: '' }]);
  };
  const removeCharacter = (i) => {
    setCharacters(prev => prev.filter((_, idx) => idx !== i));
  };
  const updateCharacter = (i, field, value) => {
    setCharacters(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: value } : c));
  };

  /* ── START GENERATION ────────────────────────────────────────────── */
  const startGeneration = async () => {
    if (running) return;
    if (!title.trim() || !description.trim()) return;
    const validChars = characters.filter(c => c.name.trim() && c.description.trim());
    if (validChars.length < 2) return;

    setRunning(true);
    setFinished(false);
    setTimeline([]);
    setCurrentPhase(null);
    setCurrentTurn(0);
    setWorldState(null);
    setError(null);
    setSeedOpen(false);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          characters: validChars,
          max_turns: maxTurns,
          min_turns: Math.min(10, maxTurns),
          min_actions: 5,
        }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`Server error ${res.status}`);

      const reader = res.body.getReader();
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
              handleSSE(eventType, data);
            } catch { /* skip malformed */ }
            eventType = null;
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message);
      }
    } finally {
      setRunning(false);
      setFinished(true);
    }
  };

  /* ── SSE handler ─────────────────────────────────────────────────── */
  const handleSSE = (type, data) => {
    switch (type) {
      case 'step':
        setCurrentPhase(data.phase);
        setCurrentTurn(data.turn);
        pushEvent({ type: 'phase', phase: data.phase, turn: data.turn });
        break;

      case 'director_result':
        pushEvent({ type: 'director', ...data });
        break;

      case 'reasoning_result':
        pushEvent({ type: 'reasoning', ...data });
        break;

      case 'action_result':
        pushEvent({ ...data, type: 'event', contentType: data.type });
        break;

      case 'memory_result':
        pushEvent({ type: 'memory', ...data });
        break;

      case 'conclusion_check':
        pushEvent({ type: 'conclusion_check', ...data });
        break;

      case 'concluded':
        pushEvent({ type: 'concluded', ...data });
        setFinished(true);
        break;

      case 'done':
        setFinished(true);
        break;

      default:
        break;
    }
  };

  /* ── stop ─────────────────────────────────────────────────────────── */
  const stopGeneration = () => {
    abortRef.current?.abort();
    setRunning(false);
  };

  /* ═══════════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════════ */
  return (
    <div className={`min-h-screen pt-20 pb-12 ${isDark ? 'bg-dark-bg' : 'bg-light-bg'}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* ── Header ───────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h1 className={`text-4xl sm:text-5xl font-bold mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Live <span className="text-gradient">Playground</span>
          </h1>
          <p className={`text-lg max-w-2xl mx-auto ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            Enter a seed story and watch the multi-agent system generate a narrative in real time
          </p>
        </motion.div>

        {/* ── Layout: sidebar + main ───────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">

          {/* ════ LEFT: Seed Input Panel ════════════════════════════ */}
          <div className="space-y-4">
            {/* Collapsible seed form */}
            <motion.div
              className={`rounded-2xl overflow-hidden ${isDark ? 'card-dark' : 'card-light'}`}
              layout
            >
              <button
                onClick={() => setSeedOpen(o => !o)}
                className={`w-full flex items-center justify-between p-4 text-left ${isDark ? 'text-white' : 'text-gray-900'}`}
              >
                <span className="font-bold text-lg">Seed Story</span>
                {seedOpen ? <FiChevronUp /> : <FiChevronDown />}
              </button>

              <AnimatePresence initial={false}>
                {seedOpen && (
                  <motion.div
                    initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4 space-y-3">
                      {/* Title */}
                      <div>
                        <label className={`text-xs font-semibold mb-1 block ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Title</label>
                        <input
                          value={title}
                          onChange={e => setTitle(e.target.value)}
                          disabled={running}
                          className={`w-full px-3 py-2 rounded-xl text-sm outline-none transition ${
                            isDark
                              ? 'bg-dark-bg border border-white/10 text-white focus:border-primary/50'
                              : 'bg-light-bg border border-gray-200 text-gray-900 focus:border-primary/50'
                          }`}
                          placeholder="Story title…"
                        />
                      </div>

                      {/* Description */}
                      <div>
                        <label className={`text-xs font-semibold mb-1 block ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Scenario</label>
                        <textarea
                          value={description}
                          onChange={e => setDescription(e.target.value)}
                          disabled={running}
                          rows={4}
                          className={`w-full px-3 py-2 rounded-xl text-sm outline-none resize-none transition ${
                            isDark
                              ? 'bg-dark-bg border border-white/10 text-white focus:border-primary/50'
                              : 'bg-light-bg border border-gray-200 text-gray-900 focus:border-primary/50'
                          }`}
                          placeholder="Describe the scene…"
                        />
                      </div>

                      {/* Characters */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className={`text-xs font-semibold ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Characters</label>
                          <button
                            onClick={addCharacter}
                            disabled={running || characters.length >= 6}
                            className="text-xs text-primary hover:text-accent transition disabled:opacity-30"
                          >
                            + Add
                          </button>
                        </div>
                        <div className="space-y-2">
                          {characters.map((c, i) => (
                            <div key={i} className={`p-3 rounded-xl ${isDark ? 'bg-dark-bg/80 border border-white/5' : 'bg-light-bg border border-gray-100'}`}>
                              <div className="flex items-center gap-2 mb-1.5">
                                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: CHAR_COLORS[i % CHAR_COLORS.length] }} />
                                <input
                                  value={c.name}
                                  onChange={e => updateCharacter(i, 'name', e.target.value)}
                                  disabled={running}
                                  className={`flex-1 text-sm font-semibold bg-transparent outline-none ${isDark ? 'text-white placeholder-gray-600' : 'text-gray-900 placeholder-gray-400'}`}
                                  placeholder="Name"
                                />
                                {characters.length > 2 && (
                                  <button onClick={() => removeCharacter(i)} disabled={running} className="text-red-400 hover:text-red-300 text-xs">✕</button>
                                )}
                              </div>
                              <textarea
                                value={c.description}
                                onChange={e => updateCharacter(i, 'description', e.target.value)}
                                disabled={running}
                                rows={2}
                                className={`w-full text-xs bg-transparent outline-none resize-none ${isDark ? 'text-gray-400 placeholder-gray-600' : 'text-gray-600 placeholder-gray-400'}`}
                                placeholder="Character description…"
                              />
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Max turns */}
                      <div className="flex items-center gap-3">
                        <label className={`text-xs font-semibold ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Max Turns</label>
                        <input
                          type="number" min={5} max={50} value={maxTurns}
                          onChange={e => setMaxTurns(Number(e.target.value))}
                          disabled={running}
                          className={`w-20 px-2 py-1 rounded-lg text-sm text-center outline-none ${
                            isDark
                              ? 'bg-dark-bg border border-white/10 text-white'
                              : 'bg-light-bg border border-gray-200 text-gray-900'
                          }`}
                        />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Generate / Stop button */}
            <motion.button
              onClick={running ? stopGeneration : startGeneration}
              disabled={!running && (!title.trim() || !description.trim() || characters.filter(c => c.name.trim()).length < 2)}
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              className={`w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
                running
                  ? 'bg-red-500/90 hover:bg-red-500 text-white'
                  : 'bg-linear-to-r from-primary to-accent text-white hover:shadow-lg hover:shadow-primary/25 disabled:opacity-40 disabled:cursor-not-allowed'
              }`}
            >
              {running ? (
                <><FiLoader className="animate-spin" /> Stop Generation</>
              ) : (
                <><FiPlay /> Generate Story</>
              )}
            </motion.button>

            {/* Pipeline status */}
            {(running || finished) && (
              <motion.div
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className={`rounded-2xl p-4 ${isDark ? 'card-dark' : 'card-light'}`}
              >
                <h3 className={`text-xs font-bold mb-3 uppercase tracking-wider ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Pipeline</h3>
                <div className="space-y-1.5">
                  {PHASES.map(ph => {
                    const isActive = currentPhase === ph.key && running;
                    const Icon = ph.icon;
                    return (
                      <div
                        key={ph.key}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                          isActive
                            ? isDark ? 'bg-white/5 text-white' : 'bg-primary/5 text-gray-900'
                            : isDark ? 'text-gray-600' : 'text-gray-400'
                        }`}
                      >
                        <div className="relative">
                          <Icon size={14} style={{ color: isActive ? ph.color : undefined }} />
                          {isActive && (
                            <motion.div
                              className="absolute -inset-1 rounded-full"
                              style={{ border: `2px solid ${ph.color}` }}
                              animate={{ scale: [1, 1.4, 1], opacity: [1, 0, 1] }}
                              transition={{ repeat: Infinity, duration: 1.5 }}
                            />
                          )}
                        </div>
                        <span>{ph.label}</span>
                        {isActive && <FiLoader className="ml-auto animate-spin" size={12} style={{ color: ph.color }} />}
                      </div>
                    );
                  })}
                </div>

                {/* Turn counter */}
                <div className={`mt-4 pt-3 border-t flex items-center justify-between ${isDark ? 'border-white/5' : 'border-gray-100'}`}>
                  <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Turn</span>
                  <span className={`font-mono text-sm font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {currentTurn} / {maxTurns}
                  </span>
                </div>
              </motion.div>
            )}
          </div>

          {/* ════ RIGHT: Timeline / Narrative ══════════════════════ */}
          <div className={`rounded-2xl overflow-hidden flex flex-col ${isDark ? 'card-dark' : 'card-light'}`} style={{ minHeight: '60vh' }}>
            {/* header with view mode tabs */}
            <div className={`px-5 py-3 border-b flex items-center gap-3 ${isDark ? 'border-white/5' : 'border-gray-100'}`}>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                <div className="w-3 h-3 rounded-full bg-green-500/80" />
              </div>

              {/* View mode tabs */}
              <div className={`flex items-center rounded-xl p-0.5 ml-2 ${isDark ? 'bg-white/5' : 'bg-gray-100'}`}>
                {VIEW_MODES.map(vm => {
                  const VMIcon = vm.icon;
                  const active = viewMode === vm.key;
                  return (
                    <button
                      key={vm.key}
                      onClick={() => setViewMode(vm.key)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                        active
                          ? isDark
                            ? 'bg-primary/20 text-primary shadow-sm'
                            : 'bg-white text-primary shadow-sm'
                          : isDark
                            ? 'text-gray-500 hover:text-gray-300'
                            : 'text-gray-400 hover:text-gray-600'
                      }`}
                    >
                      <VMIcon size={12} />
                      {vm.label}
                    </button>
                  );
                })}
              </div>

              {running && (
                <div className="ml-auto flex items-center gap-1.5 text-xs text-neon-green">
                  <div className="w-2 h-2 rounded-full bg-neon-green animate-pulse" />
                  Generating…
                </div>
              )}
              {finished && !running && (
                <div className="ml-auto flex items-center gap-1.5 text-xs text-primary">
                  <FiCheckCircle size={12} />
                  Complete
                </div>
              )}
            </div>

            {/* view body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3" style={{ maxHeight: '75vh' }}>
              {timeline.length === 0 && !running && (
                <div className={`flex flex-col items-center justify-center h-full py-20 ${isDark ? 'text-gray-600' : 'text-gray-300'}`}>
                  <FiMessageSquare size={48} className="mb-4 opacity-40" />
                  <p className="text-sm">Enter a seed story and click Generate to begin</p>
                </div>
              )}

              {/* Pipeline View */}
              {viewMode === 'pipeline' && timeline.length > 0 && (
                <AnimatePresence initial={false}>
                  {timeline.map((evt, idx) => (
                    <TimelineItem key={idx} evt={evt} isDark={isDark} chars={characters} />
                  ))}
                </AnimatePresence>
              )}

              {/* Dialogue View */}
              {viewMode === 'dialogue' && timeline.length > 0 && (
                <DialogueView timeline={timeline} isDark={isDark} chars={characters} />
              )}

              {/* Movie Scene View */}
              {viewMode === 'movie' && timeline.length > 0 && (
                <MovieSceneView timeline={timeline} isDark={isDark} chars={characters} title={title} />
              )}

              {/* Agents View */}
              {viewMode === 'agents' && timeline.length > 0 && (
                <AgentsView timeline={timeline} isDark={isDark} chars={characters} />
              )}

              <div ref={timelineEndRef} />
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="mt-4 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center"
          >
            {error}
          </motion.div>
        )}
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════════
   TIMELINE ITEM
   ═══════════════════════════════════════════════════════════════════════ */
function TimelineItem({ evt, isDark, chars }) {
  if (evt.type === 'phase') return <PhaseTag phase={evt.phase} turn={evt.turn} isDark={isDark} />;
  if (evt.type === 'director') return <DirectorCard evt={evt} isDark={isDark} />;
  if (evt.type === 'reasoning') return <ReasoningCard evt={evt} isDark={isDark} chars={chars} />;
  if (evt.type === 'event') return <EventCard evt={evt} isDark={isDark} chars={chars} />;
  if (evt.type === 'memory') return <MemoryCard evt={evt} isDark={isDark} />;
  if (evt.type === 'conclusion_check') return <ConclusionCheckCard evt={evt} isDark={isDark} />;
  if (evt.type === 'concluded') return <ConcludedCard evt={evt} isDark={isDark} />;
  return null;
}

/* ── Phase tag ──────────────────────────────────────────────────────── */
function PhaseTag({ phase, turn, isDark }) {
  const ph = PHASES.find(p => p.key === phase);
  if (!ph) return null;
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
      className="flex items-center gap-2 py-1"
    >
      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ph.color }} />
      <span className={`text-[11px] font-mono font-semibold uppercase tracking-wider`} style={{ color: ph.color }}>
        {ph.label}
      </span>
      <span className={`text-[10px] font-mono ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>T{turn}</span>
    </motion.div>
  );
}

/* ── Director card ──────────────────────────────────────────────────── */
function DirectorCard({ evt, isDark }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl p-4 border-l-[3px] ${isDark ? 'bg-white/2' : 'bg-primary/2'}`}
      style={{ borderLeftColor: '#7C4DFF' }}
    >
      <div className="flex items-center gap-2 mb-2">
        <FiActivity size={14} className="text-primary" />
        <span className={`text-xs font-bold ${isDark ? 'text-primary' : 'text-primary'}`}>Director Agent</span>
        <span className={`ml-auto text-[10px] font-mono ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>Turn {evt.turn}</span>
      </div>
      {evt.narration && (
        <p className={`text-sm italic mb-2 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
          "{evt.narration}"
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${isDark ? 'bg-primary/15 text-primary' : 'bg-primary/10 text-primary'}`}>
          → {evt.nextSpeaker}
        </span>
        {evt.forceAct && (
          <span className="text-[11px] px-2 py-0.5 rounded-md bg-orange-500/15 text-orange-400 font-medium">
            Force ACT
          </span>
        )}
        {evt.endgame && (
          <span className="text-[11px] px-2 py-0.5 rounded-md bg-red-500/15 text-red-400 font-medium">
            Endgame
          </span>
        )}
        <span className={`text-[11px] px-2 py-0.5 rounded-md ${isDark ? 'bg-white/5 text-gray-500' : 'bg-gray-100 text-gray-500'}`}>
          {evt.distinctActions} actions
        </span>
      </div>
    </motion.div>
  );
}

/* ── Reasoning card ─────────────────────────────────────────────────── */
function ReasoningCard({ evt, isDark, chars }) {
  const color = charColor(evt.speaker, chars);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl p-4 border-l-[3px] ${isDark ? 'bg-white/2' : 'bg-purple-50/50'}`}
      style={{ borderLeftColor: color }}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: color }}>
          {evt.speaker?.[0]}
        </div>
        <span className={`text-xs font-bold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>{evt.speaker}</span>
        <span className={`text-[11px] font-mono px-2 py-0.5 rounded-md ${
          evt.mode === 'ACT'
            ? 'bg-orange-500/15 text-orange-400'
            : isDark ? 'bg-white/5 text-gray-400' : 'bg-gray-100 text-gray-500'
        }`}>
          {evt.mode}
        </span>
        {evt.emotion && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${isDark ? 'bg-white/5 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
            {evt.emotion}
          </span>
        )}
      </div>
      {evt.observation && (
        <p className={`text-[11px] mb-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
          <span className="font-semibold">Observes:</span> {evt.observation}
        </p>
      )}
      {evt.reasoning && (
        <p className={`text-[11px] mb-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
          <span className="font-semibold">Thinks:</span> {evt.reasoning}
        </p>
      )}
      {evt.mode === 'ACT' && evt.action && (
        <div className="flex items-center gap-1.5 text-xs mt-1">
          <FiZap size={12} className="text-orange-400" />
          <span className={isDark ? 'text-orange-300' : 'text-orange-600'}>{evt.action.type}</span>
        </div>
      )}
      {evt.speechPreview && (
        <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
          {evt.speechPreview}…
        </p>
      )}
    </motion.div>
  );
}

/* ── Event card (dialogue or action) ────────────────────────────────── */
function EventCard({ evt, isDark, chars }) {
  const isAction = evt.contentType === 'action' || evt.actionType;
  const color = charColor(evt.speaker, chars);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className={`rounded-2xl p-5 ${isDark ? 'bg-dark-card-hover/40 border border-white/4' : 'bg-white border border-gray-100 shadow-sm'}`}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 mt-0.5"
          style={{ backgroundColor: color }}
        >
          {evt.speaker?.[0]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            {/* Content type badge */}
            <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
              isAction
                ? isDark ? 'bg-orange-500/15 text-orange-400' : 'bg-orange-100 text-orange-600'
                : isDark ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-50 text-blue-600'
            }`}>
              {isAction ? 'Action' : 'Dialogue'}
            </span>
            <span className={`font-semibold text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>{evt.speaker}</span>
            <span className={`text-[10px] font-mono ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>Turn {evt.turn}</span>
            {isAction && (
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-orange-500/15 text-orange-400 font-medium flex items-center gap-1">
                <FiZap size={10} /> {evt.actionType}
              </span>
            )}
            {evt.emotion && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${isDark ? 'bg-white/5 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
                {evt.emotion}
              </span>
            )}
          </div>
          <p className={`text-sm leading-relaxed ${
            isAction
              ? isDark ? 'text-orange-200/80 italic' : 'text-orange-700 italic'
              : isDark ? 'text-gray-300' : 'text-gray-700'
          }`}>
            {evt.content}
          </p>
          {/* Reasoning trace */}
          {(evt.observation || evt.reasoning) && (
            <div className={`mt-2 pt-2 border-t text-[11px] space-y-0.5 ${
              isDark ? 'border-white/5 text-gray-600' : 'border-gray-100 text-gray-400'
            }`}>
              {evt.observation && <p><span className="font-semibold">Observes:</span> {evt.observation}</p>}
              {evt.reasoning && <p><span className="font-semibold">Thinks:</span> {evt.reasoning}</p>}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ── Memory card ────────────────────────────────────────────────────── */
function MemoryCard({ evt, isDark }) {
  if (!evt.recentMemories?.length) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl p-3 border-l-[3px] ${isDark ? 'bg-blue-500/3' : 'bg-blue-50/50'}`}
      style={{ borderLeftColor: '#82B1FF' }}
    >
      <div className="flex items-center gap-2 mb-2">
        <FiDatabase size={12} className="text-neon-blue" />
        <span className={`text-[11px] font-semibold ${isDark ? 'text-neon-blue' : 'text-blue-600'}`}>Memory Buffer</span>
        <span className={`text-[10px] ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>— {evt.speaker}</span>
      </div>
      <div className="space-y-1">
        {evt.recentMemories.map((m, i) => (
          <p key={i} className={`text-[11px] font-mono ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            {m}
          </p>
        ))}
      </div>
    </motion.div>
  );
}

/* ── Conclusion check card ──────────────────────────────────────────── */
function ConclusionCheckCard({ evt, isDark }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl p-3 border-l-[3px] ${isDark ? 'bg-green-500/3' : 'bg-green-50/50'}`}
      style={{ borderLeftColor: '#69F0AE' }}
    >
      <div className="flex items-center gap-2">
        <FiCheckCircle size={12} className="text-neon-green" />
        <span className={`text-[11px] font-semibold ${isDark ? 'text-neon-green' : 'text-green-600'}`}>Conclusion Check</span>
        <span className={`ml-auto text-[11px] font-mono px-2 py-0.5 rounded-md ${
          evt.shouldEnd
            ? 'bg-red-500/15 text-red-400'
            : isDark ? 'bg-white/5 text-gray-500' : 'bg-gray-100 text-gray-500'
        }`}>
          {evt.shouldEnd ? 'END' : 'CONTINUE'}
        </span>
      </div>
      {evt.reason && (
        <p className={`text-[11px] mt-1.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
          {evt.reason}
        </p>
      )}
    </motion.div>
  );
}

/* ── Concluded card ─────────────────────────────────────────────────── */
function ConcludedCard({ evt, isDark }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
      className={`rounded-2xl p-6 text-center border ${
        isDark
          ? 'bg-linear-to-b from-primary/10 to-transparent border-primary/20'
          : 'bg-linear-to-b from-primary/5 to-transparent border-primary/15'
      }`}
    >
      <div className="text-3xl mb-3">📖</div>
      <h3 className={`font-bold text-lg mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
        Story Concluded
      </h3>
      <p className={`text-sm mb-3 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
        {evt.reason}
      </p>
      <div className="flex justify-center gap-4">
        <div className={`text-center ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          <div className="text-2xl font-bold text-primary">{evt.turn}</div>
          <div className="text-[10px]">Turns</div>
        </div>
        <div className={`text-center ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          <div className="text-2xl font-bold text-accent">{evt.totalActions}</div>
          <div className="text-[10px]">Actions</div>
        </div>
      </div>
      {evt.actionsTaken?.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1.5 mt-3">
          {evt.actionsTaken.map(a => (
            <span key={a} className={`text-[10px] px-2 py-0.5 rounded-md ${isDark ? 'bg-white/5 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
              {a}
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
}


/* ═══════════════════════════════════════════════════════════════════════
   DIALOGUE VIEW – chat-like interface showing character conversations
   ═══════════════════════════════════════════════════════════════════════ */
function DialogueView({ timeline, isDark, chars }) {
  const charNames = chars.map(c => c.name);

  /* Filter to dialogue-relevant events: director narration, event (dialogue/action), concluded */
  const dialogueEvents = timeline.filter(evt =>
    evt.type === 'event' || evt.type === 'director' || evt.type === 'concluded'
  );

  if (dialogueEvents.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center py-16 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
        <FiMessageSquare size={32} className="mb-3 opacity-40" />
        <p className="text-sm">Waiting for dialogue…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AnimatePresence initial={false}>
        {dialogueEvents.map((evt, idx) => {
          if (evt.type === 'director' && evt.narration) {
            return (
              <motion.div
                key={`narr-${idx}`}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                className="text-center my-4"
              >
                <span className={`inline-block text-xs italic px-4 py-1.5 rounded-full ${
                  isDark ? 'bg-white/5 text-gray-400' : 'bg-gray-100 text-gray-500'
                }`}>
                  {evt.narration}
                </span>
              </motion.div>
            );
          }

          if (evt.type === 'concluded') {
            return (
              <motion.div
                key={`end-${idx}`}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="text-center my-6"
              >
                <div className={`inline-block px-6 py-3 rounded-2xl ${
                  isDark ? 'bg-primary/10 border border-primary/20' : 'bg-primary/5 border border-primary/15'
                }`}>
                  <div className="text-lg mb-1">🎬</div>
                  <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Story Complete</p>
                  <p className={`text-xs mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{evt.reason}</p>
                </div>
              </motion.div>
            );
          }

          /* Dialogue / action bubble */
          const isAction = evt.actionType;
          const speakerIdx = charNames.indexOf(evt.speaker);
          const isRight = speakerIdx % 2 === 1;
          const color = charColor(evt.speaker, chars);

          return (
            <motion.div
              key={`msg-${idx}`}
              initial={{ opacity: 0, x: isRight ? 20 : -20, y: 8 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 24 }}
              className={`flex items-end gap-2.5 ${isRight ? 'flex-row-reverse' : ''}`}
            >
              {/* Avatar */}
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 shadow-lg"
                style={{ backgroundColor: color }}
              >
                {evt.speaker?.[0]}
              </div>

              {/* Bubble */}
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-3 relative ${
                  isAction
                    ? isDark
                      ? 'bg-orange-500/10 border border-orange-500/20'
                      : 'bg-orange-50 border border-orange-200'
                    : isRight
                      ? isDark
                        ? 'bg-primary/15 border border-primary/20'
                        : 'bg-primary/10 border border-primary/15'
                      : isDark
                        ? 'bg-white/6 border border-white/8'
                        : 'bg-white border border-gray-200 shadow-sm'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold" style={{ color }}>{evt.speaker}</span>
                  <span className={`text-[10px] font-mono ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>T{evt.turn}</span>
                  {isAction && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 font-medium flex items-center gap-0.5">
                      <FiZap size={8} /> {evt.actionType}
                    </span>
                  )}
                  {evt.emotion && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${isDark ? 'bg-white/5 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
                      {evt.emotion}
                    </span>
                  )}
                </div>
                <p className={`text-sm leading-relaxed ${
                  isAction
                    ? isDark ? 'text-orange-200/80 italic' : 'text-orange-700 italic'
                    : isDark ? 'text-gray-200' : 'text-gray-700'
                }`}>
                  {evt.content}
                </p>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════════
   MOVIE SCENE VIEW – cinematic narrative with real conversations,
   actions, consequences, emotions, and metadata
   ═══════════════════════════════════════════════════════════════════════ */

/* Emotion → emoji map */
const EMOTION_MAP = {
  angry: '😠', scared: '😨', hopeful: '🙂', frustrated: '😤',
  calm: '😌', anxious: '😰', relieved: '😮‍💨', nervous: '😬',
  sad: '😢', confused: '😕', determined: '💪', panicked: '😱',
  neutral: '😐', impatient: '⏳', smug: '😏', defiant: '😤',
  annoyed: '😒', desperate: '😣', suspicious: '🤨', pleased: '😊',
};

function MovieSceneView({ timeline, isDark, chars, title }) {
  /* Gather all scene-relevant events */
  const sceneEvents = timeline.filter(evt =>
    evt.type === 'event' || evt.type === 'director' || evt.type === 'concluded'
  );

  if (sceneEvents.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center py-16 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
        <FiFilm size={32} className="mb-3 opacity-40" />
        <p className="text-sm">Waiting for the scene to unfold…</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className={`rounded-2xl overflow-hidden ${isDark ? 'bg-[#08080d]' : 'bg-[#fafaf6]'}`}
    >
      {/* ── Cinematic Title Card ──────────────────────────────────── */}
      <div className={`text-center py-8 px-6 border-b ${isDark ? 'border-white/5' : 'border-gray-200'}`}>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <p className={`text-[10px] font-mono uppercase tracking-[0.3em] mb-3 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
            A NarrativeVerse Production
          </p>
          <h2 className={`text-2xl sm:text-3xl font-bold tracking-wide ${isDark ? 'text-white' : 'text-gray-900'}`}
            style={{ fontFamily: "'Georgia', serif" }}
          >
            {title || 'Untitled'}
          </h2>
          <div className="w-16 h-0.5 bg-linear-to-r from-primary to-accent mx-auto mt-4" />
          {/* Cast list */}
          <div className="flex flex-wrap justify-center gap-3 mt-4">
            {chars.map((c, i) => (
              <span key={c.name} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHAR_COLORS[i % CHAR_COLORS.length] }} />
                <span className={`text-[11px] ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{c.name}</span>
              </span>
            ))}
          </div>
        </motion.div>
      </div>

      {/* ── Scene Body ───────────────────────────────────────────── */}
      <div className="px-4 sm:px-8 py-6 space-y-1">
        <AnimatePresence initial={false}>
          {sceneEvents.map((evt, idx) => {

            /* ── NARRATION: Director scene description ────────────── */
            if (evt.type === 'director' && evt.narration) {
              return (
                <motion.div
                  key={`n-${idx}`}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="py-4"
                >
                  {/* Turn divider */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`flex-1 h-px ${isDark ? 'bg-white/5' : 'bg-gray-200'}`} />
                    <span className={`text-[10px] font-mono uppercase tracking-wider ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                      Turn {evt.turn}
                    </span>
                    <div className={`flex-1 h-px ${isDark ? 'bg-white/5' : 'bg-gray-200'}`} />
                  </div>

                  {/* Narration block */}
                  <div className={`flex items-start gap-3 pl-2`}>
                    <div className={`shrink-0 mt-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                      isDark ? 'bg-purple-500/10 text-purple-400' : 'bg-purple-50 text-purple-600'
                    }`}>
                      Narration
                    </div>
                    <p className={`text-sm italic leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-500'}`}
                      style={{ fontFamily: "'Georgia', serif" }}
                    >
                      {evt.narration}
                    </p>
                  </div>

                  {/* World state badges */}
                  {evt.worldState && (
                    <div className="flex flex-wrap gap-1.5 mt-2 ml-2">
                      <WorldBadge label="Tension" value={`${evt.worldState.tension}/10`} isDark={isDark} />
                      <WorldBadge label="Police" value={evt.worldState.police ? 'Yes' : 'No'} isDark={isDark} />
                      <WorldBadge label="Lane" value={evt.worldState.laneBlocked ? 'Blocked' : 'Clear'} isDark={isDark} />
                      <WorldBadge label="Crowd" value={evt.worldState.crowd} isDark={isDark} />
                    </div>
                  )}
                </motion.div>
              );
            }

            /* ── CONCLUDED: The End ──────────────────────────────── */
            if (evt.type === 'concluded') {
              return (
                <motion.div
                  key={`fin-${idx}`}
                  initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-10"
                >
                  <div className={`w-20 h-px mx-auto mb-6 ${isDark ? 'bg-gray-700' : 'bg-gray-300'}`} />
                  <p className={`text-2xl font-bold tracking-[0.2em] uppercase ${isDark ? 'text-white' : 'text-gray-900'}`}
                    style={{ fontFamily: "'Georgia', serif" }}
                  >
                    The End
                  </p>
                  <p className={`text-xs mt-3 italic max-w-md mx-auto ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                    {evt.reason}
                  </p>
                  <div className="flex justify-center gap-6 mt-4">
                    <div className="text-center">
                      <div className="text-lg font-bold text-primary">{evt.turn}</div>
                      <div className={`text-[10px] ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>Turns</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-accent">{evt.totalActions}</div>
                      <div className={`text-[10px] ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>Actions</div>
                    </div>
                  </div>
                  {evt.actionsTaken?.length > 0 && (
                    <div className="flex flex-wrap justify-center gap-1.5 mt-3">
                      {evt.actionsTaken.map(a => (
                        <span key={a} className={`text-[10px] px-2 py-0.5 rounded ${isDark ? 'bg-white/5 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>{a}</span>
                      ))}
                    </div>
                  )}
                  <div className={`w-20 h-px mx-auto mt-6 ${isDark ? 'bg-gray-700' : 'bg-gray-300'}`} />
                </motion.div>
              );
            }

            /* ── DIALOGUE or ACTION event ────────────────────────── */
            const isAction = !!evt.actionType;
            const color = charColor(evt.speaker, chars);
            const emotionEmoji = EMOTION_MAP[(evt.emotion || '').toLowerCase()] || '';

            return (
              <motion.div
                key={`evt-${idx}`}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                className={`rounded-xl p-4 my-2 ${
                  isAction
                    ? isDark ? 'bg-orange-500/4 border border-orange-500/10' : 'bg-orange-50/60 border border-orange-100'
                    : isDark ? 'bg-white/2 border border-white/4' : 'bg-white border border-gray-100'
                }`}
              >
                {/* Header row: type badge | speaker | emotion | turn */}
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  {/* Event type badge */}
                  <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                    isAction
                      ? isDark ? 'bg-orange-500/15 text-orange-400' : 'bg-orange-100 text-orange-600'
                      : isDark ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-50 text-blue-600'
                  }`}>
                    {isAction ? 'Action' : 'Dialogue'}
                  </span>

                  {/* Speaker with avatar dot */}
                  <div className="flex items-center gap-1.5">
                    <div className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white"
                      style={{ backgroundColor: color }}
                    >
                      {evt.speaker?.[0]}
                    </div>
                    <span className="text-xs font-bold" style={{ color }}>{evt.speaker}</span>
                  </div>

                  {/* Emotion */}
                  {evt.emotion && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 ${
                      isDark ? 'bg-white/5 text-gray-400' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {emotionEmoji && <span>{emotionEmoji}</span>}
                      {evt.emotion}
                    </span>
                  )}

                  {/* Action type */}
                  {isAction && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-400 flex items-center gap-0.5 font-mono">
                      <FiZap size={9} /> {evt.actionType}
                    </span>
                  )}

                  {/* Turn */}
                  <span className={`ml-auto text-[10px] font-mono ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                    T{evt.turn}
                  </span>
                </div>

                {/* Content */}
                <div className="ml-1">
                  {isAction ? (
                    <p className={`text-sm italic leading-relaxed ${isDark ? 'text-orange-200/70' : 'text-orange-700'}`}
                      style={{ fontFamily: "'Georgia', serif" }}
                    >
                      {evt.content}
                    </p>
                  ) : (
                    <p className={`text-sm leading-relaxed ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                      <span className={isDark ? 'text-gray-500' : 'text-gray-400'}>"</span>
                      {evt.content}
                      <span className={isDark ? 'text-gray-500' : 'text-gray-400'}>"</span>
                    </p>
                  )}
                </div>

                {/* Inner thought / reasoning (collapsed subtle) */}
                {(evt.observation || evt.reasoning) && (
                  <div className={`mt-2 pt-2 border-t text-[11px] space-y-0.5 ${
                    isDark ? 'border-white/5 text-gray-600' : 'border-gray-100 text-gray-400'
                  }`}>
                    {evt.observation && (
                      <p><span className="font-semibold">Observes:</span> {evt.observation}</p>
                    )}
                    {evt.reasoning && (
                      <p><span className="font-semibold">Thinks:</span> {evt.reasoning}</p>
                    )}
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

/* ── Small world-state badge ────────────────────────────────────────── */
function WorldBadge({ label, value, isDark }) {
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
      isDark ? 'bg-white/5 text-gray-500' : 'bg-gray-100 text-gray-400'
    }`}>
      {label}: {String(value)}
    </span>
  );
}


/* ═════════════════════════════════════════════════════════════════════
   AGENTS VIEW – shows each agent's talk/actions clearly
   Each card shows: WHO did WHAT (said / performed) with full content
   ═════════════════════════════════════════════════════════════════════ */
function AgentsView({ timeline, isDark, chars }) {
  /* Collect only events that belong to specific agents */
  const agentEvents = timeline.filter(evt =>
    evt.type === 'event' || evt.type === 'reasoning'
  );

  if (agentEvents.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center py-16 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
        <FiUsers size={32} className="mb-3 opacity-40" />
        <p className="text-sm">Waiting for agents to act…</p>
      </div>
    );
  }

  /* Build per-agent summary stats */
  const agentStats = {};
  for (const c of chars) {
    agentStats[c.name] = { talks: 0, actions: 0, lastEmotion: null };
  }
  for (const evt of agentEvents) {
    const s = agentStats[evt.speaker];
    if (!s) continue;
    if (evt.type === 'event') {
      if (evt.actionType) s.actions++;
      else s.talks++;
    }
    if (evt.emotion) s.lastEmotion = evt.emotion;
  }

  return (
    <div className="space-y-3">
      {/* Agent summary bar */}
      <div className={`flex flex-wrap gap-2 pb-3 border-b ${isDark ? 'border-white/5' : 'border-gray-100'}`}>
        {chars.map((c, i) => {
          const stats = agentStats[c.name] || { talks: 0, actions: 0 };
          const color = CHAR_COLORS[i % CHAR_COLORS.length];
          const emoji = EMOTION_MAP[(stats.lastEmotion || '').toLowerCase()] || '';
          return (
            <div
              key={c.name}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl ${isDark ? 'bg-white/3' : 'bg-gray-50'}`}
            >
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shadow-sm"
                style={{ backgroundColor: color }}>{c.name[0]}</div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold" style={{ color }}>{c.name}</span>
                  {emoji && <span className="text-xs">{emoji}</span>}
                </div>
                <div className={`text-[10px] ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                  {stats.talks} dialogue · {stats.actions} actions
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Sequential event list showing WHO said/did WHAT */}
      <div className="space-y-2">
        <AnimatePresence initial={false}>
          {agentEvents.map((evt, idx) => {
            const color = charColor(evt.speaker, chars);
            const isAction = evt.type === 'event' && !!evt.actionType;
            const isDialogue = evt.type === 'event' && !evt.actionType;
            const isReasoning = evt.type === 'reasoning';
            const emotionEmoji = EMOTION_MAP[(evt.emotion || '').toLowerCase()] || '';

            /* Reasoning events: compact card */
            if (isReasoning) {
              return (
                <motion.div
                  key={`agent-${idx}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`rounded-lg px-4 py-2.5 border-l-[3px] ${
                    isDark ? 'bg-purple-500/5 border-purple-500/30' : 'bg-purple-50/50 border-purple-300'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                      style={{ backgroundColor: color }}>{evt.speaker?.[0]}</div>
                    <span className="text-xs font-bold" style={{ color }}>{evt.speaker}</span>
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                      isDark ? 'bg-purple-500/10 text-purple-400' : 'bg-purple-100 text-purple-600'
                    }`}>Thinking</span>
                    <span className={`ml-auto text-[10px] font-mono ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>T{evt.turn}</span>
                  </div>
                  <div className="space-y-1 ml-7">
                    {evt.observation && (
                      <p className={`text-[11px] ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        <span className="font-semibold">Observes:</span> {evt.observation}
                      </p>
                    )}
                    {evt.reasoning && (
                      <p className={`text-[11px] ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        <span className="font-semibold">Thinks:</span> {evt.reasoning}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                        evt.mode === 'ACT' ? 'bg-orange-500/15 text-orange-400' : isDark ? 'bg-white/5 text-gray-400' : 'bg-gray-100 text-gray-500'
                      }`}>{evt.mode}</span>
                      {evt.mode === 'ACT' && evt.action?.type && (
                        <span className="text-[10px] text-orange-400">→ {evt.action.type}</span>
                      )}
                      {evt.emotion && (
                        <span className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                          {emotionEmoji} {evt.emotion}
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            }

            /* Dialogue & Action events: prominent card showing content */
            return (
              <motion.div
                key={`agent-${idx}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                className={`rounded-xl overflow-hidden ${
                  isAction
                    ? isDark ? 'bg-orange-500/5 border border-orange-500/15' : 'bg-orange-50/80 border border-orange-200'
                    : isDark ? 'bg-white/2 border border-white/5' : 'bg-white border border-gray-100 shadow-sm'
                }`}
              >
                {/* Agent header: Speaker said / performed */}
                <div className="px-4 py-2.5" style={{ borderBottom: `2px solid ${color}20` }}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-sm"
                      style={{ backgroundColor: color }}>{evt.speaker?.[0]}</div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold" style={{ color }}>{evt.speaker}</span>
                      <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                        {isDialogue ? 'said:' : 'performed:'}
                      </span>
                    </div>

                    {/* Badges */}
                    {isAction && (
                      <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                        isDark ? 'bg-orange-500/15 text-orange-400' : 'bg-orange-100 text-orange-600'
                      }`}>Action</span>
                    )}
                    {isAction && evt.actionType && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-400 font-mono flex items-center gap-0.5">
                        <FiZap size={9} /> {evt.actionType}
                      </span>
                    )}
                    {evt.emotion && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 ${
                        isDark ? 'bg-white/5 text-gray-400' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {emotionEmoji && <span>{emotionEmoji}</span>}
                        {evt.emotion}
                      </span>
                    )}
                    <span className={`ml-auto text-[10px] font-mono ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                      Turn {evt.turn}
                    </span>
                  </div>
                </div>

                {/* Content: the actual dialogue or action narration */}
                <div className="px-4 py-3 ml-9">
                  {isDialogue && (
                    <p className={`text-sm leading-relaxed ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                      <span className={`text-lg leading-none mr-0.5 ${isDark ? 'text-primary/60' : 'text-primary/40'}`}>&ldquo;</span>
                      {evt.content}
                      <span className={`text-lg leading-none ml-0.5 ${isDark ? 'text-primary/60' : 'text-primary/40'}`}>&rdquo;</span>
                    </p>
                  )}
                  {isAction && (
                    <p className={`text-sm italic leading-relaxed ${isDark ? 'text-orange-200/80' : 'text-orange-700'}`}>
                      {evt.content}
                    </p>
                  )}

                  {/* Reasoning trace below content */}
                  {(evt.observation || evt.reasoning) && (
                    <div className={`mt-2.5 pt-2 border-t text-[11px] space-y-0.5 ${
                      isDark ? 'border-white/5 text-gray-600' : 'border-gray-100 text-gray-400'
                    }`}>
                      {evt.observation && <p><span className="font-semibold">Observes:</span> {evt.observation}</p>}
                      {evt.reasoning && <p><span className="font-semibold">Thinks:</span> {evt.reasoning}</p>}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
