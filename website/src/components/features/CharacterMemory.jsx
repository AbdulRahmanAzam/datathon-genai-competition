import { motion } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext';
import SectionWrapper from '../SectionWrapper';
import ScrollReveal from '../ScrollReveal';
import { storyData } from '../../data/storyData';

const memoryTimeline = [
  { turn: 0, facts: ["Accident just happened on Shahrah-e-Faisal"], emotion: "neutral", relationships: {} },
  { turn: 1, facts: ["Saleem claims he was driving slow", "Saleem has family of 5"], emotion: "panicked", relationships: { "Ahmed Malik": "adversary" } },
  { turn: 2, facts: ["Ahmed has a Mercedes", "Ahmed has international flight"], emotion: "frustrated", relationships: { "Saleem": "adversary" } },
  { turn: 3, facts: ["Constable Raza arrived", "Raza hinted at bribe"], emotion: "anxious", relationships: { "Saleem": "adversary", "Constable Raza": "wary" } },
  { turn: 5, facts: ["Uncle Jameel claims police contact", "Jameel calls it 'system'"], emotion: "pragmatic", relationships: { "Saleem": "neutral", "Constable Raza": "transactional" } },
  { turn: 7, facts: ["Settled for 5000 rupees", "Traffic resumed"], emotion: "resigned", relationships: { "Saleem": "settled", "Constable Raza": "paid" } },
];

const emotionColors = {
  neutral: '#9E9E9E',
  panicked: '#FF7043',
  frustrated: '#FF5252',
  anxious: '#FFB74D',
  pragmatic: '#42A5F5',
  resigned: '#66BB6A',
};

export default function CharacterMemory() {
  const { isDark } = useTheme();

  return (
    <SectionWrapper id="character-memory" dark>
      <ScrollReveal>
        <div className="text-center mb-12">
          <h2 className={`text-4xl sm:text-5xl font-bold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Character <span className="text-gradient">Memory</span>
          </h2>
          <p className={`text-lg max-w-2xl mx-auto ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            Each character accumulates facts, tracks emotional states, and maintains evolving relationships
          </p>
        </div>
      </ScrollReveal>

      {/* Characters */}
      <ScrollReveal>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          {storyData.characters.map((char, i) => (
            <motion.div
              key={char.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              whileHover={{ scale: 1.05 }}
              className={`p-4 rounded-xl text-center ${isDark ? 'bg-dark-card border border-white/5' : 'bg-white border border-gray-200'}`}
            >
              <div
                className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center text-xl font-bold text-white"
                style={{ backgroundColor: char.color }}
              >
                {char.name[0]}
              </div>
              <h4 className={`font-semibold text-sm mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>{char.name}</h4>
              <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>{char.description.slice(0, 60)}...</p>
            </motion.div>
          ))}
        </div>
      </ScrollReveal>

      {/* Memory Timeline */}
      <div className="relative">
        {/* Timeline line */}
        <div className={`absolute left-6 md:left-1/2 top-0 bottom-0 w-0.5 ${isDark ? 'bg-primary/30' : 'bg-primary/20'}`} />

        {memoryTimeline.map((entry, i) => (
          <ScrollReveal key={i} delay={i * 0.08} direction={i % 2 === 0 ? 'left' : 'right'}>
            <div className={`relative flex items-start mb-8 ${i % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'} flex-row`}>
              {/* Node */}
              <div className="absolute left-6 md:left-1/2 -translate-x-1/2 z-10">
                <motion.div
                  initial={{ scale: 0 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1, type: 'spring' }}
                  className="w-4 h-4 rounded-full border-2 border-primary bg-dark-bg"
                  style={{ backgroundColor: emotionColors[entry.emotion] }}
                />
              </div>

              {/* Card */}
              <div className={`ml-14 md:ml-0 ${i % 2 === 0 ? 'md:mr-auto md:pr-12 md:w-1/2' : 'md:ml-auto md:pl-12 md:w-1/2'}`}>
                <div className={`p-4 rounded-xl ${isDark ? 'bg-dark-card/80 border border-white/5' : 'bg-white border border-gray-200'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-xs font-mono ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Turn {entry.turn}</span>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full text-white font-medium"
                      style={{ backgroundColor: emotionColors[entry.emotion] }}
                    >
                      {entry.emotion}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {entry.facts.map((fact, fi) => (
                      <p key={fi} className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                        • {fact}
                      </p>
                    ))}
                  </div>
                  {Object.keys(entry.relationships).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {Object.entries(entry.relationships).map(([name, rel]) => (
                        <span key={name} className={`text-xs px-2 py-0.5 rounded ${isDark ? 'bg-white/5 text-gray-400' : 'bg-gray-100 text-gray-600'}`}>
                          {name}: {rel}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </ScrollReveal>
        ))}
      </div>
    </SectionWrapper>
  );
}
