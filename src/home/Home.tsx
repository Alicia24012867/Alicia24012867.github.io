import Icon from '../components/Icon';
import SiteLayout from '../components/layout/SiteLayout';
import Hero from './Hero';
import About from './About';
import Explore from './Explore';
import Contact from './Contact';

export default function Home() {
  return (
    <SiteLayout section="home">
      <Hero />

      <div className="introduction-strip">
        <div className="page-width">
          <span>
            <Icon name="code" />
            Build with code
          </span>
          <i>✧</i>
          <span>
            <Icon name="book" />
            Follow curiosity
          </span>
          <i>✧</i>
          <span>
            <Icon name="heart" />
            Find everyday joy
          </span>
          <span className="strip-ending">
            Nice to meet you <span>↗</span>
          </span>
        </div>
      </div>

      <About />

      <Explore />

      <Contact />
    </SiteLayout>
  );
}
