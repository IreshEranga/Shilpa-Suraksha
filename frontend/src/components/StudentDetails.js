import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../utils/api';
import TeacherNavbar from './shared/TeacherNavbar';
import './StudentDetails.css';

const StudentDetails = ({ user, onLogout }) => {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const [student, setStudent] = useState(null);
  const [academicRecords, setAcademicRecords] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [behavioralRecords, setBehavioralRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchStudentDetails();
  }, [studentId]);

  const fetchStudentDetails = async () => {
    try {
      setLoading(true);
      
      // Fetch student details
      const studentRes = await api.get(`/students/${studentId}`);
      setStudent(studentRes.data);

      // Fetch academic records
      try {
        const academicRes = await api.get(`/academic/student/${studentId}`);
        setAcademicRecords(academicRes.data);
      } catch (error) {
        console.error('Error fetching academic records:', error);
      }

      // Fetch attendance records
      try {
        const attendanceRes = await api.get(`/attendance/student/${studentId}`);
        setAttendanceRecords(attendanceRes.data);
      } catch (error) {
        console.error('Error fetching attendance records:', error);
      }

      // Fetch behavioral records
      try {
        const behavioralRes = await api.get(`/behavioral/student/${studentId}`);
        setBehavioralRecords(behavioralRes.data);
      } catch (error) {
        console.error('Error fetching behavioral records:', error);
      }
    } catch (error) {
      console.error('Error fetching student details:', error);
      alert('Error loading student details');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteStudent = async () => {
    const ok = window.confirm('Are you sure you want to remove this student? This will delete their records too.');
    if (!ok) return;
    setDeleting(true);
    try {
      await api.delete(`/teachers/students/${studentId}`);
      alert('Student removed successfully');
      navigate('/teacher/landing');
    } catch (error) {
      alert('Failed to remove student: ' + (error.response?.data?.error || error.message));
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="student-details">
        <TeacherNavbar user={user} onLogout={onLogout} />
        <div className="container">
          <div className="loading">Loading student details...</div>
        </div>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="student-details">
        <TeacherNavbar user={user} onLogout={onLogout} />
        <div className="container">
          <div className="card">
            <h2>Student Not Found</h2>
            <p>The student you're looking for doesn't exist.</p>
            <Link to="/teacher/landing" className="btn btn-primary">Back to Dashboard</Link>
          </div>
        </div>
      </div>
    );
  }

  // Calculate statistics
  const totalDays = attendanceRecords.length;
  const presentDays = attendanceRecords.filter(r => r.status === 'present').length;
  const attendanceRate = totalDays > 0 ? ((presentDays / totalDays) * 100).toFixed(1) : '0.0';
  
  // Calculate average score as percentage (score/max_score * 100) for each record, then average
  const avgScore = academicRecords.length > 0
    ? (academicRecords.reduce((sum, r) => {
        const score = parseFloat(r.score) || 0;
        const maxScore = parseFloat(r.max_score) || 100; // Default to 100 if max_score is missing
        const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
        return sum + percentage;
      }, 0) / academicRecords.length).toFixed(1)
    : '0.0';

  return (
    <div className="student-details">
      <TeacherNavbar user={user} onLogout={onLogout} />

      <div className="container">
        <div className="page-header">
          <button onClick={() => navigate(-1)} className="back-button">
            ← Back
          </button>
          <div>
            <h1>{student.name}</h1>
            <p className="subtitle">Student ID: {student.student_id}</p>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <button onClick={handleDeleteStudent} className="btn btn-danger" disabled={deleting}>
              {deleting ? 'Removing...' : 'Remove Student'}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="tabs">
          <button
            className={activeTab === 'overview' ? 'tab active' : 'tab'}
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </button>
          <button
            className={activeTab === 'academic' ? 'tab active' : 'tab'}
            onClick={() => setActiveTab('academic')}
          >
            Academic Records
          </button>
          <button
            className={activeTab === 'attendance' ? 'tab active' : 'tab'}
            onClick={() => setActiveTab('attendance')}
          >
            Attendance
          </button>
          <button
            className={activeTab === 'behavioral' ? 'tab active' : 'tab'}
            onClick={() => setActiveTab('behavioral')}
          >
            Behavioral Records
          </button>
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="tab-content">
            <div className="stats-grid">
              <div className="stat-card">
                <h3>Attendance Rate</h3>
                <p className="stat-value">
                  {totalDays > 0 ? `${attendanceRate}%` : 'N/A'}
                </p>
                <p className="stat-detail">
                  {totalDays > 0 ? `${presentDays} of ${totalDays} days` : 'No attendance records'}
                </p>
              </div>
              <div className="stat-card">
                <h3>Average Score</h3>
                <p className="stat-value">
                  {academicRecords.length > 0 ? `${avgScore}%` : 'N/A'}
                </p>
                <p className="stat-detail">
                  {academicRecords.length > 0 ? `${academicRecords.length} record${academicRecords.length !== 1 ? 's' : ''}` : 'No academic records'}
                </p>
              </div>
              <div className="stat-card">
                <h3>Behavioral Records</h3>
                <p className="stat-value">{behavioralRecords.length}</p>
                <p className="stat-detail">
                  {behavioralRecords.length === 1 ? 'Total observation' : 'Total observations'}
                </p>
              </div>
            </div>

            <div className="card">
              <h2>Student Information</h2>
              <div className="info-grid">
                <div className="info-item">
                  <label>Name:</label>
                  <span>{student.name}</span>
                </div>
                <div className="info-item">
                  <label>Student ID:</label>
                  <span>{student.student_id}</span>
                </div>
                {student.date_of_birth && (
                  <div className="info-item">
                    <label>Date of Birth:</label>
                    <span>{new Date(student.date_of_birth).toLocaleDateString()}</span>
                  </div>
                )}
                {student.gender && (
                  <div className="info-item">
                    <label>Gender:</label>
                    <span>{student.gender}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Academic Records Tab */}
        {activeTab === 'academic' && (
          <div className="tab-content">
            <div className="card">
              <h2>Academic Records</h2>
              {academicRecords.length === 0 ? (
                <p className="no-data">No academic records found.</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Subject</th>
                      <th>Score</th>
                      <th>Max Score</th>
                      <th>Exam Type</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {academicRecords.map(record => (
                      <tr key={record.id}>
                        <td>{record.subject}</td>
                        <td>{record.score}</td>
                        <td>{record.max_score}</td>
                        <td>{record.exam_type || '-'}</td>
                        <td>{new Date(record.exam_date).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* Attendance Tab */}
        {activeTab === 'attendance' && (
          <div className="tab-content">
            <div className="card">
              <h2>Attendance Records</h2>
              {attendanceRecords.length === 0 ? (
                <p className="no-data">No attendance records found.</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendanceRecords.map(record => (
                      <tr key={record.id}>
                        <td>{new Date(record.date).toLocaleDateString()}</td>
                        <td>
                          <span className={`badge badge-${record.status}`}>
                            {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* Behavioral Records Tab */}
        {activeTab === 'behavioral' && (
          <div className="tab-content">
            <div className="card">
              <h2>Behavioral Records</h2>
              {behavioralRecords.length === 0 ? (
                <p className="no-data">No behavioral records found.</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Category</th>
                      <th>Severity</th>
                      <th>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {behavioralRecords.map(record => (
                      <tr key={record.id}>
                        <td>{new Date(record.observation_date).toLocaleDateString()}</td>
                        <td>
                          <span className={`badge badge-${record.behavior_type}`}>
                            {record.behavior_type.charAt(0).toUpperCase() + record.behavior_type.slice(1)}
                          </span>
                        </td>
                        <td>{record.category || '-'}</td>
                        <td>{record.severity}</td>
                        <td>{record.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="card">
          <h2>Quick Actions</h2>
          <div className="action-buttons">
            <Link to={`/teacher/records?studentId=${student.id}`} className="btn btn-primary">
              Manage Records
            </Link>
            <Link to="/teacher/guidance" className="btn btn-secondary">
              View in Guidance Page
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentDetails;

