import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import TeacherNavbar from './shared/TeacherNavbar';
import './GuidancePage.css';

const GuidancePage = ({ user, onLogout }) => {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState(() => new Set());
  
  const [pathModal, setPathModal] = useState({ 
    open: false, 
    student: null, 
    weak_subject: '', 
    weak_section: '',
    grade_level: '',
    all_subjects_text: '', // <-- NEW: Stores the sentence of all subjects
    isGenerating: false 
  });

  const navigate = useNavigate();

  useEffect(() => {
    fetchAtRiskStudents();
  }, []);

  const fetchAtRiskStudents = async () => {
    try {
      const res = await api.get('/components/guidance-page');
      setStudents(res.data.students || []);
    } catch (error) {
      console.error("Error fetching at-risk students:", error);
    } finally {
      setLoading(false);
    }
  };

  const normalizeRiskFactors = (riskFactors) => {
    if (!riskFactors) return null;
    if (typeof riskFactors === 'string') {
      try { return JSON.parse(riskFactors); } catch { return { raw: riskFactors }; }
    }
    return riskFactors;
  };

  const toTitle = (s) =>
    (s || "")
      .toString()
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

  const renderRiskDetails = (student) => {
    const rf = normalizeRiskFactors(student.risk_factors);
    if (!rf) return null;
    if (rf.raw) {
      return (
        <div className="risk-block">
          <div className="risk-block-title">Details</div>
          <div className="risk-raw">{String(rf.raw)}</div>
        </div>
      );
    }
    const renderBlock = (title, obj) => {
      if (!obj || !Object.keys(obj).length) return null;
      return (
        <div className="risk-block">
          <div className="risk-block-title">{title}</div>
          <ul className="risk-list">
            {Object.entries(obj).map(([k, v]) => (
              <li key={k}><span className="risk-k">{toTitle(k)}:</span> <span className="risk-v">{Array.isArray(v) ? v.join(', ') : String(v)}</span></li>
            ))}
          </ul>
        </div>
      );
    };
    return (
      <div className="risk-details">
        {renderBlock('Academic', rf.academic)}
        {renderBlock('Attendance', rf.attendance)}
        {renderBlock('Behavioral', rf.behavioral)}
      </div>
    );
  };

  const openGeneratePath = async (student) => {
    setPathModal({ 
      open: true, 
      student, 
      weak_subject: 'Searching lowest score...', 
      weak_section: '', 
      grade_level: student.grade || '', 
      all_subjects_text: 'Fetching student subjects...', // <-- NEW: Loading text
      isGenerating: false 
    });

    try {
      const res = await api.get(`/academic/student/${student.id}`);
      const records = res.data || [];
      
      let weakestSubject = '';
      let lowestPercentage = 101; 
      const subjectNames = new Set(); // <-- NEW: Collect unique subjects

      records.forEach(record => {
        if (record.subject) subjectNames.add(record.subject); // Add to our set

        const max = parseFloat(record.max_score) || 100;
        const score = parseFloat(record.score) || 0;
        if (max > 0) {
          const percentage = (score / max) * 100;
          if (percentage < lowestPercentage) {
            lowestPercentage = percentage;
            weakestSubject = record.subject;
          }
        }
      });

      // <-- NEW: Format the sentence to display all subjects
      const allSubjectsArray = Array.from(subjectNames);
      let subjectsSentence = '';
      if (allSubjectsArray.length > 0) {
        subjectsSentence = `Evaluated Subjects: ${allSubjectsArray.join(', ')}. Lowest detected: ${weakestSubject}.`;
      } else {
        subjectsSentence = 'No prior subject records found.';
      }

      setPathModal(prev => ({ 
        ...prev, 
        weak_subject: weakestSubject,
        all_subjects_text: subjectsSentence // <-- Update state with the sentence
      }));

    } catch (error) {
      console.error("Error fetching weakest subject from academic records:", error);
      setPathModal(prev => ({ 
          ...prev, 
          weak_subject: '', 
          all_subjects_text: 'Failed to load subjects.' 
      }));
    }
  };

  const submitGeneratePath = async () => {
    const { student, weak_subject, weak_section, grade_level } = pathModal;
    const cleanSubject = weak_subject.trim();
    const cleanSection = weak_section.trim();
    
    if (!student || !cleanSubject || !cleanSection) return;

    setPathModal(prev => ({ ...prev, isGenerating: true }));

    try {
      await api.post(`/learning-paths/personalized/${student.id}`, {
        weak_subject: cleanSubject,
        weak_section: cleanSection,
        grade_level: grade_level
      });
      alert(`Intelligent Learning Path generated successfully for Grade ${grade_level}!`);
      setPathModal(prev => ({ ...prev, open: false }));
      navigate('/teacher/learning-paths'); 
    } catch (error) {
      console.error('Error generating learning path:', error);
      alert('Error generating learning path: ' + (error.response?.data?.error || error.message));
    } finally {
      setPathModal(prev => ({ ...prev, isGenerating: false }));
    }
  };

  const getRiskBadgeClass = (riskLevel) => {
    switch ((riskLevel || '').toLowerCase()) {
      case 'critical': return 'badge-critical';
      case 'high': return 'badge-high';
      case 'medium': return 'badge-medium';
      case 'low': return 'badge-low';
      default: return 'badge-low';
    }
  };

  if (loading) return <div className="loading">Loading dashboard data...</div>;

  return (
    <div className="guidance-page">
      <TeacherNavbar user={user} onLogout={onLogout} />
      <div className="container">
        <div className="card">
          <div className="card-header">
            <div>
              <h2>Struggling Students</h2>
              <p className="subtitle">Categorized view of students requiring academic or behavioral intervention</p>
            </div>
            <button
              onClick={async () => {
                setRunning(true);
                try {
                  await api.post("/components/early-warning");
                  await fetchAtRiskStudents();
                } catch (e) { alert(e.response?.data?.error || e.message || 'Failed to run analysis'); } 
                finally { setRunning(false); }
              }}
              className="btn btn-primary"
              disabled={running}
            >
              {running ? 'Running ML Analysis...' : 'Sync Latest Data'}
            </button>
          </div>

          {students.length === 0 ? (
            <p>No at-risk students identified yet. Run data sync to check for struggling students.</p>
          ) : (
            <div className="students-grid">
              {students.map((student) => (
                <div key={student.id} className="student-card">
                  <div className="student-header">
                    <h3>{student.name}</h3>
                    <span className={`badge ${getRiskBadgeClass(student.risk_level)}`}>{student.risk_level} Risk</span>
                  </div>
                  <div className="student-info-grid" style={{ marginBottom: '15px' }}>
                    <div><span className="k">ID</span><span className="v">{student.student_id}</span></div>
                    <div><span className="k">Class</span><span className="v">{student.class_name} • Grade {student.grade}</span></div>
                    <div><span className="k">Category</span><span className="v">{toTitle(student.identified_by)}</span></div>
                  </div>
                  <button className="link-button" onClick={() => {
                      const next = new Set(expanded);
                      if (next.has(student.id)) next.delete(student.id);
                      else next.add(student.id);
                      setExpanded(next);
                    }}
                  >
                    {expanded.has(student.id) ? 'Hide Analysis Details' : 'View ML Analysis Details'}
                  </button>
                  {expanded.has(student.id) && <div className="risk-panel">{renderRiskDetails(student)}</div>}
                  <div className="student-actions">
                    <button onClick={() => openGeneratePath(student)} className="btn btn-primary">Generate Path</button>
                    <Link to={`/teacher/students/${student.id}`} className="btn btn-secondary">View Profile</Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {pathModal.open && (
        <div className="modal-backdrop" onClick={() => !pathModal.isGenerating && setPathModal({ ...pathModal, open: false })}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 style={{ margin: 0 }}>Intelligent Path Generation</h3>
                <p className="subtitle" style={{ margin: '4px 0 0' }}>Creating AI tailored plan for <strong>{pathModal.student?.name}</strong></p>
              </div>
            </div>
            <div className="modal-body" style={{ marginTop: '10px' }}>
              <div style={{ padding: '12px', background: '#eff6ff', borderRadius: '8px', color: '#1e3a8a', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.2rem' }}>🎓</span> 
                <span>Resources will be strictly filtered for the selected Grade level.</span>
              </div>
              
              <label className="field" style={{ marginTop: '10px' }}>
                <span>Target Grade Level</span>
                <input
                  type="number"
                  className="input"
                  value={pathModal.grade_level}
                  onChange={(e) => setPathModal({ ...pathModal, grade_level: e.target.value })}
                  disabled={pathModal.isGenerating}
                />
              </label>
              
              {/* --- NEW UI UPDATE --- */}
              <label className="field">
                <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '8px' }}>
                  <span style={{ fontWeight: 'bold' }}>Weak Subject (Auto-Detected)</span>
                  {pathModal.all_subjects_text && (
                    <span style={{ fontSize: '0.85rem', color: '#059669', marginTop: '4px' }}>
                      {pathModal.all_subjects_text}
                    </span>
                  )}
                </div>
                <input
                  className="input"
                  value={pathModal.weak_subject}
                  onChange={(e) => setPathModal({ ...pathModal, weak_subject: e.target.value })}
                  placeholder="Subject"
                  disabled={pathModal.isGenerating}
                />
              </label>
              {/* --------------------- */}

              <label className="field">
                <span>Specific Topic / Section (e.g. Fractions)</span>
                <input
                  className="input"
                  value={pathModal.weak_section}
                  onChange={(e) => setPathModal({ ...pathModal, weak_section: e.target.value })}
                  placeholder="Section"
                  disabled={pathModal.isGenerating}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setPathModal({ ...pathModal, open: false })} disabled={pathModal.isGenerating}>Cancel</button>
              <button className="btn btn-primary" onClick={submitGeneratePath} disabled={!pathModal.weak_subject.trim() || !pathModal.weak_section.trim() || !pathModal.grade_level || pathModal.isGenerating || pathModal.weak_subject === 'Searching lowest score...'}>
                {pathModal.isGenerating ? 'Processing ML Model...' : 'Generate Path'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GuidancePage;