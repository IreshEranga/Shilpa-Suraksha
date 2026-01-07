import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import './RecordsTab.css';

const AttendanceRecords = ({ studentId }) => {
  const [records, setRecords] = useState([]);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    status: 'present'
  });
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (studentId) {
      fetchRecords();
    }
  }, [studentId]);

  const fetchRecords = async () => {
    try {
      setFetching(true);
      const res = await api.get(`/attendance/student/${studentId}`);
      setRecords(res.data);
    } catch (error) {
      console.error('Error fetching attendance:', error);
      alert('Error loading attendance records');
    } finally {
      setFetching(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/teachers/attendance-records', {
        student_id: studentId,
        ...formData
      });
      setFormData({
        date: new Date().toISOString().split('T')[0],
        status: 'present'
      });
      fetchRecords();
      alert('Attendance record added successfully!');
    } catch (error) {
      alert(error.response?.data?.error || 'Error adding attendance');
    } finally {
      setLoading(false);
    }
  };

  const getAttendanceStats = () => {
    const total = records.length;
    const present = records.filter(r => r.status === 'present').length;
    const absent = records.filter(r => r.status === 'absent').length;
    const late = records.filter(r => r.status === 'late').length;
    return { total, present, absent, late, rate: total > 0 ? ((present / total) * 100).toFixed(1) : 0 };
  };

  const stats = getAttendanceStats();

  return (
    <div className="records-tab">
      <div className="stats-grid">
        <div className="stat-card">
          <h4>Total Days</h4>
          <p className="stat-number">{stats.total}</p>
        </div>
        <div className="stat-card">
          <h4>Present</h4>
          <p className="stat-number success">{stats.present}</p>
        </div>
        <div className="stat-card">
          <h4>Absent</h4>
          <p className="stat-number danger">{stats.absent}</p>
        </div>
        <div className="stat-card">
          <h4>Late</h4>
          <p className="stat-number warning">{stats.late}</p>
        </div>
        <div className="stat-card">
          <h4>Attendance Rate</h4>
          <p className="stat-number">{stats.rate}%</p>
        </div>
      </div>

      <div className="card">
        <h3>Add Attendance Record</h3>
        <form onSubmit={handleSubmit} className="record-form">
          <div className="form-row">
            <div className="form-group">
              <label>Date *</label>
              <input
                type="date"
                className="input"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Status *</label>
              <select
                className="input"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                required
              >
                <option value="present">Present</option>
                <option value="absent">Absent</option>
                <option value="late">Late</option>
              </select>
            </div>
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Adding...' : 'Add Record'}
          </button>
        </form>
      </div>

      <div className="card">
        <h3>Attendance Records</h3>
        {fetching ? (
          <p>Loading records...</p>
        ) : records.length === 0 ? (
          <p className="no-data">No attendance records found. Add a record above.</p>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {records.map(record => (
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
          </div>
        )}
      </div>
    </div>
  );
};

export default AttendanceRecords;

