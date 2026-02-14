import { useTheme } from '../../context/ThemeContext';
import SectionWrapper from '../SectionWrapper';
import ScrollReveal from '../ScrollReveal';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';

const acts = [
  {
    label: 'Act I: Setup',
    description: 'Characters are introduced. The accident scene is established — two vehicles collided on a busy Karachi street. Tensions begin to rise.',
    tension: 0.3,
    color: '#82B1FF',
    turns: '0-2',
  },
  {
    label: 'Act II: Confrontation',
    description: 'Characters clash over blame, money, and time. Constable Raza arrives and hints at bribes. Uncle Jameel adds social pressure. Tensions peak.',
    tension: 0.85,
    color: '#D500F9',
    turns: '3-5',
  },
  {
    label: 'Act III: Resolution',
    description: 'Ahmed offers to pay. A deal is struck at 5000 rupees. The scene clears, traffic resumes, and life in Karachi goes on.',
    tension: 0.2,
    color: '#69F0AE',
    turns: '6-7',
  },
];

export default function StoryArc() {
  const { isDark } = useTheme();
  const containerRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start end', 'end start'],
  });
  const tensionWidth = useTransform(scrollYProgress, [0.2, 0.5, 0.8], ['10%', '85%', '20%']);

  return (
    <SectionWrapper id="story-arc">
      <ScrollReveal>
        <div className="text-center mb-12">
          <h2 className={`text-4xl sm:text-5xl font-bold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
            3-Act <span className="text-gradient">Story Arc</span>
          </h2>
          <p className={`text-lg max-w-2xl mx-auto ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            Dynamic tension tracking follows a dramatic Setup → Confrontation → Resolution structure
          </p>
        </div>
      </ScrollReveal>

      <div ref={containerRef} className="max-w-4xl mx-auto">
        {/* Tension Bar */}
        <ScrollReveal>
          <div className="mb-12">
            <div className="flex justify-between mb-2">
              <span className={`text-sm font-mono ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Tension Level</span>
              <span className={`text-sm font-mono ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Dynamic</span>
            </div>
            <div className={`h-3 rounded-full overflow-hidden ${isDark ? 'bg-dark-card' : 'bg-gray-200'}`}>
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-neon-blue via-accent to-neon-purple"
                style={{ width: tensionWidth }}
                transition={{ type: 'spring' }}
              />
            </div>
          </div>
        </ScrollReveal>

        {/* SVG Arc Curve */}
        <ScrollReveal>
          <div className="relative mb-8">
            <svg viewBox="0 0 800 200" className="w-full" style={{ overflow: 'visible' }}>
              {/* Arc path */}
              <motion.path
                d="M 50 180 Q 200 170 350 30 Q 500 -50 600 80 Q 700 170 750 180"
                fill="none"
                stroke="url(#arcGradient)"
                strokeWidth="3"
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                whileInView={{ pathLength: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 2, ease: 'easeInOut' }}
              />
              <defs>
                <linearGradient id="arcGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#82B1FF" />
                  <stop offset="50%" stopColor="#D500F9" />
                  <stop offset="100%" stopColor="#69F0AE" />
                </linearGradient>
              </defs>
              {/* Labels */}
              {[
                { x: 80, y: 195, label: 'Setup' },
                { x: 370, y: 15, label: 'Climax' },
                { x: 720, y: 195, label: 'Resolution' },
              ].map((pt, i) => (
                <motion.text
                  key={pt.label}
                  x={pt.x}
                  y={pt.y}
                  textAnchor="middle"
                  fill={isDark ? '#B388FF' : '#7C4DFF'}
                  fontSize="14"
                  fontWeight="600"
                  fontFamily="Montserrat, sans-serif"
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.5 + i * 0.3 }}
                >
                  {pt.label}
                </motion.text>
              ))}
            </svg>
          </div>
        </ScrollReveal>

        {/* Act Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {acts.map((act, i) => (
            <ScrollReveal key={act.label} delay={i * 0.15}>
              <motion.div
                whileHover={{ y: -4 }}
                className={`p-6 rounded-2xl ${isDark ? 'bg-dark-card/80 border border-white/5' : 'bg-white border border-gray-200'}`}
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: act.color }} />
                  <h3 className={`font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{act.label}</h3>
                </div>
                <p className={`text-sm mb-3 leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                  {act.description}
                </p>
                <div className="flex justify-between items-center">
                  <span className={`text-xs font-mono ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Turns {act.turns}</span>
                  <div className={`flex items-center gap-1 ${isDark ? '' : ''}`}>
                    <span className="text-xs" style={{ color: act.color }}>Tension:</span>
                    <div className={`w-16 h-1.5 rounded-full ${isDark ? 'bg-dark-bg' : 'bg-gray-200'}`}>
                      <motion.div
                        className="h-full rounded-full"
                        style={{ backgroundColor: act.color }}
                        initial={{ width: 0 }}
                        whileInView={{ width: `${act.tension * 100}%` }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.5, duration: 1 }}
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </SectionWrapper>
  );
}
