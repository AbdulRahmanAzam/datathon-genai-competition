import { useTheme } from '../../context/ThemeContext';
import SectionWrapper from '../SectionWrapper';
import ScrollReveal from '../ScrollReveal';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { graphNodes } from '../../data/storyData';
import { motion } from 'framer-motion';
import { FiGitBranch, FiDatabase, FiCode, FiCopy, FiCheck } from 'react-icons/fi';
import { useState } from 'react';

const codeSnippet = `# Narrative Graph (LangGraph)
workflow = StateGraph(StoryState)

workflow.add_node("director_select", director_select_node)
workflow.add_node("character_reason", character_reason_node)
workflow.add_node("process_action", process_action_node)
workflow.add_node("memory_update", memory_update_node)
workflow.add_node("check_conclusion", check_conclusion_node)
workflow.add_node("conclude", conclude_node)

workflow.set_entry_point("director_select")
workflow.add_conditional_edges(
    "check_conclusion",
    route_conclusion,
    {"conclude": "conclude", "continue": "director_select"}
)`;

const techStack = [
  { name: 'LangGraph', desc: 'State machine orchestration for agent flow', icon: FiGitBranch },
  { name: 'Google Gemini', desc: 'LLM backbone for reasoning and generation', icon: FiCode },
  { name: 'Pydantic', desc: 'Structured state management and validation', icon: FiDatabase },
];

export default function Implementation() {
  const { isDark } = useTheme();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(codeSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <SectionWrapper id="implementation">
      <ScrollReveal>
        <div className="text-center mb-16">
          <h2 className={`text-4xl sm:text-5xl font-bold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
            How It's <span className="text-gradient">Built</span>
          </h2>
          <p className={`text-lg max-w-2xl mx-auto ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            A modular multi-agent architecture powered by LangGraph and Google Gemini
          </p>
        </div>
      </ScrollReveal>

      {/* Tech Stack */}
      <ScrollReveal>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          {techStack.map((tech, i) => (
            <motion.div
              key={tech.name}
              whileHover={{ y: -4 }}
              className={`p-6 rounded-2xl text-center ${isDark ? 'card-dark' : 'card-light'}`}
            >
              <tech.icon className="text-primary text-3xl mx-auto mb-3" />
              <h3 className={`text-lg font-bold mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>{tech.name}</h3>
              <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{tech.desc}</p>
            </motion.div>
          ))}
        </div>
      </ScrollReveal>

      {/* Graph Architecture */}
      <ScrollReveal>
        <div className="mb-16">
          <h3 className={`text-2xl font-bold mb-8 text-center ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Graph Architecture
          </h3>
          <div className="flex flex-wrap justify-center gap-4 items-center">
            {graphNodes.map((node, i) => (
              <div key={node.id} className="flex items-center gap-3">
                <motion.div
                  initial={{ scale: 0 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.15, type: 'spring' }}
                  whileHover={{ scale: 1.1 }}
                  className={`group relative px-4 py-3 rounded-xl cursor-default ${isDark ? 'card-dark' : 'card-light'} transition-all`}
                >
                  <span className={`text-sm font-semibold ${isDark ? 'text-neon-purple' : 'text-primary'}`}>
                    {node.label}
                  </span>
                  {/* Tooltip */}
                  <div className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-lg text-xs max-w-48 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 ${
                    isDark ? 'bg-dark-bg text-gray-300 border border-white/10' : 'bg-white text-gray-700 border border-gray-200 shadow-lg'
                  }`}>
                    {node.description}
                  </div>
                </motion.div>
                {i < graphNodes.length - 1 && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.15 + 0.1 }}
                    className="text-primary text-lg"
                  >
                    →
                  </motion.span>
                )}
              </div>
            ))}
          </div>
          <p className={`text-center text-xs mt-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            ↻ Loop continues until conclusion conditions are met
          </p>
        </div>
      </ScrollReveal>

      {/* Code Snippet */}
      <ScrollReveal>
          <div className={`relative rounded-2xl overflow-hidden ${isDark ? 'border border-white/8 bg-dark-card/50' : 'border border-primary/10 bg-white shadow-lg shadow-primary/5'}`}>
          <div className={`flex items-center justify-between px-4 py-2 ${isDark ? 'bg-dark-bg/60' : 'bg-gray-50/80'}`}>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500/80" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
              <div className="w-3 h-3 rounded-full bg-green-500/80" />
              <span className={`text-xs ml-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>narrative_graph.py</span>
            </div>
            <button
              onClick={handleCopy}
              className={`flex items-center gap-1 text-xs px-2 py-1 rounded ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'} transition`}
            >
              {copied ? <><FiCheck size={12} /> Copied</> : <><FiCopy size={12} /> Copy</>}
            </button>
          </div>
          <SyntaxHighlighter
            language="python"
            style={isDark ? vscDarkPlus : vs}
            customStyle={{
              margin: 0,
              padding: '1.5rem',
              fontSize: '0.85rem',
              background: isDark ? '#1E1E2E' : '#FAFAFA',
            }}
          >
            {codeSnippet}
          </SyntaxHighlighter>
        </div>
      </ScrollReveal>
    </SectionWrapper>
  );
}
