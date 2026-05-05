import React, { useState } from 'react';
import api from '../utils/api';
import TeacherNavbar from './shared/TeacherNavbar';
import './StudentRegistration.css';

const INITIAL = { name: '', student_id: '', date_of_birth: '', gender: '' };

const StudentRegistration = ({ user, onLogout }) => {
  const [formData, setFormData] = useState(INITIAL);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/teachers/students', formData);
      setSuccess(true);
      setFormData(INITIAL);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to register student. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="reg-page">
      <TeacherNavbar user={user} onLogout={onLogout} />

      <main className="reg-main">
        {/* Progress breadcrumb */}
        <div className="reg-breadcrumb">
          <span>Students</span>
          <span className="breadcrumb-sep">›</span>
          <span className="breadcrumb-current">Register New Student</span>
        </div>

        <div className="reg-layout">
          {/* Side info */}
          <aside className="reg-aside">
            <div className="aside-card">
              <div className="aside-icon">👤</div>
              <h3>Adding a Student</h3>
              <p>Register your student to start tracking their academic progress and wellbeing.</p>
            </div>
            <div className="aside-steps">
              <div className="step step-active">
                <div className="step-dot" />
                <div>
                  <div className="step-title">Basic Information</div>
                  <div className="step-desc">Name, ID & demographics</div>
                </div>
              </div>
              <div className="step">
                <div className="step-dot" />
                <div>
                  <div className="step-title">Academic Profile</div>
                  <div className="step-desc">Grade & subject tracking</div>
                </div>
              </div>
              <div className="step">
                <div className="step-dot" />
                <div>
                  <div className="step-title">Monitoring Active</div>
                  <div className="step-desc">AI analysis begins</div>
                </div>
              </div>
            </div>
          </aside>

          {/* Form Card */}
          <div className="reg-card">
            <div className="reg-card-header">
              <h2>Student Registration</h2>
              <p>Fill in the details below to add a new student to your class.</p>
            </div>

            <form onSubmit={handleSubmit} className="reg-form">
              <div className="form-section">
                <h4 className="form-section-title">Personal Details</h4>

                <div className="form-field">
                  <label htmlFor="name">
                    Full Name <span className="required">*</span>
                  </label>
                  <input
                    id="name" type="text" name="name"
                    className="input"
                    placeholder="e.g. Nimali Perera"
                    value={formData.name}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="student_id">
                    Student ID <span className="required">*</span>
                  </label>
                  <input
                    id="student_id" type="text" name="student_id"
                    className="input"
                    placeholder="e.g. SS-2025-001"
                    value={formData.student_id}
                    onChange={handleChange}
                    required
                  />
                  <span className="field-hint">Unique ID assigned by the school</span>
                </div>

                <div className="form-row">
                  <div className="form-field">
                    <label htmlFor="date_of_birth">Date of Birth</label>
                    <input
                      id="date_of_birth" type="date" name="date_of_birth"
                      className="input"
                      value={formData.date_of_birth}
                      onChange={handleChange}
                    />
                  </div>

                  <div className="form-field">
                    <label htmlFor="gender">Gender</label>
                    <div className="select-wrapper">
                      <select
                        id="gender" name="gender"
                        className="input"
                        value={formData.gender}
                        onChange={handleChange}
                      >
                        <option value="">Select gender</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                      </select>
                      <span className="select-arrow">▾</span>
                    </div>
                  </div>
                </div>
              </div>

              {error && (
                <div className="error-banner" role="alert">
                  <svg viewBox="0 0 20 20" fill="none" width="18" height="18">
                    <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M10 6v4M10 13h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  {error}
                </div>
              )}

              {success && (
              <div className="success-banner" role="status">
                <span className="success-icon">🎉</span>
                <div>
                  <strong>Student registered successfully!</strong>
                  <p>They've been added to your class and monitoring will begin shortly.</p>
                </div>
              </div>
              )}

              <div className="form-actions">
                <button type="button" className="btn-secondary-action" onClick={() => setFormData(INITIAL)}>
                  Clear Form
                </button>
                <button type="submit" className="btn-submit" disabled={loading}>
                  {loading ? (
                    <>
                      <span className="spinner" /> Registering…
                    </>
                  ) : (
                    <>
                      Register Student
                      <svg viewBox="0 0 20 20" fill="none" width="18" height="18">
                        <path d="M4 10h12M10 4l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </>
                  )}
                </button>
              </div>
              


            </form>
          </div>
        </div>
      </main>
    </div>
  );
};

export default StudentRegistration;