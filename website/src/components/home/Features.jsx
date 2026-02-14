import { motion } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext';
import { features } from '../../data/storyData';
import SectionWrapper from '../SectionWrapper';
import ScrollReveal from '../ScrollReveal';
import { FiDatabase, FiZap, FiCpu, FiTrendingUp, FiHeart } from 'react-icons/fi';

const iconMap = {
  memory: FiDatabase,
  action: FiZap,
  reasoning: FiCpu,
  arc: FiTrendingUp,
  emotion: FiHeart,
};

export default function Features() {
  const { isDark } = useTheme();

  return (
    <SectionWrapper id="features" dark>
      <ScrollReveal>
        <div className="text-center mb-16">
          <h2 className={`text-4xl sm:text-5xl font-bold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Core <span className="text-gradient">Features</span>
          </h2>
          <p className={`text-lg max-w-2xl mx-auto ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            Built with advanced AI agent capabilities that go beyond simple chatbots
          </p>
        </div>
      </ScrollReveal>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {features.map((feature, i) => {
          const Icon = iconMap[feature.icon];
          return (
            <ScrollReveal key={feature.title} delay={i * 0.1}>
              <motion.div
                whileHover={{ scale: 1.03, y: -4 }}
                className={`group relative p-6 rounded-2xl transition-all duration-300 cursor-default ${
                  isDark
                    ? 'bg-dark-card/80 hover:bg-dark-card border border-white/5 hover:border-primary/30'
                    : 'bg-white hover:bg-light-card border border-gray-200 hover:border-primary/30'
                } hover:shadow-lg hover:shadow-primary/10`}
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mb-4 group-hover:from-primary/30 group-hover:to-accent/30 transition-all duration-300">
                  <Icon className="text-primary text-xl group-hover:text-accent transition-colors duration-300" />
                </div>
                <h3 className={`text-xl font-bold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {feature.title}
                </h3>
                <p className={`text-sm leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                  {feature.description}
                </p>
                {/* Glow effect on hover */}
                <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none bg-gradient-to-br from-primary/5 to-accent/5" />
              </motion.div>
            </ScrollReveal>
          );
        })}
      </div>
    </SectionWrapper>
  );
}
