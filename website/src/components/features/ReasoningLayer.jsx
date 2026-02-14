import { useTheme } from '../../context/ThemeContext';
import { reasoningExample } from '../../data/storyData';
import SectionWrapper from '../SectionWrapper';
import ScrollReveal from '../ScrollReveal';
import { motion } from 'framer-motion';
import { useRef, useState, useEffect } from 'react';

function TypewriterText({ text, delay = 0, speed = 30 }) {
  const [displayed, setDisplayed] = useState('');
  const [started, setStarted] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setStarted(true); },
      { threshold: 0.5 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!started) return;
    const timeout = setTimeout(() => {
      let i = 0;
      const interval = setInterval(() => {
        setDisplayed(text.slice(0, i + 1));
        i++;
        if (i >= text.length) clearInterval(interval);
      }, speed);
      return () => clearInterval(interval);
    }, delay);
    return () => clearTimeout(timeout);
  }, [started, text, delay, speed]);

  return <span ref={ref}>{displayed}<span className="animate-pulse">|</span></span>;
}

export default function ReasoningLayer() {
  const { isDark } = useTheme();
  const r = reasoningExample.reasoning;

  const steps = [
    { label: 'Observations', value: r.observations, color: '#82B1FF' },
    { label: 'Thoughts', value: r.thoughts, color: '#B388FF' },
    { label: 'Emotional State', value: r.emotional_state, color: '#FF80AB' },
    { label: 'Decision', value: r.decision, color: '#69F0AE' },
  ];

  return (
    <SectionWrapper id="reasoning" dark>
      <ScrollReveal>
        <div className="text-center mb-12">
          <h2 className={`text-4xl sm:text-5xl font-bold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Reasoning <span className="text-gradient">Layer</span>
          </h2>
          <p className={`text-lg max-w-2xl mx-auto ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            Characters reason through observations, thoughts, and emotions before deciding
          </p>
        </div>
      </ScrollReveal>

      <div className="max-w-3xl mx-auto">
        {/* Character label */}
        <ScrollReveal>
          <div className={`flex items-center gap-3 mb-6 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
            <div className="w-10 h-10 rounded-full bg-[#64B5F6] flex items-center justify-center text-white font-bold">A</div>
            <div>
              <p className="font-semibold">{reasoningExample.character}</p>
              <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Structured Reasoning Output</p>
            </div>
          </div>
        </ScrollReveal>

        {/* Reasoning steps */}
        <div className={`rounded-2xl overflow-hidden ${isDark ? 'bg-dark-card border border-white/5' : 'bg-white border border-gray-200'}`}>
          {/* Terminal header */}
          <div className={`flex items-center gap-2 px-4 py-2 ${isDark ? 'bg-dark-bg/50' : 'bg-gray-50'}`}>
            <div className="w-3 h-3 rounded-full bg-red-500/80" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
            <div className="w-3 h-3 rounded-full bg-green-500/80" />
            <span className={`text-xs ml-2 font-mono ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>reasoning_output.json</span>
          </div>

          <div className="p-6 font-mono text-sm space-y-4">
            <span className={isDark ? 'text-gray-500' : 'text-gray-400'}>{'{'}</span>
            {steps.map((step, i) => (
              <ScrollReveal key={step.label} delay={i * 0.15}>
                <div className="ml-4">
                  <span style={{ color: step.color }} className="font-semibold">"{step.label.toLowerCase()}"</span>
                  <span className={isDark ? 'text-gray-500' : 'text-gray-400'}>: "</span>
                  <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>
                    <TypewriterText text={step.value} delay={i * 800} speed={20} />
                  </span>
                  <span className={isDark ? 'text-gray-500' : 'text-gray-400'}>"</span>
                  {i < steps.length - 1 && <span className={isDark ? 'text-gray-500' : 'text-gray-400'}>,</span>}
                </div>
              </ScrollReveal>
            ))}
            <span className={isDark ? 'text-gray-500' : 'text-gray-400'}>{'}'}</span>
          </div>
        </div>
      </div>
    </SectionWrapper>
  );
}
