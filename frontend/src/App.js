import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import MainPage from './components/MainPage';
import Login from './components/Login';
import SchoolRegistration from './components/SchoolRegistration';
import AdminDashboard from './components/AdminDashboard';
import TeacherLanding from './components/TeacherLanding';
import StudentRegistration from './components/StudentRegistration';
import GuidancePage from './components/GuidancePage';
import ImprovementDashboard from './components/ImprovementDashboard';
import RecordsManagement from './components/RecordsManagement';
import LearningPaths from './components/LearningPaths';
import StudentDetails from './components/StudentDetails';
import './App.css';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');
    const userRole = localStorage.getItem('userRole');
    
    if (token && userData) {
      setIsAuthenticated(true);
      setUser({ ...JSON.parse(userData), role: userRole });
    }
    setLoading(false);
  }, []);

  const handleLogin = (token, userData) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('userRole', userData.role);
    setIsAuthenticated(true);
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('userRole');
    setIsAuthenticated(false);
    setUser(null);
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>Loading...</div>;
  }

  return (
    <Router>
      <Routes>
        {/* Public Routes */}
        <Route 
          path="/" 
          element={
            isAuthenticated ? 
              <Navigate to={user?.role === 'admin' ? '/admin/dashboard' : '/teacher/landing'} /> : 
              <MainPage />
          } 
        />
        <Route 
          path="/login" 
          element={
            isAuthenticated ? 
              <Navigate to={user?.role === 'admin' ? '/admin/dashboard' : '/teacher/landing'} /> : 
              <Login onLogin={handleLogin} />
          } 
        />
        <Route 
          path="/register-school" 
          element={
            isAuthenticated ? 
              <Navigate to="/" /> : 
              <SchoolRegistration />
          } 
        />

        {/* Admin Routes */}
        <Route 
          path="/admin/dashboard" 
          element={
            isAuthenticated && user?.role === 'admin' ? 
              <AdminDashboard user={user} onLogout={handleLogout} /> : 
              <Navigate to="/login" />
          } 
        />

        {/* Teacher Routes */}
        <Route 
          path="/teacher/landing" 
          element={
            isAuthenticated && user?.role === 'teacher' ? 
              <TeacherLanding user={user} onLogout={handleLogout} /> : 
              <Navigate to="/login" />
          } 
        />
        <Route 
          path="/teacher/students" 
          element={
            isAuthenticated && user?.role === 'teacher' ? 
              <StudentRegistration user={user} onLogout={handleLogout} /> : 
              <Navigate to="/login" />
          } 
        />
        <Route 
          path="/teacher/records" 
          element={
            isAuthenticated && user?.role === 'teacher' ? 
              <RecordsManagement user={user} onLogout={handleLogout} /> : 
              <Navigate to="/login" />
          } 
        />
        <Route 
          path="/teacher/guidance" 
          element={
            isAuthenticated && user?.role === 'teacher' ? 
              <GuidancePage user={user} onLogout={handleLogout} /> : 
              <Navigate to="/login" />
          } 
        />
        <Route 
          path="/teacher/improvement" 
          element={
            isAuthenticated && user?.role === 'teacher' ? 
              <ImprovementDashboard user={user} onLogout={handleLogout} /> : 
              <Navigate to="/login" />
          } 
        />
        <Route 
          path="/teacher/learning-paths" 
          element={
            isAuthenticated && user?.role === 'teacher' ? 
              <LearningPaths user={user} onLogout={handleLogout} /> : 
              <Navigate to="/login" />
          } 
        />
        <Route 
          path="/teacher/students/:studentId" 
          element={
            isAuthenticated && user?.role === 'teacher' ? 
              <StudentDetails user={user} onLogout={handleLogout} /> : 
              <Navigate to="/login" />
          } 
        />

        {/* Fallback */}
        <Route 
          path="*" 
          element={<Navigate to={isAuthenticated ? (user?.role === 'admin' ? '/admin/dashboard' : '/teacher/landing') : '/'} />} 
        />
      </Routes>
    </Router>
  );
}

export default App;
