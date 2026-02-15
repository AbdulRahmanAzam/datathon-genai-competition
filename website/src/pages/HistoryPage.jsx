import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';
import {
  FiClock, FiChevronLeft, FiUsers, FiMessageSquare, FiFilm,
  FiZap, FiTrash2, FiLoader, FiAlertCircle, FiPlay,
  FiTerminal, FiActivity, FiDatabase, FiCheckCircle, FiUser,
} from 'react-icons/fi';

/* ── constants ──────────────────────────────────────────────────────── */
const CHAR_COLORS = ['#7C4DFF', '#D500F9', '#FF6D00', '#00BCD4', '#69F0AE', '#FF80AB'];

const EMOTION_MAP = {
  angry: '😤', scared: '😰', frustrated: '😩', desperate: '😣',
  hopeful: '🤞', calculating: '🧐', defensive: '🛡️', anxious: '😟',
  nervous: '😬', calm: '😌', relieved: '😮‍💨', determined: '💪',
  shocked: '😱', suspicious: '🤨', sympathetic: '🥺', sarcastic: '😏',
  authoritative: '👮', resigned: '😔', defiant: '✊', guilty: '😣',
  neutral: '', confident: '😎', amused: '😄', panicked: '😰',
};

const VIEW_MODES = [
  { key: 'pipeline', label: 'Pipeline',    icon: FiTerminal },
  { key: 'dialogue', label: 'Dialogue',    icon: FiMessageSquare },
  { key: 'movie',    label: 'Movie Scene', icon: FiFilm },
  { key: 'agents',   label: 'Agents',      icon: FiUsers },
];

/* ── pipeline phases ────────────────────────────────────────────────── */
const PHASES = [
  { key: 'director_select',   label: 'Director Select',   icon: FiActivity,    color: '#7C4DFF' },
  { key: 'character_reason',  label: 'Character Reason',  icon: FiUser,        color: '#D500F9' },
  { key: 'process_action',    label: 'Process Action',    icon: FiZap,         color: '#FF6D00' },
  { key: 'memory_update',     label: 'Memory Update',     icon: FiDatabase,    color: '#82B1FF' },
  { key: 'check_conclusion',  label: 'Check Conclusion',  icon: FiCheckCircle, color: '#69F0AE' },
  { key: 'conclude_story',    label: 'Conclude Story',    icon: FiAlertCircle, color: '#FF80AB' },
];

function charColor(name, chars) {
  const idx = (chars || []).findIndex(c => c.name === name);
  return CHAR_COLORS[(idx === -1 ? 0 : idx) % CHAR_COLORS.length];
}

/* ═════════════════════════════════════════════════════════════════════
   MAIN HISTORY PAGE
   ═════════════════════════════════════════════════════════════════════ */
