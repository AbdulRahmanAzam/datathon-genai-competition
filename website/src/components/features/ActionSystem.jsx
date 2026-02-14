import { motion } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext';
import { actions } from '../../data/storyData';
import SectionWrapper from '../SectionWrapper';
import ScrollReveal from '../ScrollReveal';
import { useState } from 'react';

export default function ActionSystem() {
  const { isDark } = useTheme();
  const [hoveredAction, setHoveredAction] = useState(null);

  return (
    <SectionWrapper id="action-system">
      <ScrollReveal>
        <div className="text-center mb-12">
          <h2 className={`text-4xl sm:text-5xl font-bold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Action <span className="text-gradient">System</span>
          </h2>
          <p className={`text-lg max-w-2xl mx-auto ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            Characters execute non-verbal actions that affect story state and other characters
          </p>
        </div>
      </ScrollReveal>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-3xl mx-auto">
        {actions.map((action, i) => (
          <ScrollReveal key={action.name} delay={i * 0.08} direction="scale">
            <motion.div
              onMouseEnter={() => setHoveredAction(action.name)}
              onMouseLeave={() => setHoveredAction(null)}
              whileHover={{ scale: 1.08, y: -8 }}
              className={`relative group p-5 rounded-2xl text-center transition-all duration-300 cursor-default ${
                isDark
                  ? 'bg-dark-card/80 border border-white/5 hover:border-primary/40'
                  : 'bg-white border border-gray-200 hover:border-primary/40'
              } hover:shadow-lg hover:shadow-primary/10`}
            >
              <div className="text-3xl mb-3 group-hover:scale-110 transition-transform duration-300">
                {action.icon}
              </div>
              <p className={`text-xs font-mono font-semibold ${isDark ? 'text-neon-purple' : 'text-primary'}`}>
                {action.name}
              </p>

              {/* Expanded description */}
              <motion.div
                initial={false}
                animate={{
                  height: hoveredAction === action.name ? 'auto' : 0,
                  opacity: hoveredAction === action.name ? 1 : 0
                }}
                className="overflow-hidden"
              >
                <p className={`text-xs mt-2 leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                  {action.description}
                </p>
              </motion.div>

              {/* Glow */}
              <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-all duration-500 pointer-events-none"
                style={{ boxShadow: '0 0 30px rgba(124, 77, 255, 0.15)' }}
              />
            </motion.div>
          </ScrollReveal>
        ))}
      </div>
    </SectionWrapper>
  );
}
