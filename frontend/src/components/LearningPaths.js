import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../utils/api';
import TeacherNavbar from './shared/TeacherNavbar';
import './LearningPaths.css';

const LearningPaths = ({ user, onLogout }) => {
  const [learningPaths, setLearningPaths] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [progressModal, setProgressModal] = useState({
    open: false, loading: false, data: null, error: null,
    pathTitle: '', studentName: '', studentId: null, pathId: null, pathRaw: null
  });

  const [overallProgressModal, setOverallProgressModal] = useState({
    open: false, loading: false, data: [], selectedStudentId: ''
  });

  const [formData, setFormData] = useState({
    task_description: '', assessment_score: '', task_completed: false
  });

  const safeParseJson = (value) => {
    if (!value) return null;
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch { return null; }
  };

  const toTitleCase = (str) => {
    if (!str) return '';
    return str.replace(/\w\S*/g, function(txt){ return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase(); });
  };

  const fetchLearningPaths = useCallback(async () => {
    try {
      setError(null);
      const res = await api.get('/learning-paths/teacher');
      const normalized = (res.data || []).map((p) => ({
        ...p, 
        resources: safeParseJson(p.resources) || {} 
      }));
      setLearningPaths(normalized);
    } catch (error) {
      setError('Failed to load learning paths');
      setLearningPaths([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLearningPaths(); }, [fetchLearningPaths]);

  const handleStatusChange = async (pathId, newStatus) => {
    try {
      await api.patch(`/learning-paths/${pathId}`, { status: newStatus });
      fetchLearningPaths();
    } catch (error) { alert('Error updating status'); }
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
      setProgressModal(prev => ({ ...prev, loading: false, error: 'Failed to load analytics.' }));
    }
  };

  const handleAddProgress = async (e) => {
    e.preventDefault();
    try {
      await api.post('/learning-paths/progress', {
        student_id: progressModal.studentId, learning_path_id: progressModal.pathId,
        task_description: formData.task_description, assessment_score: formData.assessment_score || null, task_completed: formData.task_completed
      });
      setFormData({ task_description: '', assessment_score: '', task_completed: false });
      handleViewProgress(progressModal.pathRaw); 
    } catch (err) { alert('Error saving record'); }
  };

  const handleDownloadPDF = (path) => {
    const targetGrade = path.resources?.grade_level || "N/A";
    const onlineLinks = path.resources?.online_resources || [];
    const activities = path.resources?.activities || [];
    const strategies = path.resources?.strategies || [];
    const quizzes = path.resources?.micro_quiz || [];

    const printWindow = window.open('', '_blank', 'width=800,height=900');
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Learning Plan - ${path.student_name}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Sinhala:wght@400;600;700&display=swap');
          body { font-family: 'Noto Sans Sinhala', Arial, sans-serif; padding: 40px; color: #1e293b; line-height: 1.6; }
          .header { text-align: center; border-bottom: 3px solid #3b82f6; padding-bottom: 20px; margin-bottom: 30px; }
          .header h1 { color: #1e3a8a; margin: 0 0 10px 0; font-size: 24px; }
          .student-info { font-size: 16px; font-weight: 600; color: #475569; background: #f8fafc; padding: 15px; border-radius: 8px; display: inline-block; margin-bottom: 10px; }
          .section { margin-bottom: 25px; page-break-inside: avoid; }
          .section h3 { color: #2563eb; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 15px;}
          .content-box { background-color: #f8fafc; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; white-space: pre-wrap; font-size: 14.5px; }
          ul { padding-left: 20px; margin: 0; }
          li { margin-bottom: 12px; font-size: 14px; background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0; list-style-type: none;}
          li b { color: #0f172a; display: inline-block; margin-bottom: 4px; font-size: 15px;}
          .type-tag { font-size: 11px; background: #e0e7ff; color: #3730a3; padding: 2px 6px; border-radius: 4px; margin-left: 8px;}
          .quiz-box { border: 2px dashed #cbd5e1; background: #fff; padding: 15px; border-radius: 8px; margin-bottom: 10px;}
          .quiz-box p { font-weight: bold; margin-top: 0;}
          .link-text { color: #2563eb; text-decoration: none; word-break: break-all; font-size: 13px;}
          .footer { text-align: center; margin-top: 50px; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 20px; }
          @media print { body { padding: 0; } .content-box, li { border: none; background: transparent; } li {border-bottom: 1px solid #eee; border-radius: 0; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Shilpa-Suraksha Personalized Learning Plan</h1>
          <div class="student-info">Student: ${path.student_name} &nbsp;|&nbsp; Grade: ${targetGrade} &nbsp;|&nbsp; Subject: ${path.subject} (${path.section})</div>
        </div>
        
        <div class="section"><h3>👩‍🏫 Teacher's Note / ගුරුවරයාගේ සටහන</h3><div class="content-box">${path.path_content}</div></div>
        
        ${activities.length > 0 ? `
        <div class="section">
          <h3>🎯 5-Step AI Recommended Activities</h3>
          <ul>
            ${activities.map(act => `<li><b>${act.title}</b> <span class="type-tag">${act.type || 'Activity'}</span><br/>${act.description} <br><span style="color:#64748b; font-size:12px;">(Time: ${act.estimatedTime || 'N/A'})</span></li>`).join('')}
          </ul>
        </div>` : ''}

        ${quizzes.length > 0 ? `
        <div class="section" style="page-break-before: always;">
          <h3>📝 Weekly Micro-Assessment (Quiz)</h3>
          ${quizzes.map((q, i) => `
            <div class="quiz-box">
              <p>${i+1}. ${q.question}</p>
              <ul style="padding-left: 0; margin-bottom: 10px;">
                ${q.options.map(opt => `<li style="background:none; border:none; padding:2px; margin:0;">⬜ ${opt}</li>`).join('')}
              </ul>
              <small style="color: #64748b;">(Answer: ${q.answer})</small>
            </div>
          `).join('')}
        </div>` : ''}

        ${strategies.length > 0 ? `
        <div class="section">
          <h3>👨‍👩‍👧 Support Strategies</h3>
          <ul>
            ${strategies.map(strat => `<li><b>${strat.title}</b><br/>${strat.description}</li>`).join('')}
          </ul>
        </div>` : ''}

        ${onlineLinks.length > 0 ? `
        <div class="section">
          <h3>🌐 Free Online Resources</h3>
          <ul>
            ${onlineLinks.map(link => `<li><b>${link.platform}: ${link.title}</b><br/><a class="link-text" href="${link.url}" target="_blank">${link.url}</a></li>`).join('')}
          </ul>
        </div>` : ''}
        
        <div class="footer">Generated automatically by Shilpa-Suraksha AI System<br/>Date: ${new Date(path.created_at).toLocaleDateString()}</div>
      </body>
      </html>
    `;
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); }, 1000);
  };

  const openOverallProgress = async () => {
    setOverallProgressModal(prev => ({ ...prev, open: true, loading: true }));
    try {
      const res = await api.get('/components/improvement-dashboard');
      setOverallProgressModal(prev => ({ ...prev, loading: false, data: res.data.progress || [] }));
    } catch (error) { setOverallProgressModal(prev => ({ ...prev, loading: false })); }
  };

  const groupedLearningPaths = useMemo(() => {
    const groups = {};
    const activePaths = learningPaths.filter(path => path.status !== 'completed');

    activePaths.forEach(path => {
      const key = path.student_id;
      if (!groups[key]) {
        groups[key] = { 
          student_id: key, 
          student_name: path.student_name, 
          student_code: path.student_code || path.student_id, 
          paths: [],
          latest_path_date: 0 
        };
      }
      
      groups[key].paths.push(path);

      const pathDate = new Date(path.created_at || 0).getTime();
      if (pathDate > groups[key].latest_path_date) {
        groups[key].latest_path_date = pathDate;
      }
    });

    const studentsArray = Object.values(groups);

    studentsArray.forEach(studentGroup => {
      studentGroup.paths.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    });

    return studentsArray.sort((a, b) => b.latest_path_date - a.latest_path_date);

  }, [learningPaths]);

  const getBayesianMetrics = (scoresArray) => {
    if (!scoresArray || scoresArray.length < 2) {
      return { trend: 'stable', confidence: 50.0, predictedNextScore: scoresArray.length > 0 ? scoresArray[0] : 0 };
    }
    const n = scoresArray.length;
    const mean = scoresArray.reduce((a, b) => a + b, 0) / n;
    const variance = scoresArray.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance) || 1;
    const currentScore = scoresArray[n - 1];
    const historicalMean = scoresArray.slice(0, n - 1).reduce((a, b) => a + b, 0) / (n - 1);
    const momentum = currentScore - historicalMean;
    let predictedNextScore = currentScore + (momentum * 0.4);
    predictedNextScore = Math.max(0, Math.min(100, predictedNextScore));
    let confidence = 100 - (stdDev * 1.2);
    confidence = Math.max(30, Math.min(99, confidence));
    let trend = 'stable';
    if (predictedNextScore > historicalMean + 5) trend = 'improving';
    else if (predictedNextScore < historicalMean - 5) trend = 'declining';
    return { trend, confidence: Math.round(confidence * 10) / 10, predictedNextScore: Math.round(predictedNextScore * 10) / 10 };
  };

  const groupedOverallProgressData = useMemo(() => {
    if (!overallProgressModal.data) return [];
    
    const filteredData = overallProgressModal.selectedStudentId 
      ? overallProgressModal.data.filter(r => String(r.student_id) === String(overallProgressModal.selectedStudentId)) 
      : overallProgressModal.data;
    
    const studentGroups = {};

    filteredData.forEach(record => {
      if (!studentGroups[record.student_id]) {
        studentGroups[record.student_id] = {
          student_id: record.student_id,
          student_name: record.student_name,
          paths: {}
        };
      }
      
      const pathKey = record.learning_path_id || `unknown-${record.subject}-${record.section}`;
      
      const matchingPath = learningPaths.find(lp => lp.id === record.learning_path_id);
      const status = matchingPath ? matchingPath.status : (record.path_status || 'active');

      if (!studentGroups[record.student_id].paths[pathKey]) {
        studentGroups[record.student_id].paths[pathKey] = {
          learning_path_id: pathKey,
          subject: record.subject,
          section: record.section,
          status: status,
          records: []
        };
      }
      studentGroups[record.student_id].paths[pathKey].records.push(record);
    });

    return Object.values(studentGroups).map(student => {
      const pathsArray = Object.values(student.paths);
      
      pathsArray.forEach(path => {
        path.records.sort((a, b) => new Date(b.recorded_at) - new Date(a.recorded_at));
      });

      pathsArray.sort((a, b) => {
        if (a.status === 'completed' && b.status !== 'completed') return 1;
        if (a.status !== 'completed' && b.status === 'completed') return -1;
        return a.subject.localeCompare(b.subject); 
      });

      return { ...student, pathsArray };
    }).sort((a, b) => a.student_name.localeCompare(b.student_name));
    
  }, [overallProgressModal.data, overallProgressModal.selectedStudentId, learningPaths]);

  const overallScores = overallProgressModal.data?.map(r => Number(r.assessment_score) || 0).filter(s => s > 0) || [];
  const overallMetrics = getBayesianMetrics(overallScores);

  const renderOverallLineChart = () => {
    const data = overallScores.map((score, i) => ({ index: i + 1, score }));
    if (!data.length) return <div className="empty-state"><p>No progress data yet.</p></div>;
    const width = 600; const height = 220; const padX = 40; const padY = 30;
    const maxIndex = Math.max(...data.map(d => d.index), 1);
    const minIndex = Math.min(...data.map(d => d.index), 1);
    const rangeIndex = Math.max(maxIndex - minIndex, 1);
    const getX = (idx) => padX + ((idx - minIndex) / rangeIndex) * (width - padX * 2);
    const getY = (score) => height - padY - (score / 100) * (height - padY * 2);
    const assessPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(d.index)} ${getY(d.score)}`).join(' ');

    return (
      <div className="line-graph-wrapper">
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%">
          {[0, 25, 50, 75, 100].map(mark => (
            <g key={mark}>
              <line x1={padX} y1={getY(mark)} x2={width - padX} y2={getY(mark)} stroke="#e2e8f0" strokeDasharray="4 4" />
              <text x={padX - 10} y={getY(mark) + 4} fontSize="11" fill="#64748b" textAnchor="end">{mark}</text>
            </g>
          ))}
          {data.map(d => (<text key={d.index} x={getX(d.index)} y={height - 10} fontSize="11" fill="#64748b" textAnchor="middle" fontWeight="600">T{d.index}</text>))}
          <path d={assessPath} fill="none" stroke="#10b981" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          {data.map(d => (
            <g key={`points-${d.index}`}>
              <circle cx={getX(d.index)} cy={getY(d.score)} r="5" fill="#fff" stroke="#10b981" strokeWidth="2" />
              <text x={getX(d.index)} y={getY(d.score) - 12} fontSize="10" fill="#0f172a" textAnchor="middle" fontWeight="700">{d.score}</text>
            </g>
          ))}
        </svg>
      </div>
    );
  };

  const renderIndividualLineGraph = (weeklyData) => {
    if (!weeklyData || weeklyData.length === 0) return null;
    const width = 600; const height = 220; const padX = 40; const padY = 30;
    const weeks = weeklyData.map(d => d.week_number);
    const minWeek = Math.min(...weeks, 1); const maxWeek = Math.max(...weeks, 1);
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
          {weeklyData.map(d => (<text key={d.week_number} x={getX(d.week_number)} y={height - 10} fontSize="11" fill="#64748b" textAnchor="middle" fontWeight="600">Wk {d.week_number}</text>))}
          {weeklyData.some(d => d.avg_assessment_score > 0) && (<path d={assessPath} fill="none" stroke="#10b981" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />)}
          {weeklyData.map(d => (
            <g key={`points-${d.week_number}`}>
              {d.avg_assessment_score > 0 && (
                <>
                  <circle cx={getX(d.week_number)} cy={getY(d.avg_assessment_score)} r="6" fill="#fff" stroke="#10b981" strokeWidth="3" />
                  <text x={getX(d.week_number)} y={getY(d.avg_assessment_score) - 14} fontSize="11" fill="#0f172a" textAnchor="middle" fontWeight="800">{d.avg_assessment_score}</text>
                </>
              )}
            </g>
          ))}
        </svg>
      </div>
    );
  };

  return (
    <div className="learning-paths">
      <TeacherNavbar user={user} onLogout={onLogout} />

      <div className="container">
        <div className="card main-card">
          <div className="header-flex">
            <div>
              <h2>Advanced AI Learning Paths</h2>
              <p className="subtitle" style={{ color: '#6b7280', marginTop: '0px', margin: '0' }}>
                Powered by Multi-modal LLMs, GNNs & Bayesian Networks
              </p>
            </div>
            <button className="btn-overall-progress" onClick={openOverallProgress}>📈 View Class Progress Report</button>
          </div>
          
          {loading ? (
            <div className="loading-spinner">Generating Comprehensive Paths...</div>
          ) : error ? (
            <p className="error-message">{error}</p>
          ) : groupedLearningPaths.length === 0 ? (
            <div className="empty-state">
              <p>No active learning paths generated yet.</p>
              <p style={{fontSize: '0.85rem', color: '#94a3b8'}}>Completed paths are automatically hidden from this view.</p>
            </div>
          ) : (
            <div className="students-path-container">
              {groupedLearningPaths.map(studentGroup => (
                <div key={studentGroup.student_id} className="student-path-group">
                  <div className="student-path-header">
                    <h3>🧑 {studentGroup.student_name} <span className="student-code-badge">({studentGroup.student_code})</span></h3>
                  </div>
                  
                  <div className="paths-list">
                    {studentGroup.paths.map(path => {
                      const targetGrade = path.resources?.grade_level || "N/A";
                      const onlineLinks = path.resources?.online_resources || [];
                      const activities = path.resources?.activities || [];
                      const strategies = path.resources?.strategies || [];
                      const quizzes = path.resources?.micro_quiz || [];
                      const prerequisites = path.resources?.graph_prerequisites || [];

                      return (
                        <div key={path.id} className="path-item">
                          <div className="path-header">
                            <h4>
                              <span className="grade-badge">Grade {targetGrade}</span>
                              {path.subject} - {path.section}
                            </h4>
                            <select value={path.status} onChange={(e) => handleStatusChange(path.id, e.target.value)} className={`status-select status-${path.status}`}>
                              <option value="active">Active</option>
                              <option value="completed">Completed</option>
                              <option value="paused">Paused</option>
                            </select>
                          </div>

                          {prerequisites.length > 0 && (
                            <div className="graph-panel">
                              <h4>🔗 GNN Knowledge Gap Detected</h4>
                              <p>Before teaching <b>{path.section}</b>, ensure the student understands the foundational prerequisites: <span className="highlight-tag">{prerequisites.join(' and ')}</span></p>
                            </div>
                          )}
                          
                          <div className="path-content"><pre className="content-pre">{path.path_content}</pre></div>

                          {activities.length > 0 && (
                            <div className="path-resources">
                              <h4>🎯 5-Step AI Recommended Activities:</h4>
                              <ul>
                                {activities.map((act, idx) => (
                                  <li key={idx}>
                                    <strong>{act.title}</strong> 
                                    <span className="type-tag">{act.type || 'Activity'}</span><br/>
                                    {act.description} <br/>
                                    <span className="time-tag">({act.estimatedTime || 'N/A'})</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {quizzes.length > 0 && (
                            <div className="path-resources">
                              <h4>📝 Weekly Micro-Assessment (AI Generated):</h4>
                              <div className="quiz-grid">
                                {quizzes.map((quiz, idx) => (
                                  <div key={idx} className="quiz-card">
                                    <p className="quiz-q">{idx + 1}. {quiz.question}</p>
                                    <ul className="quiz-options">
                                      {quiz.options?.map((opt, i) => <li key={i}>{opt}</li>)}
                                    </ul>
                                    <p className="quiz-a">Answer: {quiz.answer}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {strategies.length > 0 && (
                            <div className="path-resources">
                              <h4>👩‍🏫 Support Strategies:</h4>
                              <ul>
                                {strategies.map((strat, idx) => (
                                  <li key={idx}><strong>{strat.title}</strong>: {strat.description}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {onlineLinks.length > 0 && (
                            <div className="path-resources online-links-section">
                              <h4>🌐 Free Online Learning Resources:</h4>
                              <div className="links-grid">
                                {onlineLinks.map((link, idx) => (
                                  <a key={idx} href={link.url} target="_blank" rel="noopener noreferrer" className={`resource-link platform-${link.platform.toLowerCase()}`}>
                                    <span className="link-icon">{link.platform === 'YouTube' ? '▶️' : link.platform === 'e-Thaksalawa' ? '🏫' : '🔍'}</span>
                                    <span className="link-text">{link.title}</span>
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          <div className="path-footer">
                            <div className="dates-info"><span>Created: {new Date(path.created_at).toLocaleDateString()}</span></div>
                            <div className="footer-actions" style={{ display: 'flex', gap: '10px' }}>
                              <button className="btn-download-pdf" onClick={() => handleDownloadPDF(path)}>📥 Download Full PDF</button>
                              <button className="btn-view-progress" onClick={() => handleViewProgress(path)}>📊 View Bayesian Progress</button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* INDIVIDUAL Progress Modal */}
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
                  <label className="field"><span>Exercise / Task Name *</span>
                    <input className="input" required placeholder="e.g. Micro-Assessment 1" value={formData.task_description} onChange={e => setFormData({...formData, task_description: e.target.value})} />
                  </label>
                  <label className="field"><span>Assessment Score (%) *</span>
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
                  <div className="loading-spinner">Running Bayesian Analysis...</div>
                ) : progressModal.error ? (
                  <p className="error-message">{progressModal.error}</p>
                ) : progressModal.data?.weekly_data?.length === 0 ? (
                  <div className="empty-state"><p>No progress records found.</p></div>
                ) : (
                  <>
                    <div className="kpi-grid">
                      <div className="kpi-card"><span className="kpi-title">Trend Prediction</span><span className={`kpi-value trend-${progressModal.data.overall_weekly_trend}`}>{toTitleCase(progressModal.data.overall_weekly_trend)}</span></div>
                      <div className="kpi-card"><span className="kpi-title">Bayesian Confidence</span><span className="kpi-value text-blue">{progressModal.data.bayesian_confidence}%</span></div>
                      <div className="kpi-card" style={{gridColumn: '1 / -1'}}><span className="kpi-title">Next Predicted Score</span><span className="kpi-value text-purple">{progressModal.data.predicted_next_score}%</span></div>
                    </div>
                    {renderIndividualLineGraph(progressModal.data.weekly_data)}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* OVERALL CLASS PROGRESS MODAL WITH GRAPH ANALYSIS */}
      {overallProgressModal.open && (
        <div className="modal-backdrop" onClick={() => setOverallProgressModal({ ...overallProgressModal, open: false })}>
          <div className="modal overall-progress-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 style={{ margin: 0 }}>Class Progress Tracking</h3>
                <p className="subtitle" style={{ margin: '4px 0 0' }}>Bayesian Analytics for Overall Progress</p>
              </div>
              <button className="icon-button" onClick={() => setOverallProgressModal({ ...overallProgressModal, open: false })}>✕</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '80vh', overflowY: 'auto', padding: '24px' }}>
              {overallProgressModal.loading ? (
                <div className="loading-spinner">Loading Class Data...</div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20 }}>
                    <label style={{ fontWeight: 600 }}>Filter by Student:</label>
                    <select className="input" value={overallProgressModal.selectedStudentId} onChange={(e) => setOverallProgressModal({...overallProgressModal, selectedStudentId: e.target.value})} style={{ maxWidth: 320 }}>
                      <option value="">All students</option>
                      {Array.from(new Map((overallProgressModal.data || []).map(p => [p.student_id, p.student_name])).entries()).map(([id, name]) => (<option key={id} value={id}>{name}</option>))}
                    </select>
                  </div>
                  
                  {overallScores.length > 0 && (
                    <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '30px' }}>
                      <div className="kpi-card">
                        <span className="kpi-title">Overall Trend</span>
                        <span className={`kpi-value trend-${overallMetrics.trend}`}>{toTitleCase(overallMetrics.trend)}</span>
                      </div>
                      <div className="kpi-card">
                        <span className="kpi-title">Bayesian Confidence</span>
                        <span className="kpi-value text-blue">{overallMetrics.confidence}%</span>
                      </div>
                      <div className="kpi-card">
                        <span className="kpi-title">Next Predicted Score</span>
                        <span className="kpi-value text-purple">{overallMetrics.predictedNextScore}%</span>
                      </div>
                    </div>
                  )}

                  <div className="chart-container" style={{ marginBottom: '40px' }}>
                    <h4 style={{marginBottom: '15px', color: '#1e293b'}}>Progress Trend Overview</h4>
                    {renderOverallLineChart()}
                  </div>

                  <div className="student-tables-container">
                    {groupedOverallProgressData.length === 0 ? (<p>No progress records found.</p>) : (
                      groupedOverallProgressData.map((studentGroup) => (
                        <div key={studentGroup.student_id} className="student-progress-section">
                          <h4 className="student-section-title">{studentGroup.student_name}</h4>
                          <div className="student-paths-wrapper">
                            {studentGroup.pathsArray.map((pathGroup, idx) => (
                              <div key={idx} className={`progress-path-block ${pathGroup.status === 'completed' ? 'completed-path' : ''}`}>
                                <div className="progress-path-header">
                                  <h5>📚 {pathGroup.subject} - {pathGroup.section}</h5>
                                  <span className={`status-badge status-${pathGroup.status}`}>
                                    {pathGroup.status === 'completed' ? '✓ Path Completed' : pathGroup.status.toUpperCase()}
                                  </span>
                                </div>
                                <table className="table student-progress-table">
                                  <thead>
                                    <tr>
                                      <th>Assessment Score</th>
                                      <th>Task Name</th>
                                      <th>Trend</th>
                                      <th>Date</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {pathGroup.records.map(progress => (
                                      <tr key={progress.id}>
                                        <td className="score-cell">{progress.assessment_score}</td>
                                        <td>{progress.task_description}</td>
                                        <td><span className={`trend trend-${progress.improvement_trend}`}>{progress.improvement_trend}</span></td>
                                        <td>{new Date(progress.recorded_at).toLocaleDateString()}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ))}
                          </div>
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