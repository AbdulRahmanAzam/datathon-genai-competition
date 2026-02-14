import { useTheme } from '../../context/ThemeContext';
import { graphNodes } from '../../data/storyData';
import SectionWrapper from '../SectionWrapper';
import ScrollReveal from '../ScrollReveal';
import { motion } from 'framer-motion';
import { useState } from 'react';

const nodeColors = [
  '#7C4DFF', '#D500F9', '#82B1FF', '#B388FF', '#FF80AB', '#69F0AE'
];

export default function Architecture() {
  const { isDark } = useTheme();
  const [activeNode, setActiveNode] = useState(null);

  return (
    <SectionWrapper id="architecture">
      <ScrollReveal>
        <div className="text-center mb-12">
          <h2 className={`text-4xl sm:text-5xl font-bold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
            System <span className="text-gradient">Architecture</span>
          </h2>
          <p className={`text-lg max-w-2xl mx-auto ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            The LangGraph state machine that orchestrates the entire narrative simulation
          </p>
        </div>
      </ScrollReveal>

      <div className="max-w-5xl mx-auto">
        {/* Flowchart */}
        <div className="relative">
          {/* Connection lines - SVG */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" style={{ overflow: 'visible' }}>
            {/* We use CSS grid, so SVG lines are approximate. Using the nodes below instead. */}
          </svg>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {graphNodes.map((node, i) => (
              <ScrollReveal key={node.id} delay={i * 0.15} direction="scale">
                <motion.div
                  onMouseEnter={() => setActiveNode(node.id)}
                  onMouseLeave={() => setActiveNode(null)}
                  whileHover={{ scale: 1.05 }}
                  className={`relative p-6 rounded-2xl cursor-default transition-all duration-300 ${
                    isDark
                      ? 'card-dark border-2 hover:shadow-lg'
                      : 'card-light border-2 hover:shadow-lg'
                  }`}
                  style={{
                    borderColor: activeNode === node.id ? nodeColors[i] : isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)',
                    boxShadow: activeNode === node.id ? `0 0 30px ${nodeColors[i]}30` : 'none',
                  }}
                >
                  {/* Step number */}
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold mb-3"
                    style={{ backgroundColor: nodeColors[i] }}
                  >
                    {i + 1}
                  </div>

                  <h3 className={`font-bold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {node.label}
                  </h3>

                  <p className={`text-sm leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    {node.description}
                  </p>

                  {/* Arrow indicator */}
                  {i < graphNodes.length - 1 && (
                    <div className="hidden lg:block absolute -right-4 top-1/2 -translate-y-1/2 z-10">
                      {(i + 1) % 3 !== 0 && (
                        <motion.span
                          initial={{ opacity: 0 }}
                          whileInView={{ opacity: 1 }}
                          viewport={{ once: true }}
                          className="text-primary text-xl"
                        >
                          →
                        </motion.span>
                      )}
                    </div>
                  )}
                </motion.div>
              </ScrollReveal>
            ))}
          </div>

          {/* Loop indicator */}
          <ScrollReveal delay={0.8}>
            <div className="mt-8 text-center">
              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full ${isDark ? 'bg-dark-card border border-primary/20' : 'bg-light-card border border-primary/20'}`}>
                <span className="text-primary">↻</span>
                <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                  Loop continues from <span className="text-primary font-semibold">Check Conclusion</span> back to <span className="text-primary font-semibold">Director Select</span> until story ends
                </span>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </SectionWrapper>
  );
}
