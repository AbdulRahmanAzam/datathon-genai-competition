import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext';
import { storyData } from '../../data/storyData';
import SectionWrapper from '../SectionWrapper';
import ScrollReveal from '../ScrollReveal';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';

export default function SampleNarrative() {
  const { isDark } = useTheme();
  const [currentIndex, setCurrentIndex] = useState(0);
  const events = storyData.events;

  const next = () => setCurrentIndex(i => Math.min(i + 1, events.length - 1));
  const prev = () => setCurrentIndex(i => Math.max(i - 1, 0));

  const charColor = (speaker) => {
    const char = storyData.characters.find(c => c.name === speaker);
    return char?.color || '#B388FF';
  };

  return (
    <SectionWrapper id="sample-narrative" dark>
      <ScrollReveal>
        <div className="text-center mb-12">
          <h2 className={`text-4xl sm:text-5xl font-bold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Sample <span className="text-gradient">Narrative</span>
          </h2>
          <p className={`text-lg max-w-2xl mx-auto ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            "{storyData.title}" — Browse the generated story turn by turn
          </p>
        </div>
      </ScrollReveal>

      <div className="max-w-3xl mx-auto">
        {/* Turn counter */}
        <div className="flex items-center justify-between mb-4">
          <span className={`text-sm font-mono ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            Turn {events[currentIndex].turn} / {events[events.length - 1].turn}
          </span>
          <span className={`text-xs px-2 py-1 rounded ${
            events[currentIndex].type === 'narration'
              ? 'bg-accent/20 text-accent'
              : 'bg-primary/20 text-primary'
          }`}>
            {events[currentIndex].type}
          </span>
        </div>

        {/* Card */}
        <div className={`relative rounded-2xl overflow-hidden min-h-[200px] ${isDark ? 'bg-dark-card border border-white/5' : 'bg-white border border-gray-200'}`}>
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.3 }}
              className="p-6"
            >
              {events[currentIndex].type === 'dialogue' && (
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
                    style={{ backgroundColor: charColor(events[currentIndex].speaker) }}
                  >
                    {events[currentIndex].speaker[0]}
                  </div>
                  <div>
                    <p className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{events[currentIndex].speaker}</p>
                    <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Turn {events[currentIndex].turn}</p>
                  </div>
                </div>
              )}

              {events[currentIndex].type === 'narration' && (
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
                    <span className="text-accent text-lg">📖</span>
                  </div>
                  <div>
                    <p className={`font-semibold ${isDark ? 'text-accent' : 'text-accent'}`}>Director Narration</p>
                    <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Turn {events[currentIndex].turn}</p>
                  </div>
                </div>
              )}

              <p className={`leading-relaxed ${
                events[currentIndex].type === 'narration'
                  ? `italic ${isDark ? 'text-gray-400' : 'text-gray-600'}`
                  : isDark ? 'text-gray-300' : 'text-gray-700'
              }`}>
                {events[currentIndex].content}
              </p>

              {events[currentIndex].conclusion && (
                <div className="mt-4 px-3 py-2 rounded-lg bg-accent/10 border border-accent/20">
                  <span className="text-accent text-xs font-semibold">⊙ Story Concluded</span>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-4">
          <button
            onClick={prev}
            disabled={currentIndex === 0}
            className={`flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium transition ${
              currentIndex === 0
                ? 'opacity-30 cursor-not-allowed'
                : isDark ? 'text-white hover:bg-white/5' : 'text-gray-900 hover:bg-gray-100'
            }`}
          >
            <FiChevronLeft /> Previous
          </button>

          {/* Progress dots */}
          <div className="flex gap-1.5">
            {events.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentIndex(i)}
                className={`w-2 h-2 rounded-full transition-all ${
                  i === currentIndex ? 'bg-primary w-6' : isDark ? 'bg-white/20' : 'bg-gray-300'
                }`}
              />
            ))}
          </div>

          <button
            onClick={next}
            disabled={currentIndex === events.length - 1}
            className={`flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium transition ${
              currentIndex === events.length - 1
                ? 'opacity-30 cursor-not-allowed'
                : isDark ? 'text-white hover:bg-white/5' : 'text-gray-900 hover:bg-gray-100'
            }`}
          >
            Next <FiChevronRight />
          </button>
        </div>
      </div>
    </SectionWrapper>
  );
}
