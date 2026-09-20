import Icon from '../components/Icon';
import HomeHeader from './HomeHeader';
import { profile } from '../config/profile';
import Hero from './Hero';
import About from './About';
import Explore from './Explore';
import Contact from './Contact';

export default function Home() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <HomeHeader />

      <main id="main">
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
      </main>

      <footer className="site-footer page-width">
        <div>
          <a className="footer-brand" href="#home">
            <Icon name="cloud" />
            Alicia.
          </a>
          <span>
            © {new Date().getFullYear()} {profile.fullName}
          </span>
        </div>
        <p>
          Logic in code. Poetry in life.<span>✧</span>
        </p>
        <a href="#home">
          Back to top
          <Icon name="arrow" className="up-arrow" />
        </a>
      </footer>
    </>
  );
}
