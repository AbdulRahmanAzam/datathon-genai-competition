import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import Navbar from './components/Navbar';
import HomePage from './pages/HomePage';
import FeaturesPage from './pages/FeaturesPage';
import ShowcasePage from './pages/ShowcasePage';
import LivePage from './pages/LivePage';
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function AppContent() {
  const { isDark } = useTheme();
  return (
    <div className={`min-h-screen transition-colors duration-400 ${isDark ? 'bg-dark-bg text-gray-100' : 'bg-light-bg text-gray-900'}`}>
      <Navbar />
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/showcase" element={<ShowcasePage />} />
        <Route path="/live" element={<LivePage />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </BrowserRouter>
  );
}
