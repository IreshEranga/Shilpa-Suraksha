import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import TeacherNavbar from './shared/TeacherNavbar';
import AcademicRecords from './records/AcademicRecords';
import AttendanceRecords from './records/AttendanceRecords';
import BehavioralRecords from './records/BehavioralRecords';
import './RecordsManagement.css';

const RecordsManagement = ({ user, onLogout }) => {
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [activeTab, setActiveTab] = useState('academic');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    try {
      const res = await api.get('/teachers/students');
      setStudents(res.data);
    } catch (error) {
      console.error('Error fetching students:', error);
      alert('Error loading students');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="records-management">
        <TeacherNavbar user={user} onLogout={onLogout} />
        <div className="container">
          <div className="loading">Loading students...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="records-management">
      <TeacherNavbar user={user} onLogout={onLogout} />

      <div className="container">
        <div className="page-header">
          <h2>Manage Records</h2>
          <p>Select a student to view and manage their records</p>
        </div>

        <div className="card">
          <h3>Select Student</h3>
          <select 
            className="input input-large"
            value={selectedStudent || ''}
            onChange={(e) => setSelectedStudent(e.target.value)}
          >
            <option value="">-- Select a student --</option>
            {students.map(student => (
              <option key={student.id} value={student.id}>
                {student.name} ({student.student_id})
              </option>
            ))}
          </select>
        </div>

        {selectedStudent && (
          <>
            <div className="tabs">
              <button 
                className={activeTab === 'academic' ? 'tab active' : 'tab'}
                onClick={() => setActiveTab('academic')}
              >
                📚 Academic Records
              </button>
              <button 
                className={activeTab === 'attendance' ? 'tab active' : 'tab'}
                onClick={() => setActiveTab('attendance')}
              >
                ✅ Attendance
              </button>
              <button 
                className={activeTab === 'behavioral' ? 'tab active' : 'tab'}
                onClick={() => setActiveTab('behavioral')}
              >
                🎭 Behavioral Records
              </button>
            </div>

            {activeTab === 'academic' && (
              <AcademicRecords studentId={selectedStudent} />
            )}

            {activeTab === 'attendance' && (
              <AttendanceRecords studentId={selectedStudent} />
            )}

            {activeTab === 'behavioral' && (
              <BehavioralRecords studentId={selectedStudent} />
            )}
          </>
        )}

        {!selectedStudent && students.length > 0 && (
          <div className="card info-card">
            <p>👆 Please select a student from the dropdown above to view and manage their records.</p>
          </div>
        )}

        {students.length === 0 && (
          <div className="card info-card">
            <p>No students found. Please register students first.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecordsManagement;

