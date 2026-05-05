import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import './TeacherNavbar.css';

const TeacherNavbar = ({ user, onLogout }) => {
  const location = useLocation();

  const navItems = [
    { path: '/teacher/landing', label: 'Dashboard', icon: '📊' },
    { path: '/teacher/students', label: 'Students', icon: '👥' },
    { path: '/teacher/records', label: 'Records', icon: '📝' },
    { path: '/teacher/guidance', label: 'Guidance', icon: '⚠️' },
    { path: '/teacher/learning-paths', label: 'Learning Paths', icon: '📚' },
    { path: '/teacher/improvement', label: 'Improvement', icon: '📈' }
  ];

  return (
    <nav className="teacher-navbar">
      <div className="nav-content">
        <div className="nav-left">
          <Link to="/teacher/landing" className="nav-logo">
            <h1>Teacher Portal</h1>
          </Link>
          <div className="nav-items">
            {navItems.map(item => (
              <Link
                key={item.path}
                to={item.path}
                className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </Link>
            ))}
          </div>
        </div>
        <div className="nav-right">
          <span className="welcome-text">Welcome, {user?.name || 'Teacher'}</span>
          <button onClick={onLogout} className="btn btn-secondary btn-logout">
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
};

export default TeacherNavbar;

