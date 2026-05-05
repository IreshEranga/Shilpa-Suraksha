import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import api from '../utils/api';
import logo from '../assets/ShilpaSuraksha_LOGO.png';
import loginImage from '../assets/login_page_img.png';
import './Login.css';

const Login = ({ onLogin }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [formData, setFormData] = useState({
    email: location.state?.email || '',
    password: '',
    role: 'teacher'
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await api.post('/auth/login', {
        email: formData.email,
        password: formData.password,
        role: formData.role
      });
      const { token, user } = response.data;
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('userRole', user.role);
      if (user.role === 'admin') navigate('/admin/dashboard');
      else if (user.role === 'teacher') navigate('/teacher/landing');
      else navigate('/dashboard');
      onLogin(token, user);
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      {/* Left Panel */}
      <div className="login-panel login-panel-left">
        <div className="panel-decor" aria-hidden="true" />
        <div className="panel-content">
          <Link to="/" className="panel-brand">
            <img src={logo} alt="Shilpa Suraksha" className="panel-logo" />
            <span>Shilpa Suraksha</span>
          </Link>
          <div className="panel-illustration">
            <img src={loginImage} alt="Education illustration" className="login-image" />
          </div>
          <blockquote className="panel-quote">
            "Every child deserves a champion — an adult who will never give up on them."
          </blockquote>
          <div className="panel-dots">
            <span className="dot dot-active" />
            <span className="dot" />
            <span className="dot" />
          </div>
        </div>
      </div>

      {/* Right Panel */}
      <div className="login-panel login-panel-right">
        <div className="login-form-wrap">
          {/* Mobile logo */}
          <Link to="/" className="mobile-brand">
            <img src={logo} alt="Shilpa Suraksha" />
            <span>Shilpa Suraksha</span>
          </Link>

          <div className="login-header">
            <h1>Welcome back</h1>
            <p>Sign in to continue to your dashboard</p>
          </div>

          {/* Role Toggle */}
          <div className="role-toggle">
            <button
              type="button"
              className={`role-btn ${formData.role === 'teacher' ? 'active' : ''}`}
              onClick={() => setFormData({ ...formData, role: 'teacher' })}
            >
              <span className="role-icon">👩‍🏫</span> Teacher
            </button>
            <button
              type="button"
              className={`role-btn ${formData.role === 'admin' ? 'active' : ''}`}
              onClick={() => setFormData({ ...formData, role: 'admin' })}
            >
              <span className="role-icon">🏫</span> Administrator
            </button>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-field">
              <label htmlFor="email">Email Address</label>
              <div className="input-wrapper">
                <span className="input-icon">
                  <svg viewBox="0 0 20 20" fill="none" width="18" height="18">
                    <path d="M2 4h16v12H2zM2 4l8 7 8-7" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                  </svg>
                </span>
                <input
                  id="email" type="email" name="email"
                  placeholder="you@school.lk"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="form-field">
              <label htmlFor="password">
                Password
                <Link to="/forgot-password" className="forgot-link">Forgot password?</Link>
              </label>
              <div className="input-wrapper">
                <span className="input-icon">
                  <svg viewBox="0 0 20 20" fill="none" width="18" height="18">
                    <rect x="3" y="9" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M6 9V6a4 4 0 018 0v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </span>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="toggle-password"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {error && (
              <div className="error-alert" role="alert">
                <svg viewBox="0 0 20 20" fill="none" width="16" height="16">
                  <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M10 6v4M10 13h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                {error}
              </div>
            )}

            <button type="submit" className="btn-login" disabled={loading}>
              {loading ? (
                <>
                  <span className="spinner" />
                  Signing in…
                </>
              ) : (
                <>
                  Sign In
                  <svg viewBox="0 0 20 20" fill="none" width="18" height="18">
                    <path d="M4 10h12M10 4l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </>
              )}
            </button>
          </form>

          <div className="login-footer">
            <p>New school? <Link to="/register-school">Register here</Link></p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;