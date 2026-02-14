import { Suspense } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext';
import HeroScene from '../HeroScene';
import { Link } from 'react-router-dom';

export default function Hero() {
  const { isDark } = useTheme();

  return (
    <section className={`relative min-h-screen flex items-center justify-center overflow-hidden ${isDark ? 'bg-dark-bg' : 'bg-light-bg'}`}>
      {/* Grid background */}
      <div className={`absolute inset-0 ${isDark ? 'bg-grid-dark' : 'bg-grid-light'}`} />

      {/* Aurora glow */}
      <div className={`absolute inset-0 ${isDark ? 'aurora-bg' : 'aurora-bg-light'}`} />

      {/* Bottom fade */}
      <div className={`absolute bottom-0 left-0 right-0 h-40 ${isDark
        ? 'bg-gradient-to-t from-dark-bg to-transparent'
        : 'bg-gradient-to-t from-light-bg to-transparent'
      }`} />

      {/* 3D Scene */}
      <Suspense fallback={null}>
        <HeroScene isDark={isDark} />
      </Suspense>

      {/* Content */}
      <div className="relative z-10 text-center px-4 max-w-5xl mx-auto">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-6"
        >
          <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide uppercase ${
            isDark
              ? 'bg-primary/10 text-neon-purple border border-primary/20'
              : 'bg-primary/8 text-primary border border-primary/15'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${isDark ? 'bg-neon-green' : 'bg-green-500'}`} />
            Hackfest × Datathon 2026
          </span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.15 }}
        >
          <h1 className="text-6xl sm:text-7xl lg:text-9xl font-black mb-6 tracking-tight leading-none">
            <span className={isDark ? 'text-gradient glow-text-dark' : 'text-gradient-light glow-text-light'}>
              Narrative
            </span>
            <br />
            <span className={isDark ? 'text-white' : 'text-gray-900'}>
              Verse
            </span>
          </h1>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 25 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.35 }}
          className={`text-lg sm:text-xl lg:text-2xl mb-4 font-light tracking-wide ${isDark ? 'text-gray-300' : 'text-gray-600'}`}
        >
          Where AI Agents Tell Your Stories
        </motion.p>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className={`text-sm sm:text-base mb-10 max-w-2xl mx-auto leading-relaxed ${isDark ? 'text-gray-500' : 'text-gray-500'}`}
        >
          Multi-agent characters with <span className={isDark ? 'text-neon-purple font-medium' : 'text-primary font-medium'}>memory</span>,{' '}
          <span className={isDark ? 'text-neon-blue font-medium' : 'text-blue-600 font-medium'}>reasoning</span>, and{' '}
          <span className={isDark ? 'text-neon-pink font-medium' : 'text-pink-600 font-medium'}>actions</span>{' '}
          navigate real-time conflict-driven narratives from any story seed.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 25 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.65 }}
          className="flex flex-col sm:flex-row gap-4 justify-center"
        >
          <Link
            to="/showcase"
            className={`group px-8 py-3.5 rounded-2xl font-bold text-lg transition-all duration-300 hover:scale-105 ${
              isDark
                ? 'bg-gradient-to-r from-primary via-secondary to-accent text-white shadow-lg shadow-primary/20 hover:shadow-primary/40'
                : 'bg-gradient-to-r from-primary to-secondary text-white shadow-lg shadow-primary/25 hover:shadow-primary/40'
            }`}
          >
            <span className="flex items-center gap-2 justify-center">
              Explore the Story
              <span className="group-hover:translate-x-1 transition-transform">→</span>
            </span>
          </Link>
          <Link
            to="/features"
            className={`px-8 py-3.5 rounded-2xl font-bold text-lg transition-all duration-300 hover:scale-105 ${
              isDark
                ? 'neon-border-dark text-gray-200 hover:text-white hover:bg-white/5'
                : 'neon-border-light text-primary hover:bg-primary/5'
            }`}
          >
            See Features
          </Link>
        </motion.div>

        {/* Agent labels */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 1 }}
          className="mt-16 flex flex-wrap justify-center gap-3"
        >
          {[
            { label: 'Director Agent', color: isDark ? '#B388FF' : '#7C4DFF' },
            { label: 'Character Agents', color: isDark ? '#FF80AB' : '#E91E63' },
            { label: 'Memory System', color: isDark ? '#82B1FF' : '#1976D2' },
            { label: 'Action Engine', color: isDark ? '#18FFFF' : '#00ACC1' },
          ].map(({ label, color }) => (
            <span
              key={label}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
                isDark ? 'bg-white/5 text-gray-400' : 'bg-gray-100 text-gray-500'
              }`}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
              {label}
            </span>
          ))}
        </motion.div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10"
      >
        <motion.div
          animate={{ y: [0, 10, 0] }}
          transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
          className={`w-5 h-9 rounded-full border-2 ${isDark ? 'border-gray-600' : 'border-gray-300'} flex justify-center pt-2`}
        >
          <motion.div className={`w-1 h-1 rounded-full ${isDark ? 'bg-neon-purple' : 'bg-primary'}`} />
        </motion.div>
      </motion.div>
    </section>
  );
}
