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
      <div className="absolute inset-0 bg-grid-pattern opacity-40" />

      {/* Gradient overlay */}
      <div className={`absolute inset-0 ${isDark
        ? 'bg-gradient-to-b from-primary/10 via-transparent to-dark-bg'
        : 'bg-gradient-to-b from-primary/5 via-transparent to-light-bg'
      }`} />

      {/* 3D Scene */}
      <Suspense fallback={null}>
        <HeroScene />
      </Suspense>

      {/* Content */}
      <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          <h1 className="text-5xl sm:text-7xl lg:text-8xl font-extrabold mb-4 tracking-tight">
            <span className="text-gradient glow-text">NarrativeVerse</span>
          </h1>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className={`text-xl sm:text-2xl mb-3 font-light ${isDark ? 'text-gray-300' : 'text-gray-600'}`}
        >
          Where AI Tells Your Stories
        </motion.p>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.55 }}
          className={`text-sm sm:text-base mb-8 max-w-2xl mx-auto ${isDark ? 'text-gray-400' : 'text-gray-500'}`}
        >
          A Multi-Agent Narrative System built for Hackfest × Datathon 2026 — autonomous characters with memory, reasoning, and actions navigate conflict-driven stories.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.7 }}
          className="flex flex-col sm:flex-row gap-4 justify-center"
        >
          <Link
            to="/showcase"
            className="px-8 py-3 rounded-xl bg-gradient-to-r from-primary to-accent text-white font-semibold text-lg shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:scale-105 transition-all duration-300"
          >
            Explore the Story
          </Link>
          <Link
            to="/features"
            className={`px-8 py-3 rounded-xl font-semibold text-lg neon-border transition-all duration-300 hover:scale-105 ${
              isDark ? 'text-white hover:bg-white/5' : 'text-primary hover:bg-primary/5'
            }`}
          >
            See Features
          </Link>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <motion.div
            animate={{ y: [0, 12, 0] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className={`w-6 h-10 rounded-full border-2 ${isDark ? 'border-gray-500' : 'border-gray-400'} flex justify-center pt-2`}
          >
            <motion.div className="w-1.5 h-1.5 rounded-full bg-primary" />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
