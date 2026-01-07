import React, { useState } from 'react';
import api from '../utils/api';
import TeacherNavbar from './shared/TeacherNavbar';
import './StudentRegistration.css';

const StudentRegistration = ({ user, onLogout }) => {
  const [formData, setFormData] = useState({
    name: '',
    student_id: '',
    date_of_birth: '',
    gender: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await api.post('/teachers/students', formData);
      setSuccess(true);
      setFormData({ name: '', student_id: '', date_of_birth: '', gender: '' });
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to register student');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="student-registration">
      <TeacherNavbar user={user} onLogout={onLogout} />

      <div className="container">
        <div className="card">
          <h2>Add New Student</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Student Name *</label>
              <input
                type="text"
                name="name"
                className="input"
                value={formData.name}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-group">
              <label>Student ID *</label>
              <input
                type="text"
                name="student_id"
                className="input"
                value={formData.student_id}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Date of Birth</label>
                <input
                  type="date"
                  name="date_of_birth"
                  className="input"
                  value={formData.date_of_birth}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group">
                <label>Gender</label>
                <select
                  name="gender"
                  className="input"
                  value={formData.gender}
                  onChange={handleChange}
                >
                  <option value="">Select</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>
            </div>

            {error && <div className="error-message">{error}</div>}
            {success && <div className="success-message">Student registered successfully!</div>}

            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Registering...' : 'Register Student'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default StudentRegistration;

