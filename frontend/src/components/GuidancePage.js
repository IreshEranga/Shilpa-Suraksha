import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import TeacherNavbar from './shared/TeacherNavbar';
import './GuidancePage.css';

const GuidancePage = ({ user, onLogout }) => {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState(() => new Set());
  const [pathModal, setPathModal] = useState({ open: false, student: null, weak_subject: '', weak_section: '' });

  useEffect(() => {
    fetchAtRiskStudents();
  }, []);

  const fetchAtRiskStudents = async () => {
    try {
      const res = await api.get('/components/guidance-page');
      setStudents(res.data.students);
    } catch (error) {
      console.error('Error fetching at-risk students:', error);
    } finally {
      setLoading(false);
    }
  };

  const normalizeRiskFactors = (riskFactors) => {
    if (!riskFactors) return null;
    if (typeof riskFactors === 'string') {
      try {
        return JSON.parse(riskFactors);
      } catch {
        return { raw: riskFactors };
      }
    }
    return riskFactors;
  };

  const formatPercent = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return '-';
    return `${(n * 100).toFixed(1)}%`;
  };

  const toTitle = (s) => (s || '').toString().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  const renderRiskDetails = (student) => {
    const rf = normalizeRiskFactors(student.risk_factors);
    if (!rf) return null;

    const academic = rf.academic || null;
    const attendance = rf.attendance || null;
    const behavioral = rf.behavioral || null;

    const renderBlock = (title, obj) => {
      if (!obj) return null;
      const entries = Object.entries(obj);
      if (!entries.length) return null;

      return (
        <div className="risk-block">
          <div className="risk-block-title">{title}</div>
          <ul className="risk-list">
            {entries.map(([k, v]) => {
              const key = toTitle(k);
              const value = Array.isArray(v) ? v.join(', ') : (typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v));
              return (
                <li key={k}>
                  <span className="risk-k">{key}:</span> <span className="risk-v">{value}</span>
                </li>
              );
            })}
          </ul>
        </div>
      );
    };

    // If the server sent raw JSON, still show it but not ugly
    if (rf.raw) {
      return (
        <div className="risk-block">
          <div className="risk-block-title">Details</div>
          <div className="risk-raw">{String(rf.raw)}</div>
        </div>
      );
    }

    return (
      <div className="risk-details">
        {renderBlock('Academic', academic)}
        {renderBlock('Attendance', attendance)}
        {renderBlock('Behavioral', behavioral)}
        {/* Any extra keys */}
        {Object.keys(rf).filter(k => !['academic', 'attendance', 'behavioral'].includes(k)).map((k) => (
          <div className="risk-block" key={k}>
            <div className="risk-block-title">{toTitle(k)}</div>
            <div className="risk-raw">{typeof rf[k] === 'string' ? rf[k] : JSON.stringify(rf[k], null, 2)}</div>
          </div>
        ))}
      </div>
    );
  };

  const openGeneratePath = (student) => {
    setPathModal({ open: true, student, weak_subject: '', weak_section: '' });
  };

  const submitGeneratePath = async () => {
    const student = pathModal.student;
    const weakSubject = (pathModal.weak_subject || '').trim();
    const weakSection = (pathModal.weak_section || '').trim();
    if (!student || !weakSubject || !weakSection) return;

    try {
      // Use the new personalized learning path endpoint
      await api.post(`/learning-paths/personalized/${student.id}`, {
        weak_subject: weakSubject,
        weak_section: weakSection
      });
      alert('Personalized learning path generated successfully!');
      // Optionally redirect to learning paths page
      window.location.href = '/teacher/learning-paths';
    } catch (error) {
      console.error('Error generating learning path:', error);
      alert('Error generating learning path: ' + (error.response?.data?.error || error.message));
    }
  };

  const getRiskBadgeClass = (riskLevel) => {
    switch (riskLevel) {
      case 'critical': return 'badge-critical';
      case 'high': return 'badge-high';
      case 'medium': return 'badge-medium';
      case 'low': return 'badge-low';
      default: return 'badge-low';
    }
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="guidance-page">
      <TeacherNavbar user={user} onLogout={onLogout} />

      <div className="container">
        <div className="card">
          <div className="card-header">
            <div>
              <h2>At-Risk Students</h2>
              <p className="subtitle">Students flagged by Early Warning / Emotion & Behavioral analysis</p>
            </div>
            <button 
              onClick={async () => {
                setRunning(true);
                try {
                  await api.post('/components/early-warning');
                  await fetchAtRiskStudents();
                } catch (e) {
                  alert(e.response?.data?.error || e.message || 'Failed to run analysis');
                } finally {
                  setRunning(false);
                }
              }}
              className="btn btn-primary"
              disabled={running}
            >
              {running ? 'Running...' : 'Run Early Warning Analysis'}
            </button>
          </div>

          {students.length === 0 ? (
            <p>No at-risk students identified yet. Run Early Warning Analysis to identify students.</p>
          ) : (
            <div className="students-grid">
              {students.map(student => (
                <div key={student.id} className="student-card">
                  <div className="student-header">
                    <h3>{student.name}</h3>
                    <span className={`badge ${getRiskBadgeClass(student.risk_level)}`}>
                      {student.risk_level}
                    </span>
                  </div>

                  <div className="confidence">
                    <div className="confidence-row">
                      <span className="confidence-label">Confidence</span>
                      <span className="confidence-value">{formatPercent(student.confidence_score)}</span>
                    </div>
                    <div className="confidence-bar">
                      <div className="confidence-fill" style={{ width: `${Math.max(0, Math.min(100, (Number(student.confidence_score) || 0) * 100))}%` }} />
                    </div>
                  </div>

                  <div className="student-info-grid">
                    <div><span className="k">Student ID</span><span className="v">{student.student_id}</span></div>
                    <div><span className="k">Class</span><span className="v">{student.class_name} • Grade {student.grade}</span></div>
                    <div><span className="k">Risk Type</span><span className="v">{toTitle(student.risk_type)}</span></div>
                    <div><span className="k">Identified By</span><span className="v">{toTitle(student.identified_by)}</span></div>
                  </div>

                  <button
                    className="link-button"
                    onClick={() => {
                      const next = new Set(expanded);
                      if (next.has(student.id)) next.delete(student.id);
                      else next.add(student.id);
                      setExpanded(next);
                    }}
                  >
                    {expanded.has(student.id) ? 'Hide risk details' : 'Show risk details'}
                  </button>

                  {expanded.has(student.id) && (
                    <div className="risk-panel">
                      {renderRiskDetails(student)}
                    </div>
                  )}

                  <div className="student-actions">
                    <button 
                      onClick={() => openGeneratePath(student)}
                      className="btn btn-primary"
                    >
                      Generate Learning Path
                    </button>
                    <Link 
                      to={`/teacher/students/${student.id}`}
                      className="btn btn-secondary"
                    >
                      View Details
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {pathModal.open && (
        <div className="modal-backdrop" onClick={() => setPathModal({ open: false, student: null, weak_subject: '', weak_section: '' })}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 style={{ margin: 0 }}>Generate Learning Path</h3>
                <p className="subtitle" style={{ margin: '4px 0 0' }}>{pathModal.student?.name}</p>
              </div>
              <button className="icon-button" onClick={() => setPathModal({ open: false, student: null, weak_subject: '', weak_section: '' })}>✕</button>
            </div>

            <div className="modal-body">
              <label className="field">
                <span>Weak Subject</span>
                <input
                  className="input"
                  value={pathModal.weak_subject}
                  onChange={(e) => setPathModal({ ...pathModal, weak_subject: e.target.value })}
                  placeholder="e.g., Mathematics"
                />
              </label>
              <label className="field">
                <span>Weak Section / Topic</span>
                <input
                  className="input"
                  value={pathModal.weak_section}
                  onChange={(e) => setPathModal({ ...pathModal, weak_section: e.target.value })}
                  placeholder="e.g., Fractions"
                />
              </label>
            </div>

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setPathModal({ open: false, student: null, weak_subject: '', weak_section: '' })}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={submitGeneratePath}
                disabled={!pathModal.weak_subject.trim() || !pathModal.weak_section.trim()}
              >
                Generate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GuidancePage;

