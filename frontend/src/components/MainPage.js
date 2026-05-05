import React from 'react';
import { Link } from 'react-router-dom';
import logo from '../assets/ShilpaSuraksha_LOGO.png';
import heroIllustration from '../assets/HeroSection.png';
import './MainPage.css';

const MainPage = () => {
  return (
    <div className="main-page">
      {/* Navbar */}
      <nav className="main-nav">
        <div className="nav-brand">
          <img src={logo} alt="Shilpa Suraksha" className="nav-logo" />
          <span className="nav-title">Shilpa Suraksha</span>
        </div>
        <div className="nav-actions">
          <Link to="/login" className="btn btn-ghost">Login</Link>
          <Link to="/register-school" className="btn btn-accent">Register School</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="main-hero">
        <div className="hero-bg-pattern" aria-hidden="true" />
        <div className="hero-content">
          <div className="hero-text">
            <span className="hero-badge">AI-Powered Education Platform</span>
            <h1 className="hero-title">
              Shilpa<br />
              <span className="hero-title-accent">Suraksha</span>
            </h1>
            <p className="hero-subtitle">
              Early detection, personalized support, and measurable improvement
              for primary school students across Sri Lanka.
            </p>
            <div className="hero-actions">
              <Link to="/login" className="btn btn-primary btn-large">
                <span>Login to Dashboard</span>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M4 10h12M10 4l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </Link>
              <Link to="/register-school" className="btn btn-outline btn-large">
                Register Your School
              </Link>
            </div>
            <div className="hero-stats">
              <div className="stat">
                <span className="stat-value">98%</span>
                <span className="stat-label">Detection Accuracy</span>
              </div>
              <div className="stat-divider" />
              <div className="stat">
                <span className="stat-value">3x</span>
                <span className="stat-label">Faster Intervention</span>
              </div>
              <div className="stat-divider" />
              <div className="stat">
                <span className="stat-value">500+</span>
                <span className="stat-label">Schools Supported</span>
              </div>
            </div>
          </div>
          <div className="hero-visual">
            <div className="hero-image-frame">
              <img src={heroIllustration} alt="Students learning" className="hero-illustration" />
              <div className="hero-card hero-card-top">
                <div className="card-icon">📊</div>
                <div>
                  <div className="card-label">Risk Alerts Today</div>
                  <div className="card-value">12 students flagged</div>
                </div>
              </div>
              <div className="hero-card hero-card-bottom">
                <div className="card-icon">✅</div>
                <div>
                  <div className="card-label">Interventions Active</div>
                  <div className="card-value">47 in progress</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="features-section">
        <div className="container">
          <div className="section-header">
            <span className="section-tag">Core Capabilities</span>
            <h2 className="section-title">Everything you need to support every student</h2>
          </div>
          <div className="features-grid">
            {[
              {
                icon: '🔔',
                color: 'var(--amber)',
                title: 'Early Warning System',
                desc: 'Automatically identify at-risk students using AI analysis of academic, attendance, and behavioral data before problems escalate.'
              },
              {
                icon: '💬',
                color: 'var(--teal)',
                title: 'Emotion & Behavioral Analysis',
                desc: 'Detect emotional indicators and behavioral patterns to provide holistic student support beyond academics.'
              },
              {
                icon: '🧠',
                color: 'var(--rose)',
                title: 'Intelligent Recommendations',
                desc: 'Generate personalized learning paths and intervention strategies tailored to each student\'s unique needs and strengths.'
              },
              {
                icon: '🤝',
                color: 'var(--indigo)',
                title: 'Intervention Orchestrator',
                desc: 'Cluster students with similar needs and suggest coordinated group-based or individual intervention plans.'
              }
            ].map((f, i) => (
              <div className="feature-card" key={i} style={{ '--accent': f.color }}>
                <div className="feature-icon">{f.icon}</div>
                <h3 className="feature-title">{f.title}</h3>
                <p className="feature-desc">{f.desc}</p>
                <div className="feature-line" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="main-footer">
        <div className="container">
          <div className="footer-brand">
            <img src={logo} alt="Logo" className="footer-logo" />
            <span>Shilpa Suraksha</span>
          </div>
          <p className="footer-copy">© 2025 Shilpa Suraksha. Supporting Sri Lankan Education.</p>
        </div>
      </footer>
    </div>
  );
};

export default MainPage;