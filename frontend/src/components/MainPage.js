import React from 'react';
import { Link } from 'react-router-dom';
import './MainPage.css';

const MainPage = () => {
  return (
    <div className="main-page">
      <div className="main-hero">
        <div className="hero-content">
          <h1>Shilpa Suraksha</h1>
          <p className="hero-subtitle">AI-Powered Academic Risk Prediction and Intervention System</p>
          <p className="hero-description">
            Supporting early detection, personalized support, and measurable improvement 
            for primary school students in Sri Lanka
          </p>
          <div className="hero-actions">
            <Link to="/login" className="btn btn-primary btn-large">
              Login
            </Link>
            <Link to="/register-school" className="btn btn-secondary btn-large">
              Register School
            </Link>
          </div>
        </div>
      </div>

      <div className="features-section">
        <div className="container">
          <h2>System Features</h2>
          <div className="features-grid">
            <div className="feature-card">
              <h3>Early Warning System</h3>
              <p>Automatically identify students at risk using AI-powered analysis of academic, attendance, and behavioral data.</p>
            </div>
            <div className="feature-card">
              <h3>Emotion & Behavioral Analysis</h3>
              <p>Detect emotional indicators and behavioral patterns to provide comprehensive student support.</p>
            </div>
            <div className="feature-card">
              <h3>Intelligent Recommendations</h3>
              <p>Generate personalized learning paths and intervention strategies tailored to each student's needs.</p>
            </div>
            <div className="feature-card">
              <h3>Intervention Orchestrator</h3>
              <p>Cluster students with similar needs and suggest group-based or individual interventions.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MainPage;

