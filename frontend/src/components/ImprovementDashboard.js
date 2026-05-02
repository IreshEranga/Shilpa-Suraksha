import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import TeacherNavbar from './shared/TeacherNavbar';
import './ImprovementDashboard.css';

const ImprovementDashboard = ({ user, onLogout }) => {
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState('clusters');
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [expandedInterventionId, setExpandedInterventionId] = useState(null);
  const [suggestionsModal, setSuggestionsModal] = useState({ open: false, suggestions: [], clusterName: '' });

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchInterventionSuggestions = async (clusterId, clusterName) => {
    try {
      const res = await api.get(`/components/intervention-suggestions?cluster_id=${clusterId}`);
      setSuggestionsModal({ open: true, suggestions: res.data.suggestions || [], clusterName: clusterName || 'Cluster' });
    } catch (error) {
      alert('Error fetching suggestions: ' + (error.response?.data?.error || error.message));
    }
  };

  const fetchDashboardData = async () => {
    try {
      const res = await api.get('/components/improvement-dashboard');
      setDashboardData(res.data);
    } catch (error) {
      console.error('Error fetching dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClusters = async () => {
    try {
      await api.post('/components/create-clusters');
      alert('Clusters created successfully!');
      fetchDashboardData();
    } catch (error) {
      alert('Error creating clusters');
    }
  };

  const clusterColors = (clusters) => {
    const palette = ['#2563eb', '#16a34a', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
    const map = {};
    (clusters || []).forEach((c, idx) => { map[c.id] = palette[idx % palette.length]; });
    return map;
  };

  const renderScatter = () => {
    const points = dashboardData?.clusterPoints || [];
    if (!points.length) {
      return <p>No cluster visualization data yet. Click "Create Clusters".</p>;
    }

    const width = 640;
    const height = 360;
    const pad = 40;

    const xs = points.map(p => Number(p.academic_score) || 0);
    const ys = points.map(p => Number(p.behavioral_score) || 0);
    const xmin = Math.min(...xs, 0);
    const xmax = Math.max(...xs, 100);
    const ymin = Math.min(...ys, 0);
    const ymax = Math.max(...ys, 100);

    const xScale = (x) => pad + ((x - xmin) / Math.max(1e-6, (xmax - xmin))) * (width - pad * 2);
    const yScale = (y) => height - pad - ((y - ymin) / Math.max(1e-6, (ymax - ymin))) * (height - pad * 2);

    const colors = clusterColors(dashboardData?.clusters);

    return (
      <div style={{ position: 'relative' }}>
        <svg width={width} height={height} style={{ border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff' }}>
          <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="#9ca3af" />
          <line x1={pad} y1={pad} x2={pad} y2={height - pad} stroke="#9ca3af" />
          <text x={width / 2} y={height - 8} textAnchor="middle" fill="#6b7280" fontSize="12">Academic Score</text>
          <text x={12} y={height / 2} textAnchor="middle" fill="#6b7280" fontSize="12" transform={`rotate(-90 12 ${height / 2})`}>Behavioral Score</text>

          {points.map((p) => {
            const x = xScale(Number(p.academic_score) || 0);
            const y = yScale(Number(p.behavioral_score) || 0);
            const fill = colors[p.cluster_id] || '#2563eb';
            return (
              <circle
                key={`${p.cluster_id}-${p.student_id}`}
                cx={x}
                cy={y}
                r={5}
                fill={fill}
                stroke="#111827"
                strokeWidth="0.5"
                onMouseEnter={() => setHoveredPoint({ ...p, x, y })}
                onMouseLeave={() => setHoveredPoint(null)}
              />
            );
          })}
        </svg>

        {hoveredPoint && (
          <div
            style={{
              position: 'absolute',
              left: Math.min(width - 220, Math.max(0, hoveredPoint.x + 10)),
              top: Math.max(0, hoveredPoint.y - 10),
              width: 210,
              background: 'rgba(17,24,39,0.95)',
              color: 'white',
              padding: 10,
              borderRadius: 8,
              fontSize: 12
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 6 }}>{hoveredPoint.student_name}</div>
            <div>Cluster: {hoveredPoint.cluster_name}</div>
            <div>Academic: {Number(hoveredPoint.academic_score).toFixed(1)}%</div>
            <div>Attendance: {Number(hoveredPoint.attendance_rate).toFixed(1)}%</div>
            <div>Behavioral: {Number(hoveredPoint.behavioral_score).toFixed(1)}%</div>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="improvement-dashboard">
      <TeacherNavbar user={user} onLogout={onLogout} />

      <div className="container">
        <div className="dashboard-header">
          <h2>Student Improvement Dashboard with Intervention Orchestrator</h2>
          <button onClick={handleCreateClusters} className="btn btn-primary">
            Create Clusters
          </button>
        </div>

        <div className="view-tabs">
          <button 
            className={activeView === 'clusters' ? 'view-tab active' : 'view-tab'}
            onClick={() => setActiveView('clusters')}
          >
            Student Clusters
          </button>
          <button 
            className={activeView === 'interventions' ? 'view-tab active' : 'view-tab'}
            onClick={() => setActiveView('interventions')}
          >
            Interventions
          </button>
        </div>

        {activeView === 'clusters' && (
          <div className="view-content">
            <div className="card">
              <h3>Student Clusters</h3>
              <p style={{ color: '#6b7280', marginTop: 0 }}>
                Cluster Visualization (hover points for student details)
              </p>
              {renderScatter()}
              <div style={{ height: 12 }} />
              {dashboardData?.clusters?.length === 0 ? (
                <p>No clusters created yet. Click "Create Clusters" to group students with similar needs.</p>
              ) : (
                <div className="clusters-grid">
                  {dashboardData?.clusters?.map(cluster => (
                    <div key={cluster.id} className="cluster-card">
                      <h4>{cluster.cluster_name}</h4>
                      <p className="cluster-type">{cluster.cluster_type}</p>
                      <p className="cluster-description">{cluster.description}</p>
                      <div className="cluster-stats">
                        <span>{cluster.student_count} students</span>
                      </div>
                      <button 
                        onClick={() => fetchInterventionSuggestions(cluster.id, cluster.cluster_name)}
                        className="btn btn-primary btn-small"
                      >
                        Get Suggestions
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeView === 'interventions' && (
          <div className="view-content">
            <div className="card">
              <h3>Intervention History</h3>
              <table className="table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Cluster</th>
                    <th>Type</th>
                    <th>Activity</th>
                    <th>Status</th>
                    <th>Effectiveness</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboardData?.interventions?.map(intervention => (
                    <React.Fragment key={intervention.id}>
                      <tr
                        onClick={() => setExpandedInterventionId(expandedInterventionId === intervention.id ? null : intervention.id)}
                        style={{ cursor: 'pointer' }}
                        title="Click to expand"
                      >
                        <td>{intervention.student_name}</td>
                        <td>{intervention.cluster_name || '-'}</td>
                        <td>{intervention.intervention_type}</td>
                        <td>
                          <span style={{ marginRight: 8 }}>
                            {intervention.status === 'completed' ? '✓' : intervention.status === 'active' ? '⏳' : '•'}
                          </span>
                          {(intervention.activity_description || '').substring(0, 60)}
                          {(intervention.activity_description || '').length > 60 ? '...' : ''}
                        </td>
                      <td>
                        <span className={`badge badge-${intervention.status}`}>
                          {intervention.status}
                        </span>
                      </td>
                      <td>{intervention.effectiveness_score || '-'}</td>
                      </tr>
                      {expandedInterventionId === intervention.id && (
                        <tr>
                          <td colSpan="6" style={{ background: '#f9fafb' }}>
                            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                              <div><strong>Start:</strong> {intervention.start_date ? new Date(intervention.start_date).toLocaleDateString() : '-'}</div>
                              <div><strong>End:</strong> {intervention.end_date ? new Date(intervention.end_date).toLocaleDateString() : '-'}</div>
                              <div><strong>Details:</strong> {intervention.activity_description || '-'}</div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Suggestions Modal */}
      {suggestionsModal.open && (
        <div className="modal-backdrop" onClick={() => setSuggestionsModal({ open: false, suggestions: [], clusterName: '' })}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '700px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <div>
                <h3 style={{ margin: 0 }}>Intervention Suggestions</h3>
                <p className="subtitle" style={{ margin: '4px 0 0' }}>{suggestionsModal.clusterName}</p>
              </div>
              <button className="icon-button" onClick={() => setSuggestionsModal({ open: false, suggestions: [], clusterName: '' })}>✕</button>
            </div>

            <div className="modal-body">
              {suggestionsModal.suggestions.length === 0 ? (
                <p style={{ color: '#6b7280', textAlign: 'center', padding: '20px' }}>No suggestions available for this cluster.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {suggestionsModal.suggestions.map((suggestion, idx) => (
                    <div key={idx} style={{ 
                      border: '1px solid #e5e7eb', 
                      borderRadius: '8px', 
                      padding: '16px',
                      background: suggestion.type === 'group' ? '#f0f9ff' : suggestion.type === 'hybrid' ? '#faf5ff' : '#fef3c7'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <div>
                          <h4 style={{ margin: 0, color: '#111827' }}>{suggestion.title}</h4>
                          <span style={{ 
                            fontSize: '12px', 
                            padding: '2px 8px', 
                            borderRadius: '4px',
                            background: suggestion.type === 'group' ? '#3b82f6' : suggestion.type === 'hybrid' ? '#8b5cf6' : '#f59e0b',
                            color: 'white',
                            display: 'inline-block',
                            marginTop: '4px'
                          }}>
                            {suggestion.type === 'group' ? 'Group' : suggestion.type === 'hybrid' ? 'Hybrid' : 'Individual'}
                          </span>
                        </div>
                        {suggestion.priority && (
                          <span style={{
                            fontSize: '12px',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            background: suggestion.priority === 'high' ? '#ef4444' : suggestion.priority === 'medium' ? '#f59e0b' : '#10b981',
                            color: 'white'
                          }}>
                            {suggestion.priority}
                          </span>
                        )}
                      </div>
                      
                      <p style={{ margin: '8px 0', color: '#4b5563' }}>{suggestion.description}</p>
                      
                      {suggestion.activities && suggestion.activities.length > 0 && (
                        <div style={{ marginTop: '12px' }}>
                          <strong style={{ fontSize: '14px', color: '#111827' }}>Activities:</strong>
                          <ul style={{ margin: '8px 0 0 20px', padding: 0, color: '#4b5563' }}>
                            {suggestion.activities.map((activity, actIdx) => (
                              <li key={actIdx} style={{ marginBottom: '4px' }}>{activity}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {(suggestion.duration || suggestion.frequency) && (
                        <div style={{ marginTop: '12px', display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '13px', color: '#6b7280' }}>
                          {suggestion.duration && <span><strong>Duration:</strong> {suggestion.duration}</span>}
                          {suggestion.frequency && <span><strong>Frequency:</strong> {suggestion.frequency}</span>}
                        </div>
                      )}
                      
                      {suggestion.expectedOutcome && (
                        <div style={{ marginTop: '12px', padding: '8px', background: '#f0fdf4', borderRadius: '4px', fontSize: '13px' }}>
                          <strong style={{ color: '#166534' }}>Expected Outcome:</strong>
                          <p style={{ margin: '4px 0 0', color: '#15803d' }}>{suggestion.expectedOutcome}</p>
                        </div>
                      )}
                      
                      {suggestion.materials && (
                        <div style={{ marginTop: '12px', fontSize: '13px', color: '#6b7280' }}>
                          <strong>Materials Needed:</strong> {suggestion.materials}
                        </div>
                      )}
                      
                      {suggestion.groupSizeNote && (
                        <div style={{ marginTop: '12px', padding: '8px', background: '#eff6ff', borderRadius: '4px', fontSize: '13px', color: '#1e40af' }}>
                          <strong>Group Size Note:</strong> {suggestion.groupSizeNote}
                        </div>
                      )}
                      
                      {suggestion.note && (
                        <div style={{ marginTop: '12px', padding: '8px', background: '#fef3c7', borderRadius: '4px', fontSize: '13px', color: '#92400e' }}>
                          <strong>ℹ️ Note:</strong> {suggestion.note}
                        </div>
                      )}
                      
                      {suggestion.clusterInsights && (
                        <div style={{ marginTop: '12px', padding: '10px', background: '#f0f9ff', borderRadius: '4px', fontSize: '13px', border: '1px solid #bfdbfe' }}>
                          <strong style={{ color: '#1e40af', display: 'block', marginBottom: '6px' }}>📊 Cluster Analysis:</strong>
                          {suggestion.clusterInsights.averageScore !== undefined && (
                            <div style={{ marginBottom: '4px' }}>
                              <strong>Average Academic Score:</strong> {suggestion.clusterInsights.averageScore}%
                            </div>
                          )}
                          {suggestion.clusterInsights.averageAttendance !== undefined && (
                            <div style={{ marginBottom: '4px' }}>
                              <strong>Average Attendance:</strong> {suggestion.clusterInsights.averageAttendance}%
                            </div>
                          )}
                          {suggestion.clusterInsights.weakSubjects && suggestion.clusterInsights.weakSubjects.length > 0 && (
                            <div style={{ marginBottom: '4px' }}>
                              <strong>Common Weak Subjects:</strong> {suggestion.clusterInsights.weakSubjects.join(', ')}
                            </div>
                          )}
                          {suggestion.clusterInsights.negativeBehaviors !== undefined && (
                            <div style={{ marginBottom: '4px' }}>
                              <strong>Behavioral Incidents:</strong> {suggestion.clusterInsights.negativeBehaviors} total
                              {suggestion.clusterInsights.highSeverityIssues > 0 && (
                                <span style={{ color: '#dc2626' }}> ({suggestion.clusterInsights.highSeverityIssues} high severity)</span>
                              )}
                            </div>
                          )}
                          {suggestion.clusterInsights.categories && suggestion.clusterInsights.categories.length > 0 && (
                            <div style={{ marginBottom: '4px' }}>
                              <strong>Behavioral Categories:</strong> {suggestion.clusterInsights.categories.join(', ')}
                            </div>
                          )}
                          <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px solid #bfdbfe' }}>
                            <strong>Risk Level:</strong> <span style={{ 
                              color: suggestion.clusterInsights.riskLevel === 'high' ? '#dc2626' : 
                                     suggestion.clusterInsights.riskLevel === 'low' ? '#16a34a' : '#f59e0b',
                              fontWeight: 600
                            }}>{suggestion.clusterInsights.riskLevel.toUpperCase()}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => setSuggestionsModal({ open: false, suggestions: [], clusterName: '' })}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImprovementDashboard;