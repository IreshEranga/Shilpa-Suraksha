import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../utils/api';
import TeacherNavbar from './shared/TeacherNavbar';
import './LearningPaths.css';

const LearningPaths = ({ user, onLogout }) => {
  const [learningPaths, setLearningPaths] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Individual Progress Entry Modal
  const [progressModal, setProgressModal] = useState({
    open: false, loading: false, data: null, error: null,
    pathTitle: '', studentName: '', studentId: null, pathId: null, pathRaw: null
  });

  // Overall Class Progress Modal
  const [overallProgressModal, setOverallProgressModal] = useState({
    open: false, loading: false, data: [], selectedStudentId: ''
  });

  const [formData, setFormData] = useState({
    task_description: '',
    assessment_score: '',
    task_completed: false
  });

  const safeParseJson = (value) => {
    if (!value) return null;
    if (typeof value === 'object') return value;
    if (typeof value === 'string') {
      try { return JSON.parse(value); } catch { return null; }
    }
    return null;
  };

  const fetchLearningPaths = useCallback(async () => {
    try {
      setError(null);
      const res = await api.get('/learning-paths/teacher');
      const normalized = (res.data || []).map((p) => ({
        ...p,
        resources: safeParseJson(p.resources) || p.resources
      }));
      setLearningPaths(normalized);
    } catch (error) {
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
          } catch (e) {}
        }

        const normalized = allPaths.map((p) => ({
          ...p,
          resources: safeParseJson(p.resources) || p.resources
        }));
        setLearningPaths(normalized);
      } catch (fallbackError) {
        setError('Failed to load learning paths');
        setLearningPaths([]);
      }
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchLearningPaths();
  }, [fetchLearningPaths]);

  const handleStatusChange = async (pathId, newStatus) => {
    try {
      await api.patch(`/learning-paths/${pathId}`, { status: newStatus });
      fetchLearningPaths();
    } catch (error) {
      alert('Error updating status: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleViewProgress = async (path) => {
    setProgressModal({ 
      open: true, loading: true, data: null, error: null, 
      pathTitle: `${path.subject} - ${path.section}`, studentName: path.student_name || 'Student',
      studentId: path.student_id, pathId: path.id, pathRaw: path
    });

    try {
      const res = await api.get(`/learning-paths/progress/weekly/${path.student_id}/${path.id}`);
      setProgressModal(prev => ({ ...prev, loading: false, data: res.data.report }));
    } catch (error) {
      setProgressModal(prev => ({ ...prev, loading: false, error: 'Failed to load weekly progress analytics.' }));
    }
  };

  const handleAddProgress = async (e) => {
    e.preventDefault();
    try {
      await api.post('/learning-paths/progress', {
        student_id: progressModal.studentId,
        learning_path_id: progressModal.pathId,
        task_description: formData.task_description,
        assessment_score: formData.assessment_score || null,
        task_completed: formData.task_completed
      });
      setFormData({ task_description: '', assessment_score: '', task_completed: false });
      handleViewProgress(progressModal.pathRaw); 
    } catch (err) {
      alert('Error saving record: ' + (err.response?.data?.error || err.message));
    }
  };

  // --- OVERALL PROGRESS LOGIC ---
  const openOverallProgress = async () => {
    setOverallProgressModal(prev => ({ ...prev, open: true, loading: true }));
    try {
      const res = await api.get('/components/improvement-dashboard');
      setOverallProgressModal(prev => ({ ...prev, loading: false, data: res.data.progress || [] }));
    } catch (error) {
      console.error(error);
      setOverallProgressModal(prev => ({ ...prev, loading: false }));
    }
  };

  const groupedOverallProgressData = useMemo(() => {
    if (!overallProgressModal.data) return [];
    const grouped = overallProgressModal.data.reduce((acc, current) => {
      const { student_id, student_name } = current;
      if (overallProgressModal.selectedStudentId && String(student_id) !== String(overallProgressModal.selectedStudentId)) {
        return acc;
      }
      if (!acc[student_id]) {
        acc[student_id] = { student_id, student_name, records: [] };
      }
      acc[student_id].records.push(current);
      return acc;
    }, {});
    return Object.values(grouped).sort((a, b) => a.student_name.localeCompare(b.student_name));
  }, [overallProgressModal.data, overallProgressModal.selectedStudentId]);

  const renderOverallLineChart = () => {
    const rows = overallProgressModal.data || [];
    const filtered = overallProgressModal.selectedStudentId 
      ? rows.filter(r => String(r.student_id) === String(overallProgressModal.selectedStudentId)) 
      : rows;
      
    const data = filtered.map(r => ({
        t: new Date(r.recorded_at).getTime(),
        score: Number(r.assessment_score) || 0
      }))
      .filter(x => x.score > 0 && Number.isFinite(x.t))
      .sort((a, b) => a.t - b.t);

    if (!data.length) return <p>No progress data yet.</p>;

    const width = 640; const height = 240; const pad = 30;
    const ts = data.map(d => d.t); const vs = data.map(d => d.score);
    const tmin = Math.min(...ts); const tmax = Math.max(...ts);
    const vmin = Math.min(...vs, 0); const vmax = Math.max(...vs, 100);

    const xScale = (t) => pad + ((t - tmin) / Math.max(1e-6, (tmax - tmin))) * (width - pad * 2);
    const yScale = (v) => height - pad - ((v - vmin) / Math.max(1e-6, (vmax - vmin))) * (height - pad * 2);

    const d = data.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${xScale(pt.t).toFixed(1)} ${yScale(pt.score).toFixed(1)}`).join(' ');

    return (
      <svg width={width} height={height} style={{ border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff' }}>
        <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="#9ca3af" />
        <line x1={pad} y1={pad} x2={pad} y2={height - pad} stroke="#9ca3af" />
        <path d={d} fill="none" stroke="#10b981" strokeWidth="3" />
        {data.map((pt, idx) => (
          <circle key={idx} cx={xScale(pt.t)} cy={yScale(pt.score)} r={4} fill="#10b981" />
        ))}
      </svg>
    );
  };
  // ------------------------------

  const toTitleCase = (str) => {
    if (!str) return '';
    return str.replace(/\w\S*/g, function(txt){ return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase(); });
  };

  const renderIndividualLineGraph = (weeklyData) => {
    if (!weeklyData || weeklyData.length === 0) return null;
    const width = 600; const height = 220; const padX = 40; const padY = 30;
    const weeks = weeklyData.map(d => d.week_number);
    const maxWeek = Math.max(...weeks, 1); const minWeek = Math.min(...weeks, 1);
    const rangeWeek = Math.max(maxWeek - minWeek, 1);

    const getX = (week) => padX + ((week - minWeek) / rangeWeek) * (width - padX * 2);
    const getY = (score) => height - padY - (score / 100) * (height - padY * 2);

    const assessPath = weeklyData.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(d.week_number)} ${getY(d.avg_assessment_score)}`).join(' ');

    return (
      <div className="line-graph-wrapper">
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%">
          {[0, 25, 50, 75, 100].map(mark => (
            <g key={mark}>
              <line x1={padX} y1={getY(mark)} x2={width - padX} y2={getY(mark)} stroke="#e2e8f0" strokeDasharray="4 4" />
              <text x={padX - 10} y={getY(mark) + 4} fontSize="11" fill="#64748b" textAnchor="end">{mark}</text>
            </g>
          ))}
          {weeklyData.map(d => (
            <text key={d.week_number} x={getX(d.week_number)} y={height - 10} fontSize="11" fill="#64748b" textAnchor="middle" fontWeight="600">Wk {d.week_number}</text>
          ))}
          {weeklyData.some(d => d.avg_assessment_score > 0) && (
            <path d={assessPath} fill="none" stroke="#10b981" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          )}
          {weeklyData.map(d => (
            <g key={`points-${d.week_number}`}>
              {d.avg_assessment_score > 0 && (
                <>
                  <circle cx={getX(d.week_number)} cy={getY(d.avg_assessment_score)} r="5" fill="#fff" stroke="#10b981" strokeWidth="2" />
                  <text x={getX(d.week_number)} y={getY(d.avg_assessment_score) - 12} fontSize="10" fill="#0f172a" textAnchor="middle" fontWeight="700">
                    {d.avg_assessment_score}
                  </text>
                </>
              )}
            </g>
          ))}
        </svg>
        <div className="graph-legend">
          <span className="legend-item"><span className="dot green"></span> Assessment Score Average</span>
        </div>
      </div>
    );
  };

  return (
    <div className="learning-paths">
      <TeacherNavbar user={user} onLogout={onLogout} />

      <div className="container">
        <div className="card">
          <div className="header-flex">
            <div>
              <h2>AI Generated Learning Paths</h2>
              <p className="subtitle" style={{ color: '#6b7280', marginTop: '0px', marginBottom: '20px' }}>
                Strictly filtered by Student Grade and Weak Section constraints.
              </p>
            </div>
            <button className="btn-overall-progress" onClick={openOverallProgress}>
              📈 View Class Progress Report
            </button>
          </div>
          
          {loading ? (
            <div className="loading-spinner">Loading Paths...</div>
          ) : error ? (
            <p className="error-message">{error}</p>
          ) : learningPaths.length === 0 ? (
            <div className="empty-state">
              <p>No learning paths generated yet. Generate one from the Guidance page.</p>
            </div>
          ) : (
            <div className="paths-list">
              {learningPaths.map(path => {
                const targetGrade = path.resources?.grade_level || "N/A";
                return (
                  <div key={path.id} className="path-item">
                    <div className="path-header">
                      <h3>
                        <span className="grade-badge">Grade {targetGrade}</span>
                        {path.subject} - {path.section}
                        {path.student_name && (
                          <span className="student-name-badge">
                            • {path.student_name} ({path.student_code || path.student_id})
                          </span>
                        )}
                      </h3>
                      <select value={path.status} onChange={(e) => handleStatusChange(path.id, e.target.value)} className={`status-select status-${path.status}`}>
                        <option value="active">Active</option><option value="completed">Completed</option><option value="paused">Paused</option>
                      </select>
                    </div>
                    
                    <div className="path-content"><pre className="content-pre">{path.path_content}</pre></div>

                    {path.resources && (path.resources.activities || Array.isArray(path.resources)) && (
                      <div className="path-resources">
                        <h4>Detailed AI Resources & Activities:</h4>
                        <ul>
                          {Array.isArray(path.resources) 
                            ? path.resources.map((res, idx) => (<li key={idx}><strong>{toTitleCase(res.type)}:</strong> {res.content}</li>)) 
                            : path.resources.activities?.map((act, idx) => (
                                <li key={idx}>
                                  <strong>{act.title}</strong> 
                                  <span className="resource-grade-tag">(Grade {targetGrade})</span>: {act.description} 
                                  <span className="time-tag"> ({act.estimatedTime})</span>
                                </li>
                              ))}
                        </ul>
                      </div>
                    )}
                    
                    <div className="path-footer">
                      <div className="dates-info">
                        <span>Created: {new Date(path.created_at).toLocaleDateString()}</span>
                        {path.updated_at !== path.created_at && (<span>Updated: {new Date(path.updated_at).toLocaleDateString()}</span>)}
                      </div>
                      <button className="btn-view-progress" onClick={() => handleViewProgress(path)}>📊 Enter & View Progress</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* INDIVIDUAL Progress Input & Line Graph Modal */}
      {progressModal.open && (
        <div className="modal-backdrop" onClick={() => setProgressModal({ ...progressModal, open: false })}>
          <div className="modal progress-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 style={{ margin: 0 }}>Progress & ML Analytics</h3>
                <p className="subtitle" style={{ margin: '4px 0 0' }}>{progressModal.studentName} | {progressModal.pathTitle}</p>
              </div>
              <button className="icon-button" onClick={() => setProgressModal({ ...progressModal, open: false })}>✕</button>
            </div>
            <div className="modal-body progress-body-split">
              <div className="progress-input-section">
                <h4>Add New Record</h4>
                <form onSubmit={handleAddProgress} className="progress-form">
                  <label className="field">
                    <span>Exercise / Task Name *</span>
                    <input className="input" required placeholder="e.g. Addition Assessment 1" value={formData.task_description} onChange={e => setFormData({...formData, task_description: e.target.value})} />
                  </label>
                  <label className="field">
                    <span>Assessment Score (%) *</span>
                    <input type="number" required max="100" min="0" className="input" placeholder="0-100" value={formData.assessment_score} onChange={e => setFormData({...formData, assessment_score: e.target.value})} />
                  </label>
                  <label className="checkbox-label">
                    <input type="checkbox" checked={formData.task_completed} onChange={e => setFormData({...formData, task_completed: e.target.checked})} /> Task fully completed
                  </label>
                  <button type="submit" className="btn btn-primary" style={{marginTop: '10px', width: '100%'}}>Save Progress</button>
                </form>
              </div>

              <div className="progress-analytics-section">
                {progressModal.loading ? (
                  <div className="loading-spinner">Analyzing Data...</div>
                ) : progressModal.error ? (
                  <p className="error-message">{progressModal.error}</p>
                ) : progressModal.data?.weekly_data?.length === 0 ? (
                  <div className="empty-state"><p>No progress records found. Enter a record on the left to see ML trends.</p></div>
                ) : (
                  <>
                    <div className="kpi-grid">
                      <div className="kpi-card"><span className="kpi-title">Trend</span><span className={`kpi-value trend-${progressModal.data.overall_weekly_trend}`}>{toTitleCase(progressModal.data.overall_weekly_trend)}</span></div>
                      <div className="kpi-card"><span className="kpi-title">WoW Change</span><span className={`kpi-value ${progressModal.data.week_over_week_change > 0 ? 'text-green' : progressModal.data.week_over_week_change < 0 ? 'text-red' : 'text-gray'}`}>{progressModal.data.week_over_week_change > 0 ? '+' : ''}{progressModal.data.week_over_week_change}%</span></div>
                    </div>
                    {renderIndividualLineGraph(progressModal.data.weekly_data)}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* OVERALL CLASS PROGRESS MODAL (Imported from old Improvement Dashboard) */}
      {overallProgressModal.open && (
        <div className="modal-backdrop" onClick={() => setOverallProgressModal({ ...overallProgressModal, open: false })}>
          <div className="modal overall-progress-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 style={{ margin: 0 }}>Class Progress Tracking</h3>
                <p className="subtitle" style={{ margin: '4px 0 0' }}>Overall tracking for all generated learning paths</p>
              </div>
              <button className="icon-button" onClick={() => setOverallProgressModal({ ...overallProgressModal, open: false })}>✕</button>
            </div>

            <div className="modal-body" style={{ maxHeight: '80vh', overflowY: 'auto' }}>
              {overallProgressModal.loading ? (
                <div className="loading-spinner">Loading Class Data...</div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
                    <label style={{ fontWeight: 600 }}>Filter by Student:</label>
                    <select className="input" value={overallProgressModal.selectedStudentId} onChange={(e) => setOverallProgressModal({...overallProgressModal, selectedStudentId: e.target.value})} style={{ maxWidth: 320 }}>
                      <option value="">All students</option>
                      {Array.from(new Map((overallProgressModal.data || []).map(p => [p.student_id, p.student_name])).entries()).map(([id, name]) => (
                        <option key={id} value={id}>{name}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="chart-container" style={{ marginBottom: '30px' }}>
                    <h4 style={{marginBottom: '10px', color: '#374151'}}>Progress Trend Overview</h4>
                    {renderOverallLineChart()}
                  </div>

                  <div className="student-tables-container">
                    {groupedOverallProgressData.length === 0 ? (
                      <p>No progress records found.</p>
                    ) : (
                      groupedOverallProgressData.map((studentGroup) => (
                        <div key={studentGroup.student_id} className="student-progress-section">
                          <h4 className="student-section-title">{studentGroup.student_name}</h4>
                          <table className="table student-progress-table">
                            <thead>
                              <tr>
                                <th>Subject</th>
                                <th>Section</th>
                                <th>Assessment Score</th>
                                <th>Task Name</th>
                                <th>Trend</th>
                                <th>Date</th>
                              </tr>
                            </thead>
                            <tbody>
                              {studentGroup.records.map(progress => (
                                <tr key={progress.id}>
                                  <td>{progress.subject || '-'}</td>
                                  <td>{progress.section || '-'}</td>
                                  <td className="score-cell">{progress.assessment_score || '-'}</td>
                                  <td>{progress.task_description || '-'}</td>
                                  <td><span className={`trend trend-${progress.improvement_trend}`}>{progress.improvement_trend}</span></td>
                                  <td>{new Date(progress.recorded_at).toLocaleDateString()}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LearningPaths;