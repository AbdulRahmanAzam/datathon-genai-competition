import { useTheme } from '../../context/ThemeContext';
import { FiGithub, FiMail, FiExternalLink } from 'react-icons/fi';

export default function Footer() {
  const { isDark } = useTheme();

  return (
    <footer className={`relative py-16 px-4 sm:px-6 lg:px-8 overflow-hidden ${isDark ? 'bg-dark-surface' : 'bg-light-surface'}`}>
      {/* Background pattern */}
      <div className={`absolute inset-0 ${isDark ? 'bg-grid-dark' : 'bg-grid-light'} opacity-50`} />

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          {/* About */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold text-sm">
                NV
              </div>
              <span className={`font-bold text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>NarrativeVerse</span>
            </div>
            <p className={`text-sm leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              A Multi-Agent Narrative System built for the Hackfest × Datathon 2026 GenAI competition. 
              Autonomous AI characters with memory, reasoning, and actions navigate conflict-driven stories.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className={`font-bold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>Quick Links</h3>
            <ul className="space-y-2">
              {['Home', 'Features', 'Showcase'].map(label => (
                <li key={label}>
                  <a
                    href={label === 'Home' ? '/' : `/${label.toLowerCase()}`}
                    className={`text-sm flex items-center gap-1 transition ${isDark ? 'text-gray-400 hover:text-primary' : 'text-gray-600 hover:text-primary'}`}
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className={`font-bold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>Connect</h3>
            <div className="space-y-3">
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-2 text-sm transition ${isDark ? 'text-gray-400 hover:text-primary' : 'text-gray-600 hover:text-primary'}`}
              >
                <FiGithub /> GitHub Repository
                <FiExternalLink size={12} />
              </a>
              <a
                href="mailto:team@narrativeverse.dev"
                className={`flex items-center gap-2 text-sm transition ${isDark ? 'text-gray-400 hover:text-primary' : 'text-gray-600 hover:text-primary'}`}
              >
                <FiMail /> team@narrativeverse.dev
              </a>
            </div>
          </div>
        </div>

        <div className={`mt-12 pt-8 border-t text-center text-sm ${isDark ? 'border-white/10 text-gray-500' : 'border-gray-200 text-gray-400'}`}>
          <p>Built with React, Tailwind CSS, Framer Motion & Three.js</p>
          <p className="mt-1">Hackfest × Datathon 2026 — GenAI Multi-Agent Narrative System</p>
        </div>
      </div>
    </footer>
  );
}
