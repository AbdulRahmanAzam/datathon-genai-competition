import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';
import {
  FiClock, FiChevronLeft, FiUsers, FiMessageSquare, FiFilm,
  FiZap, FiTrash2, FiLoader, FiAlertCircle, FiPlay,
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
  { key: 'dialogue', label: 'Dialogue',    icon: FiMessageSquare },
  { key: 'movie',    label: 'Movie Scene', icon: FiFilm },
  { key: 'agents',   label: 'Agents',      icon: FiUsers },
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
  const [viewMode, setViewMode] = useState('dialogue');

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
      if (sseType === 'director_result') return { type: 'director', ...item };
      if (sseType === 'reasoning_result') return { type: 'reasoning', ...item };
      if (sseType === 'action_result') return { ...item, type: 'event', contentType: item.type !== 'action_result' ? item.type : undefined };
      if (sseType === 'conclusion_check') return { type: 'conclusion_check', ...item };
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
              <div className={`rounded-2xl p-6 ${isDark ? 'card-dark' : 'card-light'}`}>
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
   HISTORY VIEW COMPONENTS (simplified versions of LivePage views)
   ═════════════════════════════════════════════════════════════════════ */

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

/* ── Movie Scene View ───────────────────────────────────────────────── */
function HistoryMovieView({ timeline, isDark, chars, title }) {
  const sceneEvents = timeline.filter(evt =>
    evt.type === 'event' || evt.type === 'director'
  );

  if (sceneEvents.length === 0) {
    return <EmptyState isDark={isDark} text="No scene events found in this story." />;
  }

  return (
    <div className="space-y-0 max-w-3xl mx-auto">
      {/* Title card */}
      <div className={`text-center py-8 mb-6 border-b ${isDark ? 'border-white/5' : 'border-gray-100'}`}>
        <p className={`text-sm uppercase tracking-[0.3em] mb-2 ${isDark ? 'text-primary/60' : 'text-primary/40'}`}>
          ▶ NOW PLAYING
        </p>
        <h2 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{title}</h2>
      </div>

      {sceneEvents.map((evt, idx) => {
        if (evt.type === 'director' && evt.narration) {
          return (
            <div key={idx} className={`py-4 px-8 text-center`}>
              <p className={`text-sm italic leading-relaxed ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                {evt.narration}
              </p>
            </div>
          );
        }
        if (evt.type === 'event' && evt.speaker) {
          const color = charColor(evt.speaker, chars);
          const isAction = !!evt.actionType;
          const emotionEmoji = EMOTION_MAP[(evt.emotion || '').toLowerCase()] || '';
          return (
            <motion.div
              key={idx}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={`py-4 px-6 border-l-[3px]`}
              style={{ borderLeftColor: color }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color }}>
                  {evt.speaker}
                </span>
                {emotionEmoji && <span className="text-xs">{emotionEmoji}</span>}
                {isAction && (
                  <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-400">
                    {evt.actionType}
                  </span>
                )}
              </div>
              <p className={`text-sm leading-relaxed pl-0 ${
                isAction
                  ? isDark ? 'text-orange-200/80 italic' : 'text-orange-700 italic'
                  : isDark ? 'text-gray-200' : 'text-gray-800'
              }`}>
                {evt.content}
              </p>
            </motion.div>
          );
        }
        return null;
      })}

      {/* End card */}
      <div className={`text-center py-8 mt-6 border-t ${isDark ? 'border-white/5' : 'border-gray-100'}`}>
        <p className={`text-sm uppercase tracking-[0.3em] ${isDark ? 'text-primary/60' : 'text-primary/40'}`}>
          ■ FIN
        </p>
      </div>
    </div>
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
