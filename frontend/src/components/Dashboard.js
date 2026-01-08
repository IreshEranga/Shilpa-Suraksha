import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import './Dashboard.css';

const Dashboard = ({ teacher, onLogout }) => {
  const [classes, setClasses] = useState([]);
  const [weakStudentsCount, setWeakStudentsCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      // Get teacher's classes
      const classesRes = await api.get(`/classes/teacher/${teacher.id}`);
      setClasses(classesRes.data);

      // Get weak students count
      let totalWeak = 0;
      for (const classItem of classesRes.data) {
        const weakRes = await api.get(`/weak-students/class/${classItem.id}`);
        totalWeak += weakRes.data.length;
      }
      setWeakStudentsCount(totalWeak);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dashboard">
      <nav className="navbar">
        <div className="nav-content">
          <h1>Teacher Dashboard</h1>
          <div className="nav-right">
            <span>Welcome, {teacher.name}</span>
            <button onClick={onLogout} className="btn btn-secondary">Logout</button>
          </div>
        </div>
      </nav>

      <div className="container">
        <div className="stats-grid">
          <div className="stat-card">
            <h3>My Classes</h3>
            <p className="stat-number">{classes.length}</p>
          </div>
          <div className="stat-card">
            <h3>Weak Students</h3>
            <p className="stat-number">{weakStudentsCount}</p>
          </div>
        </div>

        <div className="card">
          <h2>My Classes</h2>
          {loading ? (
            <p>Loading...</p>
          ) : classes.length === 0 ? (
            <p>No classes assigned yet.</p>
          ) : (
            <div className="classes-list">
              {classes.map((classItem) => (
                <div key={classItem.id} className="class-item">
                  <div>
                    <h3>{classItem.name}</h3>
                    <p>Grade {classItem.grade}</p>
                  </div>
                  <div>
                    <Link to={`/weak-students?classId=${classItem.id}`} className="btn btn-primary">
                      View Weak Students
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h2>Quick Actions</h2>
          <div className="actions-grid">
            <Link to="/weak-students" className="action-card">
              <h3>Identify Weak Students</h3>
              <p>Use ML models to identify students who need extra help</p>
            </Link>
            <Link to="/learning-paths" className="action-card">
              <h3>Learning Paths</h3>
              <p>View and manage learning paths for weak students</p>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

