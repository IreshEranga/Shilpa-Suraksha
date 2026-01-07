import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../utils/api';
import './SchoolRegistration.css';

const SchoolRegistration = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    schoolName: '',
    registrationNumber: '',
    address: '',
    phone: '',
    email: '',
    principalName: '',
    adminName: '',
    adminEmail: '',
    adminPassword: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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

    if (formData.adminPassword !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.adminPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);

    try {
      const response = await api.post('/auth/register-school', {
        schoolName: formData.schoolName,
        registrationNumber: formData.registrationNumber,
        address: formData.address,
        phone: formData.phone,
        email: formData.email,
        principalName: formData.principalName,
        adminName: formData.adminName,
        adminEmail: formData.adminEmail,
        adminPassword: formData.adminPassword
      });

      alert('School registered successfully! Please login with your admin credentials.');
      navigate('/login', { state: { email: formData.adminEmail } });
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="registration-container">
      <div className="registration-card">
        <div className="registration-header">
          <h2>School Registration</h2>
          <p>Register your officially recognized school</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-section">
            <h3>School Information</h3>
            
            <div className="form-group">
              <label>School Name *</label>
              <input
                type="text"
                name="schoolName"
                className="input"
                value={formData.schoolName}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-group">
              <label>Registration Number *</label>
              <input
                type="text"
                name="registrationNumber"
                className="input"
                value={formData.registrationNumber}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-group">
              <label>Address</label>
              <textarea
                name="address"
                className="input"
                value={formData.address}
                onChange={handleChange}
                rows="3"
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Phone</label>
                <input
                  type="tel"
                  name="phone"
                  className="input"
                  value={formData.phone}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  name="email"
                  className="input"
                  value={formData.email}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Principal Name</label>
              <input
                type="text"
                name="principalName"
                className="input"
                value={formData.principalName}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="form-section">
            <h3>Administrator Account</h3>
            
            <div className="form-group">
              <label>Administrator Name *</label>
              <input
                type="text"
                name="adminName"
                className="input"
                value={formData.adminName}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-group">
              <label>Administrator Email *</label>
              <input
                type="email"
                name="adminEmail"
                className="input"
                value={formData.adminEmail}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Password *</label>
                <input
                  type="password"
                  name="adminPassword"
                  className="input"
                  value={formData.adminPassword}
                  onChange={handleChange}
                  required
                  minLength="8"
                />
              </div>

              <div className="form-group">
                <label>Confirm Password *</label>
                <input
                  type="password"
                  name="confirmPassword"
                  className="input"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Registering...' : 'Register School'}
          </button>

          <div className="form-footer">
            <p>Already have an account? <Link to="/login">Login here</Link></p>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SchoolRegistration;

