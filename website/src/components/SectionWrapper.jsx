import { useTheme } from '../context/ThemeContext';

export default function SectionWrapper({ children, id, className = '', dark = false }) {
  const { isDark } = useTheme();
  const bg = dark
    ? isDark ? 'bg-dark-surface' : 'bg-light-surface'
    : isDark ? 'bg-dark-bg' : 'bg-light-bg';
  const grid = isDark ? 'bg-grid-dark' : 'bg-grid-light';

  return (
    <section id={id} className={`relative py-20 px-4 sm:px-6 lg:px-8 overflow-hidden transition-colors duration-500 ${bg} ${className}`}>
      <div className={`absolute inset-0 ${grid} pointer-events-none`} />
      <div className={`absolute inset-0 pointer-events-none ${isDark ? 'aurora-bg' : 'aurora-bg-light'} opacity-50`} />
      <div className="max-w-7xl mx-auto relative z-10">
        {children}
      </div>
    </section>
  );
}
