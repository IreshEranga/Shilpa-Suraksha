import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import TeacherNavbar from './shared/TeacherNavbar';
import './LearningPaths.css';

const LearningPaths = ({ user, onLogout }) => {
  const [learningPaths, setLearningPaths] = useState([]);
  const [selectedPath, setSelectedPath] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchLearningPaths();
  }, []);

  const safeParseJson = (value) => {
    if (!value) return null;
    if (typeof value === 'object') return value;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }
    return null;
  };

  const fetchLearningPaths = async () => {
    try {
      setError(null);

      // Preferred: fetch all learning paths for this teacher in one call
      const res = await api.get('/learning-paths/teacher');
      const normalized = (res.data || []).map((p) => ({
        ...p,
        resources: safeParseJson(p.resources) || p.resources
      }));
      setLearningPaths(normalized);
    } catch (error) {
      // Fallback to old multi-call flow if the server doesn't support /teacher yet
      try {
        const teacherId = user?.id;
        if (!teacherId) throw error;

        const classesRes = await api.get(`/classes/teacher/${teacherId}`);
        const classes = classesRes.data || [];

        let allWeakStudents = [];
        for (const classItem of classes) {
          const weakRes = await api.get(`/weak-students/class/${classItem.id}`);
          allWeakStudents = [...allWeakStudents, ...(weakRes.data || [])];
        }

        let allPaths = [];
        for (const weakStudent of allWeakStudents) {
          try {
            const pathsRes = await api.get(`/learning-paths/student/${weakStudent.student_id}`);
            allPaths = [...allPaths, ...(pathsRes.data || [])];
          } catch (e) {
            console.error(`Error fetching paths for student ${weakStudent.student_id}:`, e);
          }
        }

        const normalized = allPaths.map((p) => ({
          ...p,
          resources: safeParseJson(p.resources) || p.resources
        }));
        setLearningPaths(normalized);
      } catch (fallbackError) {
        console.error('Error fetching learning paths:', fallbackError);
        setError(fallbackError?.response?.data?.error || fallbackError?.message || 'Failed to load learning paths');
        setLearningPaths([]);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (pathId, newStatus) => {
    try {
      await api.patch(`/learning-paths/${pathId}`, { status: newStatus });
      fetchLearningPaths();
    } catch (error) {
      alert('Error updating status: ' + (error.response?.data?.error || error.message));
    }
  };

  return (
    <div className="learning-paths">
      <TeacherNavbar user={user} onLogout={onLogout} />

      <div className="container">
        <div className="card">
          <h2>Generated Learning Paths</h2>
          {loading ? (
            <p>Loading...</p>
          ) : error ? (
            <p style={{ color: '#b91c1c' }}>
              {error}
            </p>
          ) : learningPaths.length === 0 ? (
            <p>
              No learning paths generated yet. Generate one from the Guidance page or the Weak Students page.
            </p>
          ) : (
            <div className="paths-list">
              {learningPaths.map(path => (
                <div key={path.id} className="path-item">
                  <div className="path-header">
                    <h3>
                      {path.subject} - {path.section}
                      {path.student_name ? (
                        <span style={{ fontWeight: 400, color: '#6b7280' }}>
                          {' '}• {path.student_name} ({path.student_code || path.student_id})
                        </span>
                      ) : null}
                    </h3>
                    <select
                      value={path.status}
                      onChange={(e) => handleStatusChange(path.id, e.target.value)}
                      className="status-select"
                    >
                      <option value="active">Active</option>
                      <option value="completed">Completed</option>
                      <option value="paused">Paused</option>
                    </select>
                  </div>
                  <div className="path-content">
                    <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                      {path.path_content}
                    </pre>
                  </div>
                  {path.resources && Object.keys(path.resources).length > 0 && (
                    <div className="path-resources">
                      <h4>Additional Resources:</h4>
                      <ul>
                        {Array.isArray(path.resources) ? path.resources.map((res, idx) => (
                          <li key={idx}>{res.type}: {res.content}</li>
                        )) : (
                          <li>Resources available</li>
                        )}
                      </ul>
                    </div>
                  )}
                  <div className="path-footer">
                    <span>Created: {new Date(path.created_at).toLocaleDateString()}</span>
                    {path.updated_at !== path.created_at && (
                      <span>Updated: {new Date(path.updated_at).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LearningPaths;

