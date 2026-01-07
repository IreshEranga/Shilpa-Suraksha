import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import './RecordsTab.css';

const AcademicRecords = ({ studentId }) => {
  const [records, setRecords] = useState([]);
  const [formData, setFormData] = useState({
    subject: '',
    score: '',
    max_score: '100',
    exam_type: 'General',
    exam_date: new Date().toISOString().split('T')[0]
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
      const res = await api.get(`/academic/student/${studentId}`);
      setRecords(res.data);
    } catch (error) {
      console.error('Error fetching records:', error);
      alert('Error loading academic records');
    } finally {
      setFetching(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/teachers/academic-records', {
        student_id: studentId,
        ...formData
      });
      setFormData({
        subject: '',
        score: '',
        max_score: '100',
        exam_type: 'General',
        exam_date: new Date().toISOString().split('T')[0]
      });
      fetchRecords();
      alert('Academic record added successfully!');
    } catch (error) {
      alert(error.response?.data?.error || 'Error adding record');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="records-tab">
      <div className="card">
        <h3>Add Academic Record</h3>
        <form onSubmit={handleSubmit} className="record-form">
          <div className="form-row">
            <div className="form-group">
              <label>Subject *</label>
              <input
                type="text"
                className="input"
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                required
                placeholder="e.g., Mathematics"
              />
            </div>
            <div className="form-group">
              <label>Score</label>
              <input
                type="number"
                className="input"
                value={formData.score}
                onChange={(e) => setFormData({ ...formData, score: e.target.value })}
                placeholder="0-100"
                min="0"
                max="100"
              />
            </div>
            <div className="form-group">
              <label>Max Score</label>
              <input
                type="number"
                className="input"
                value={formData.max_score}
                onChange={(e) => setFormData({ ...formData, max_score: e.target.value })}
                placeholder="100"
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Exam Type</label>
              <input
                type="text"
                className="input"
                value={formData.exam_type}
                onChange={(e) => setFormData({ ...formData, exam_type: e.target.value })}
                placeholder="e.g., Monthly Test, Final Exam"
              />
            </div>
            <div className="form-group">
              <label>Exam Date</label>
              <input
                type="date"
                className="input"
                value={formData.exam_date}
                onChange={(e) => setFormData({ ...formData, exam_date: e.target.value })}
                required
              />
            </div>
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Adding...' : 'Add Record'}
          </button>
        </form>
      </div>

      <div className="card">
        <h3>Academic Records</h3>
        {fetching ? (
          <p>Loading records...</p>
        ) : records.length === 0 ? (
          <p className="no-data">No academic records found. Add a record above.</p>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Score</th>
                  <th>Max Score</th>
                  <th>Percentage</th>
                  <th>Exam Type</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {records.map(record => {
                  const percentage = record.max_score > 0 
                    ? ((record.score / record.max_score) * 100).toFixed(1) 
                    : '0';
                  return (
                    <tr key={record.id}>
                      <td>{record.subject}</td>
                      <td>{record.score}</td>
                      <td>{record.max_score}</td>
                      <td>
                        <span className={`percentage ${percentage < 50 ? 'low' : percentage < 70 ? 'medium' : 'high'}`}>
                          {percentage}%
                        </span>
                      </td>
                      <td>{record.exam_type || '-'}</td>
                      <td>{new Date(record.exam_date).toLocaleDateString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AcademicRecords;

