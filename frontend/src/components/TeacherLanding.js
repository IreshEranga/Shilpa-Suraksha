import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import TeacherNavbar from './shared/TeacherNavbar';
import './TeacherLanding.css';

const TeacherLanding = ({ user, onLogout }) => {
  const navigate = useNavigate();
  const [landingData, setLandingData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLandingData();
  }, []);

  const fetchLandingData = async () => {
    try {
      const res = await api.get('/teachers/landing');
      setLandingData(res.data);
    } catch (error) {
      console.error('Error fetching landing data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!landingData || !landingData.classroom) {
    return (
      <div className="teacher-landing">
        <TeacherNavbar user={user} onLogout={onLogout} />
        <div className="container">
          <div className="card">
            <h2>No Classroom Assigned</h2>
            <p>Please contact your school administrator to assign you to a classroom.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="teacher-landing">
      <TeacherNavbar user={user} onLogout={onLogout} />

      <div className="container">
        <div className="landing-header">
          <div>
            <h2>{landingData.classroom.name}</h2>
            <p>Grade {landingData.classroom.grade}</p>
          </div>
          <div className="header-stats">
            <div className="stat-item">
              <span className="stat-label">Students</span>
              <span className="stat-value">{landingData.statistics.total_students}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">At-Risk</span>
              <span className="stat-value warning">{landingData.statistics.at_risk_students}</span>
            </div>
          </div>
        </div>

        <div className="quick-actions">
          <Link to="/teacher/students" className="action-card">
            <h3>Register Students</h3>
            <p>Add new students to your class</p>
          </Link>
          <Link to="/teacher/records" className="action-card">
            <h3>Manage Records</h3>
            <p>Add academic, attendance, and behavioral records</p>
          </Link>
          <Link to="/teacher/guidance" className="action-card">
            <h3>Guidance Page</h3>
            <p>View at-risk students requiring support</p>
          </Link>
          <Link to="/teacher/improvement" className="action-card">
            <h3>Improvement Dashboard</h3>
            <p>Track student progress and interventions</p>
          </Link>
        </div>

        <div className="card">
          <h2>Recent Students</h2>
          {landingData.students.length === 0 ? (
            <p>No students registered yet. Click "Register Students" to add students.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Student ID</th>
                  <th>Name</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {landingData.students.slice(0, 10).map(student => (
                  <tr key={student.id}>
                    <td>{student.student_id}</td>
                    <td>{student.name}</td>
                    <td>
                      <Link to={`/teacher/students/${student.id}`} className="btn btn-small">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default TeacherLanding;

