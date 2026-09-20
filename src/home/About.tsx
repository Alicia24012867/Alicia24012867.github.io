import Icon from '../components/Icon';
import { profile } from '../config/profile';

export default function About() {
  return (
    <section
      className="about-section section-space page-width"
      id="about"
      aria-labelledby="about-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">
            <span /> A LITTLE ABOUT ME
          </p>
          <h2 id="about-title">
            Glad you are here<span className="heading-dot">.</span>
          </h2>
        </div>
        <span className="section-aside" lang="en">
          Nice to meet you <span>✳</span>
        </span>
      </div>
      <div className="about-layout">
        <aside className="profile-card">
          <div className="profile-decoration" aria-hidden="true">
            ✧
          </div>
          <div className="avatar">
            <img
              src={`${import.meta.env.BASE_URL}images/summer-sky.webp`}
              alt="Alicia's illustrated avatar with silver-lilac hair and a star hairpin"
              width="1536"
              height="1024"
              loading="lazy"
            />
          </div>
          <span className="profile-sticker">HELLO!</span>
          <h3>{profile.fullName}</h3>
          <a href={profile.github} target="_blank" rel="noreferrer">
            {profile.handle}
          </a>
          <div className="profile-divider" />
          <p>
            <Icon name="book" />
            Student & lifelong learner
          </p>
          <p>
            <Icon name="cloud" />
            Growing at my own pace
          </p>
          <span className="profile-card-footer">
            MORE THAN A README <span>✦</span>
          </span>
        </aside>
        <div className="about-copy">
          <span className="about-hello">
            Hi, I'm Alicia <span aria-hidden="true">👋</span>
          </span>
          <h3>Always asking why.</h3>
          <p>{profile.description}</p>
          <p>
            I am exploring high-performance numerical computing, GPU programming, and ML systems.
            The best part of learning is the moment things finally click.
          </p>
          <div className="skill-list" aria-label="Technical interests">
            {profile.skills.map((skill) => (
              <span key={skill}>{skill}</span>
            ))}
          </div>
          <div className="about-quote">
            <Icon name="sparkles" />
            <p>
              Make sense of complex ideas. <br className="quote-break" />
              Find joy in simple days.
            </p>
          </div>
        </div>
        <div className="now-card">
          <div className="now-card-top">
            <span className="status-dot" />
            Right now<span>NOW</span>
          </div>
          <div className="now-item">
            <span className="now-icon">
              <Icon name="code" />
            </span>
            <div>
              <span>Exploring</span>
              <p>GPU parallelism</p>
            </div>
          </div>
          <div className="now-item">
            <span className="now-icon">
              <Icon name="book" />
            </span>
            <div>
              <span>Learning</span>
              <p>Numerics & ML systems</p>
            </div>
          </div>
          <div className="now-card-bottom">
            <Icon name="cloud" />
            <p>
              A long road ahead. <br />
              Every step counts.
            </p>
            <span aria-hidden="true">✦</span>
          </div>
        </div>
      </div>
    </section>
  );
}
