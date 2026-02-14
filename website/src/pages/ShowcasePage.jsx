import SampleNarrative from '../components/showcase/SampleNarrative';
import Architecture from '../components/showcase/Architecture';
import JsonOutput from '../components/showcase/JsonOutput';
import Footer from '../components/home/Footer';

export default function ShowcasePage() {
  return (
    <div className="pt-16">
      <SampleNarrative />
      <Architecture />
      <JsonOutput />
      <Footer />
    </div>
  );
}
