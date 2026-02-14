import CharacterMemory from '../components/features/CharacterMemory';
import ActionSystem from '../components/features/ActionSystem';
import ReasoningLayer from '../components/features/ReasoningLayer';
import StoryArc from '../components/features/StoryArc';
import Footer from '../components/home/Footer';

export default function FeaturesPage() {
  return (
    <div className="pt-16">
      <CharacterMemory />
      <ActionSystem />
      <ReasoningLayer />
      <StoryArc />
      <Footer />
    </div>
  );
}