export default function HistoryPage() {
  const { isDark } = useTheme();
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedRun, setSelectedRun] = useState(null);
  const [fullData, setFullData] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [viewMode, setViewMode] = useState('pipeline');

  /* ── Load history list ───────────────────────────────────────────── */
  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/history');
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      setRuns(data.runs || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  /* ── Load full run detail ────────────────────────────────────────── */
  const openRun = async (run) => {
    setSelectedRun(run);
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/history/${run.id}`);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      setFullData(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingDetail(false);
    }
  };

  /* ── Delete run ──────────────────────────────────────────────────── */
  const deleteRun = async (e, runId) => {
    e.stopPropagation();
    try {
      await fetch(`/api/history/${runId}`, { method: 'DELETE' });
      setRuns(prev => prev.filter(r => r.id !== runId));
      if (selectedRun?.id === runId) {
        setSelectedRun(null);
        setFullData(null);
      }
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  /* ── Back to list ────────────────────────────────────────────────── */
  const goBack = () => {
    setSelectedRun(null);
    setFullData(null);
  };

  /* ── Reconstruct timeline from stored data ───────────────────────── */
  const buildTimeline = (data) => {
    if (!data) return [];
    const tl = data.timeline || [];
    return tl.map(item => {
      const sseType = item.sseType;
      if (sseType === 'step') return { type: 'phase', ...item };
      if (sseType === 'director_result') return { type: 'director', ...item };
      if (sseType === 'reasoning_result') return { type: 'reasoning', ...item };
      if (sseType === 'action_result') return { ...item, type: 'event', contentType: item.type !== 'action_result' ? item.type : undefined };
      if (sseType === 'memory_result') return { type: 'memory', ...item };
      if (sseType === 'conclusion_check') return { type: 'conclusion_check', ...item };
      if (sseType === 'concluded') return { type: 'concluded', ...item };
      return { type: item.sseType || 'unknown', ...item };
    });
  };

  /* ═══════════════════════════════════════════════════════════════════
     RENDER — Detail View
     ═══════════════════════════════════════════════════════════════════ */
  if (selectedRun) {
    const chars = fullData?.characters || selectedRun.characters || [];
    const timeline = buildTimeline(fullData);
    const title = fullData?.title || selectedRun.title;

    return (
      <div className={`min-h-screen pt-20 pb-12 ${isDark ? 'bg-dark-bg' : 'bg-light-bg'}`}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <button
              onClick={goBack}
              className={`p-2 rounded-xl transition ${isDark ? 'hover:bg-white/5 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
            >
              <FiChevronLeft size={20} />
            </button>
            <div>
              <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{title}</h1>
              <p className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                {new Date(selectedRun.created_at).toLocaleString()}
                {fullData?.summary && ` · ${fullData.summary.totalTurns || '?'} turns · ${fullData.summary.totalActions || '?'} actions`}
              </p>
            </div>
          </div>

          {loadingDetail ? (
            <div className="flex items-center justify-center py-20">
              <FiLoader className="animate-spin text-primary mr-2" size={20} />
              <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>Loading story data…</span>
            </div>
          ) : (
            <>
              {/* View mode tabs */}
              <div className={`flex gap-1 p-1 rounded-xl mb-6 w-fit ${isDark ? 'bg-white/3' : 'bg-gray-100'}`}>
                {VIEW_MODES.map(m => {
                  const Icon = m.icon;
                  const active = viewMode === m.key;
                  return (
                    <button
                      key={m.key}
                      onClick={() => setViewMode(m.key)}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                        active
                          ? isDark ? 'bg-primary/20 text-primary shadow-sm' : 'bg-white text-primary shadow-sm'
                          : isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      <Icon size={14} /> {m.label}
                    </button>
                  );
                })}
              </div>

              {/* View content */}
              <div className={`rounded-2xl overflow-hidden ${viewMode === 'movie' ? '' : 'p-6'} ${isDark ? 'card-dark' : 'card-light'}`}>
                {viewMode === 'pipeline' && <HistoryPipelineView timeline={timeline} isDark={isDark} chars={chars} />}
                {viewMode === 'dialogue' && <HistoryDialogueView timeline={timeline} isDark={isDark} chars={chars} />}
                {viewMode === 'movie' && <HistoryMovieView timeline={timeline} isDark={isDark} chars={chars} title={title} />}
                {viewMode === 'agents' && <HistoryAgentsView timeline={timeline} isDark={isDark} chars={chars} />}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════════════
     RENDER — History List
     ═══════════════════════════════════════════════════════════════════ */
  return (
    <div className={`min-h-screen pt-20 pb-12 ${isDark ? 'bg-dark-bg' : 'bg-light-bg'}`}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h1 className={`text-4xl sm:text-5xl font-bold mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Story <span className="text-gradient">History</span>
          </h1>
          <p className={`text-lg max-w-2xl mx-auto ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            Browse and replay past story generations
          </p>
        </motion.div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <FiLoader className="animate-spin text-primary mr-2" size={20} />
            <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>Loading history…</span>
          </div>
        )}

        {error && (
          <div className={`rounded-xl p-4 flex items-center gap-3 mb-6 ${isDark ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-600'}`}>
            <FiAlertCircle size={18} /> {error}
          </div>
        )}

        {!loading && !error && runs.length === 0 && (
          <div className={`text-center py-20 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
            <FiClock size={48} className="mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium mb-2">No stories yet</p>
            <p className="text-sm">Go to the Live playground to generate your first story.</p>
          </div>
        )}

        {!loading && runs.length > 0 && (
          <div className="space-y-3">
            <AnimatePresence>
              {runs.map((run, i) => (
                <motion.div
                  key={run.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -50 }}
                  transition={{ delay: i * 0.03 }}
                  onClick={() => openRun(run)}
                  className={`group rounded-2xl p-5 cursor-pointer transition-all ${
                    isDark
                      ? 'card-dark hover:bg-white/3 hover:border-primary/20'
                      : 'card-light hover:bg-gray-50 hover:border-primary/20'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <FiPlay size={14} className="text-primary flex-shrink-0" />
                        <h3 className={`font-bold text-lg truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                          {run.title}
                        </h3>
                      </div>
                      <p className={`text-sm line-clamp-2 mb-3 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                        {run.description}
                      </p>
                      <div className="flex items-center gap-3 flex-wrap">
                        {/* Characters */}
                        <div className="flex -space-x-2">
                          {(run.characters || []).slice(0, 4).map((c, ci) => (
                            <div
                              key={ci}
                              className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2"
                              style={{ backgroundColor: CHAR_COLORS[ci % CHAR_COLORS.length], borderColor: isDark ? '#0a0a0f' : '#fff' }}
                              title={c.name}
                            >
                              {c.name[0]}
                            </div>
                          ))}
                        </div>
                        {/* Stats */}
                        {run.summary && (
                          <div className={`flex items-center gap-3 text-xs ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                            <span>{run.summary.totalTurns || '?'} turns</span>
                            <span>{run.summary.totalActions || '?'} actions</span>
                          </div>
                        )}
                        {/* Date */}
                        <span className={`text-xs ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                          <FiClock size={11} className="inline mr-1" />
                          {new Date(run.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => deleteRun(e, run.id)}
                      className={`p-2 rounded-lg opacity-0 group-hover:opacity-100 transition ${
                        isDark ? 'hover:bg-red-500/10 text-red-400' : 'hover:bg-red-50 text-red-400'
                      }`}
                      title="Delete"
                    >
                      <FiTrash2 size={16} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════
   HISTORY VIEW COMPONENTS (matching LivePage views)
   ═════════════════════════════════════════════════════════════════════ */

/* ── Pipeline View ──────────────────────────────────────────────────── */
function HistoryPipelineView({ timeline, isDark, chars }) {
  if (timeline.length === 0) {
    return <EmptyState isDark={isDark} text="No pipeline data found in this story." />;
  }

  return (
    <div className="space-y-3">
      <AnimatePresence initial={false}>
        {timeline.map((evt, idx) => (
          <PipelineItem key={idx} evt={evt} isDark={isDark} chars={chars} />
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ── Pipeline Item ──────────────────────────────────────────────────── */
function PipelineItem({ evt, isDark, chars }) {
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

/* ── Dialogue View ──────────────────────────────────────────────────── */
function HistoryDialogueView({ timeline, isDark, chars }) {
  const dialogueEvents = timeline.filter(evt =>
    evt.type === 'event' || evt.type === 'director'
  );

  if (dialogueEvents.length === 0) {
    return <EmptyState isDark={isDark} text="No dialogue events found in this story." />;
  }

  return (
    <div className="space-y-3 max-w-3xl mx-auto">
      {dialogueEvents.map((evt, idx) => {
        if (evt.type === 'director' && evt.narration) {
          return (
            <div key={idx} className={`text-center py-3 px-6 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              <p className="text-xs italic">{evt.narration}</p>
            </div>
          );
        }
        if (evt.type === 'event' && evt.speaker) {
          const color = charColor(evt.speaker, chars);
          const isAction = !!evt.actionType;
          return (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-3 items-start"
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0 mt-0.5"
                style={{ backgroundColor: color }}
              >
                {evt.speaker[0]}
              </div>
              <div className={`flex-1 rounded-2xl px-4 py-3 ${isDark ? 'bg-white/3' : 'bg-gray-50'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-bold" style={{ color }}>{evt.speaker}</span>
                  {isAction && (
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-400">
                      <FiZap size={8} className="inline mr-0.5" />{evt.actionType}
                    </span>
                  )}
                  {evt.emotion && (
                    <span className="text-[10px]">{EMOTION_MAP[(evt.emotion || '').toLowerCase()] || ''}</span>
                  )}
                </div>
                <p className={`text-sm leading-relaxed ${
                  isAction
                    ? isDark ? 'text-orange-200/80 italic' : 'text-orange-700 italic'
                    : isDark ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  {!isAction && <span className={isDark ? 'text-gray-500' : 'text-gray-400'}>&ldquo;</span>}
                  {evt.content}
                  {!isAction && <span className={isDark ? 'text-gray-500' : 'text-gray-400'}>&rdquo;</span>}
                </p>
              </div>
            </motion.div>
          );
        }
        return null;
      })}
    </div>
  );
}

/* ── Movie Scene View (matching LivePage cinematic style) ──────────── */
function HistoryMovieView({ timeline, isDark, chars, title }) {
  const sceneEvents = timeline.filter(evt =>
    evt.type === 'event' || evt.type === 'director' || evt.type === 'concluded'
  );

  if (sceneEvents.length === 0) {
    return <EmptyState isDark={isDark} text="No scene events found in this story." />;
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

                {/* Inner thought / reasoning */}
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

/* ── Agents View ────────────────────────────────────────────────────── */
function HistoryAgentsView({ timeline, isDark, chars }) {
  const agentEvents = timeline.filter(evt =>
    evt.type === 'event' || evt.type === 'reasoning'
  );

  if (agentEvents.length === 0) {
    return <EmptyState isDark={isDark} text="No agent events found in this story." />;
  }

  /* Per-agent stats */
  const agentStats = {};
  for (const c of chars) {
    agentStats[c.name] = { talks: 0, actions: 0, lastEmotion: null };
  }
  for (const evt of agentEvents) {
    const s = agentStats[evt.speaker];
    if (!s) continue;
    if (evt.type === 'event') {
      if (evt.actionType) s.actions++; else s.talks++;
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
            <div key={c.name} className={`flex items-center gap-2 px-3 py-2 rounded-xl ${isDark ? 'bg-white/3' : 'bg-gray-50'}`}>
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
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

      {/* Event list */}
      <div className="space-y-2">
        {agentEvents.map((evt, idx) => {
          const color = charColor(evt.speaker, chars);
          const isAction = evt.type === 'event' && !!evt.actionType;
          const isDialogue = evt.type === 'event' && !evt.actionType;
          const isReasoning = evt.type === 'reasoning';
          const emotionEmoji = EMOTION_MAP[(evt.emotion || '').toLowerCase()] || '';

          if (isReasoning) {
            return (
              <div key={idx} className={`rounded-lg px-4 py-2.5 border-l-[3px] ${
                isDark ? 'bg-purple-500/5 border-purple-500/30' : 'bg-purple-50/50 border-purple-300'
              }`}>
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
                  {evt.observation && <p className={`text-[11px] ${isDark ? 'text-gray-400' : 'text-gray-500'}`}><span className="font-semibold">Observes:</span> {evt.observation}</p>}
                  {evt.reasoning && <p className={`text-[11px] ${isDark ? 'text-gray-400' : 'text-gray-500'}`}><span className="font-semibold">Thinks:</span> {evt.reasoning}</p>}
                </div>
              </div>
            );
          }

          return (
            <div key={idx} className={`rounded-xl overflow-hidden ${
              isAction
                ? isDark ? 'bg-orange-500/5 border border-orange-500/15' : 'bg-orange-50/80 border border-orange-200'
                : isDark ? 'bg-white/2 border border-white/5' : 'bg-white border border-gray-100 shadow-sm'
            }`}>
              <div className="px-4 py-2.5" style={{ borderBottom: `2px solid ${color}20` }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                    style={{ backgroundColor: color }}>{evt.speaker?.[0]}</div>
                  <span className="text-sm font-bold" style={{ color }}>{evt.speaker}</span>
                  <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                    {isDialogue ? 'said:' : 'performed:'}
                  </span>
                  {isAction && evt.actionType && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-400 font-mono">
                      <FiZap size={9} className="inline mr-0.5" /> {evt.actionType}
                    </span>
                  )}
                  {evt.emotion && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${isDark ? 'bg-white/5 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
                      {emotionEmoji} {evt.emotion}
                    </span>
                  )}
                  <span className={`ml-auto text-[10px] font-mono ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>Turn {evt.turn}</span>
                </div>
              </div>
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
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Empty state helper ─────────────────────────────────────────────── */
function EmptyState({ isDark, text }) {
  return (
    <div className={`flex flex-col items-center justify-center py-16 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
      <FiClock size={32} className="mb-3 opacity-40" />
      <p className="text-sm">{text}</p>
    </div>
  );
}
