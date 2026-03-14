import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import api from "../utils/api";
import TeacherNavbar from "./shared/TeacherNavbar";
import "./ImprovementDashboard.css";

const ImprovementDashboard = ({ user, onLogout }) => {
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState("clusters");
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [expandedInterventionId, setExpandedInterventionId] = useState(null);
  const [suggestionsModal, setSuggestionsModal] = useState({
    open: false,
    suggestions: [],
    clusterName: "",
    clusterId: null,
  });
  const [submittingProgress, setSubmittingProgress] = useState(false);
  const [progressForm, setProgressForm] = useState({
    student_id: "",
    assessment_score: "",
    assignment_result: "",
    task_completed: false,
  });

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchInterventionSuggestions = async (clusterId, clusterName) => {
    try {
      const res = await api.get(
        `/components/intervention-suggestions?cluster_id=${clusterId}`,
      );
      setSuggestionsModal({
        open: true,
        suggestions: res.data.suggestions || [],
        clusterName: clusterName || "Cluster",
        clusterId,
      });
    } catch (error) {
      alert(
        "Error fetching suggestions: " +
          (error.response?.data?.error || error.message),
      );
    }
  };

  const createTaskFromSuggestion = async (suggestion) => {
    if (!suggestionsModal.clusterId) {
      alert("No cluster selected for task creation.");
      return;
    }

    try {
      const res = await api.post("/components/intervention-tasks", {
        cluster_id: suggestionsModal.clusterId,
        suggestion,
      });
      const count = res?.data?.created_count || 0;
      alert(`Task(s) created successfully${count ? `: ${count}` : ""}`);
      await fetchDashboardData();
    } catch (error) {
      alert(
        "Error creating tasks: " +
          (error.response?.data?.error || error.message),
      );
    }
  };

  const updateInterventionTask = async (taskId, updates) => {
    try {
      await api.patch(`/components/intervention-tasks/${taskId}`, updates);
      await fetchDashboardData();
    } catch (error) {
      alert(
        "Error updating task: " +
          (error.response?.data?.error || error.message),
      );
    }
  };

  const fetchDashboardData = async () => {
    try {
      const res = await api.get("/components/improvement-dashboard");
      setDashboardData(res.data);
    } catch (error) {
      console.error("Error fetching dashboard:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClusters = async () => {
    try {
      await api.post("/components/create-clusters");
      alert("Clusters created successfully!");
      fetchDashboardData();
    } catch (error) {
      alert("Error creating clusters");
    }
  };

  const clusterColors = (clusters) => {
    const palette = [
      "#2563eb",
      "#16a34a",
      "#f59e0b",
      "#ef4444",
      "#8b5cf6",
      "#06b6d4",
    ];
    const map = {};
    (clusters || []).forEach((c, idx) => {
      map[c.id] = palette[idx % palette.length];
    });
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

    const xs = points.map((p) => Number(p.academic_score) || 0);
    const ys = points.map((p) => Number(p.behavioral_score) || 0);
    const xmin = Math.min(...xs, 0);
    const xmax = Math.max(...xs, 100);
    const ymin = Math.min(...ys, 0);
    const ymax = Math.max(...ys, 100);

    const xScale = (x) =>
      pad + ((x - xmin) / Math.max(1e-6, xmax - xmin)) * (width - pad * 2);
    const yScale = (y) =>
      height -
      pad -
      ((y - ymin) / Math.max(1e-6, ymax - ymin)) * (height - pad * 2);

    const colors = clusterColors(dashboardData?.clusters);

    return (
      <div style={{ position: "relative" }}>
        <svg
          width={width}
          height={height}
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            background: "#fff",
          }}
        >
          <line
            x1={pad}
            y1={height - pad}
            x2={width - pad}
            y2={height - pad}
            stroke="#9ca3af"
          />
          <line x1={pad} y1={pad} x2={pad} y2={height - pad} stroke="#9ca3af" />
          <text
            x={width / 2}
            y={height - 8}
            textAnchor="middle"
            fill="#6b7280"
            fontSize="12"
          >
            Academic Score
          </text>
          <text
            x={12}
            y={height / 2}
            textAnchor="middle"
            fill="#6b7280"
            fontSize="12"
            transform={`rotate(-90 12 ${height / 2})`}
          >
            Behavioral Score
          </text>

          {points.map((p) => {
            const x = xScale(Number(p.academic_score) || 0);
            const y = yScale(Number(p.behavioral_score) || 0);
            const fill = colors[p.cluster_id] || "#2563eb";
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
              position: "absolute",
              left: Math.min(width - 220, Math.max(0, hoveredPoint.x + 10)),
              top: Math.max(0, hoveredPoint.y - 10),
              width: 210,
              background: "rgba(17,24,39,0.95)",
              color: "white",
              padding: 10,
              borderRadius: 8,
              fontSize: 12,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 6 }}>
              {hoveredPoint.student_name}
            </div>
            <div>Cluster: {hoveredPoint.cluster_name}</div>
            <div>
              Academic: {Number(hoveredPoint.academic_score).toFixed(1)}%
            </div>
            <div>
              Attendance: {Number(hoveredPoint.attendance_rate).toFixed(1)}%
            </div>
            <div>
              Behavioral: {Number(hoveredPoint.behavioral_score).toFixed(1)}%
            </div>
          </div>
        )}
      </div>
    );
  };

  const getProgressSeries = () => {
    const rows = dashboardData?.progress || [];
    const filtered = selectedStudentId
      ? rows.filter((r) => String(r.student_id) === String(selectedStudentId))
      : rows;
    return filtered
      .map((r) => ({
        t: new Date(r.recorded_at).getTime(),
        score: Number(r.assessment_score ?? r.assignment_result ?? 0) || 0,
      }))
      .filter((x) => x.score > 0 && Number.isFinite(x.t))
      .sort((a, b) => a.t - b.t);
  };

  const getInterventionSummary = () => {
    const interventions = dashboardData?.interventions || [];
    const total = interventions.length;
    const completed = interventions.filter(
      (i) => i.status === "completed",
    ).length;
    const active = interventions.filter((i) => i.status === "active").length;
    const paused = interventions.filter((i) => i.status === "paused").length;
    const cancelled = interventions.filter(
      (i) => i.status === "cancelled",
    ).length;
    const completionRate =
      total > 0 ? Math.round((completed / total) * 100) : 0;

    return { total, completed, active, paused, cancelled, completionRate };
  };

  const getStudentOptions = () => {
    const fromProgress = (dashboardData?.progress || []).map((p) => [
      p.student_id,
      p.student_name,
    ]);
    const fromClusters = (dashboardData?.clusterPoints || []).map((p) => [
      p.student_id,
      p.student_name,
    ]);
    return Array.from(new Map([...fromProgress, ...fromClusters]).entries());
  };

  const submitProgressEntry = async (e) => {
    e.preventDefault();
    if (!progressForm.student_id) {
      alert("Please select a student.");
      return;
    }

    const assessmentScore =
      progressForm.assessment_score === ""
        ? null
        : Number(progressForm.assessment_score);
    const assignmentResult =
      progressForm.assignment_result === ""
        ? null
        : Number(progressForm.assignment_result);

    if (
      assessmentScore !== null &&
      (assessmentScore < 0 || assessmentScore > 100)
    ) {
      alert("Assessment score must be between 0 and 100.");
      return;
    }

    if (
      assignmentResult !== null &&
      (assignmentResult < 0 || assignmentResult > 100)
    ) {
      alert("Assignment result must be between 0 and 100.");
      return;
    }

    try {
      setSubmittingProgress(true);
      await api.post("/components/track-progress", {
        student_id: Number(progressForm.student_id),
        assessment_score: assessmentScore,
        assignment_result: assignmentResult,
        task_completed: !!progressForm.task_completed,
      });

      setProgressForm({
        student_id: progressForm.student_id,
        assessment_score: "",
        assignment_result: "",
        task_completed: false,
      });

      await fetchDashboardData();
      alert("Progress entry saved.");
    } catch (error) {
      alert(
        "Error saving progress: " +
          (error.response?.data?.error || error.message),
      );
    } finally {
      setSubmittingProgress(false);
    }
  };

  const renderLineChart = () => {
    const data = getProgressSeries();
    if (!data.length) return <p>No progress data yet.</p>;

    const width = 640;
    const height = 240;
    const pad = 30;

    const ts = data.map((d) => d.t);
    const vs = data.map((d) => d.score);
    const tmin = Math.min(...ts);
    const tmax = Math.max(...ts);
    const vmin = Math.min(...vs, 0);
    const vmax = Math.max(...vs, 100);

    const xScale = (t) =>
      pad + ((t - tmin) / Math.max(1e-6, tmax - tmin)) * (width - pad * 2);
    const yScale = (v) =>
      height -
      pad -
      ((v - vmin) / Math.max(1e-6, vmax - vmin)) * (height - pad * 2);

    const d = data
      .map(
        (pt, i) =>
          `${i === 0 ? "M" : "L"} ${xScale(pt.t).toFixed(1)} ${yScale(pt.score).toFixed(1)}`,
      )
      .join(" ");

    return (
      <svg
        width={width}
        height={height}
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          background: "#fff",
        }}
      >
        <line
          x1={pad}
          y1={height - pad}
          x2={width - pad}
          y2={height - pad}
          stroke="#9ca3af"
        />
        <line x1={pad} y1={pad} x2={pad} y2={height - pad} stroke="#9ca3af" />
        <path d={d} fill="none" stroke="#2563eb" strokeWidth="2" />
        {data.map((pt, idx) => (
          <circle
            key={idx}
            cx={xScale(pt.t)}
            cy={yScale(pt.score)}
            r={3}
            fill="#2563eb"
          />
        ))}
      </svg>
    );
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  const interventionSummary = getInterventionSummary();
  const studentOptions = getStudentOptions();

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
            className={
              activeView === "clusters" ? "view-tab active" : "view-tab"
            }
            onClick={() => setActiveView("clusters")}
          >
            Student Clusters
          </button>
          <button
            className={
              activeView === "interventions" ? "view-tab active" : "view-tab"
            }
            onClick={() => setActiveView("interventions")}
          >
            Interventions
          </button>
          <button
            className={
              activeView === "progress" ? "view-tab active" : "view-tab"
            }
            onClick={() => setActiveView("progress")}
          >
            Progress Tracking
          </button>
        </div>

        {activeView === "clusters" && (
          <div className="view-content">
            <div className="card">
              <h3>Student Clusters</h3>
              <p style={{ color: "#6b7280", marginTop: 0 }}>
                Cluster Visualization (hover points for student details)
              </p>
              {renderScatter()}
              <div style={{ height: 12 }} />
              {dashboardData?.clusters?.length === 0 ? (
                <p>
                  No clusters created yet. Click "Create Clusters" to group
                  students with similar needs.
                </p>
              ) : (
                <div className="clusters-grid">
                  {dashboardData?.clusters?.map((cluster) => (
                    <div key={cluster.id} className="cluster-card">
                      <h4>{cluster.cluster_name}</h4>
                      <p className="cluster-type">{cluster.cluster_type}</p>
                      <p className="cluster-description">
                        {cluster.description}
                      </p>
                      <div className="cluster-stats">
                        <span>{cluster.student_count} students</span>
                      </div>
                      <button
                        onClick={() =>
                          fetchInterventionSuggestions(
                            cluster.id,
                            cluster.cluster_name,
                          )
                        }
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

        {activeView === "interventions" && (
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
                  {dashboardData?.interventions?.map((intervention) => (
                    <React.Fragment key={intervention.id}>
                      <tr
                        onClick={() =>
                          setExpandedInterventionId(
                            expandedInterventionId === intervention.id
                              ? null
                              : intervention.id,
                          )
                        }
                        style={{ cursor: "pointer" }}
                        title="Click to expand"
                      >
                        <td>{intervention.student_name}</td>
                        <td>{intervention.cluster_name || "-"}</td>
                        <td>{intervention.intervention_type}</td>
                        <td>
                          <span style={{ marginRight: 8 }}>
                            {intervention.status === "completed"
                              ? "✓"
                              : intervention.status === "active"
                                ? "⏳"
                                : "•"}
                          </span>
                          {(intervention.activity_description || "").substring(
                            0,
                            60,
                          )}
                          {(intervention.activity_description || "").length > 60
                            ? "..."
                            : ""}
                        </td>
                        <td>
                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              alignItems: "center",
                            }}
                          >
                            <span
                              className={`badge badge-${intervention.status}`}
                            >
                              {intervention.status}
                            </span>
                            <select
                              value={intervention.status || "active"}
                              onChange={(e) =>
                                updateInterventionTask(intervention.id, {
                                  status: e.target.value,
                                })
                              }
                              className="input"
                              style={{
                                minWidth: 110,
                                height: 32,
                                padding: "4px 8px",
                              }}
                            >
                              <option value="active">active</option>
                              <option value="paused">paused</option>
                              <option value="completed">completed</option>
                              <option value="cancelled">cancelled</option>
                            </select>
                          </div>
                        </td>
                        <td>{intervention.effectiveness_score || "-"}</td>
                      </tr>
                      {expandedInterventionId === intervention.id && (
                        <tr>
                          <td colSpan="6" style={{ background: "#f9fafb" }}>
                            <div
                              style={{
                                display: "flex",
                                gap: 16,
                                flexWrap: "wrap",
                              }}
                            >
                              <div>
                                <strong>Start:</strong>{" "}
                                {intervention.start_date
                                  ? new Date(
                                      intervention.start_date,
                                    ).toLocaleDateString()
                                  : "-"}
                              </div>
                              <div>
                                <strong>End:</strong>{" "}
                                {intervention.end_date
                                  ? new Date(
                                      intervention.end_date,
                                    ).toLocaleDateString()
                                  : "-"}
                              </div>
                              <div>
                                <strong>Details:</strong>{" "}
                                {intervention.activity_description || "-"}
                              </div>
                              {intervention.status !== "completed" && (
                                <button
                                  className="btn btn-primary btn-small"
                                  onClick={() =>
                                    updateInterventionTask(intervention.id, {
                                      status: "completed",
                                    })
                                  }
                                >
                                  Mark Completed
                                </button>
                              )}
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

        {activeView === "progress" && (
          <div className="view-content">
            <div className="card">
              <h3>Progress Tracking</h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                  gap: 10,
                  marginBottom: 14,
                }}
              >
                <div
                  style={{
                    background: "#f8fafc",
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    padding: 10,
                  }}
                >
                  <div style={{ fontSize: 12, color: "#64748b" }}>
                    Total Tasks
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>
                    {interventionSummary.total}
                  </div>
                </div>
                <div
                  style={{
                    background: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    borderRadius: 8,
                    padding: 10,
                  }}
                >
                  <div style={{ fontSize: 12, color: "#166534" }}>
                    Completed
                  </div>
                  <div
                    style={{ fontSize: 22, fontWeight: 700, color: "#166534" }}
                  >
                    {interventionSummary.completed}
                  </div>
                </div>
                <div
                  style={{
                    background: "#eff6ff",
                    border: "1px solid #bfdbfe",
                    borderRadius: 8,
                    padding: 10,
                  }}
                >
                  <div style={{ fontSize: 12, color: "#1d4ed8" }}>Active</div>
                  <div
                    style={{ fontSize: 22, fontWeight: 700, color: "#1d4ed8" }}
                  >
                    {interventionSummary.active}
                  </div>
                </div>
                <div
                  style={{
                    background: "#fffbeb",
                    border: "1px solid #fde68a",
                    borderRadius: 8,
                    padding: 10,
                  }}
                >
                  <div style={{ fontSize: 12, color: "#92400e" }}>
                    Completion Rate
                  </div>
                  <div
                    style={{ fontSize: 22, fontWeight: 700, color: "#92400e" }}
                  >
                    {interventionSummary.completionRate}%
                  </div>
                </div>
              </div>

              <form
                onSubmit={submitProgressEntry}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 14,
                  background: "#fafafa",
                }}
              >
                <h4 style={{ margin: "0 0 10px" }}>Teacher Progress Form</h4>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 10,
                  }}
                >
                  <div>
                    <label style={{ fontSize: 12, color: "#475569" }}>
                      Student
                    </label>
                    <select
                      className="input"
                      value={progressForm.student_id}
                      onChange={(e) =>
                        setProgressForm({
                          ...progressForm,
                          student_id: e.target.value,
                        })
                      }
                      required
                    >
                      <option value="">Select student</option>
                      {studentOptions.map(([id, name]) => (
                        <option key={id} value={id}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: 12, color: "#475569" }}>
                      Assessment Score (0-100)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      className="input"
                      value={progressForm.assessment_score}
                      onChange={(e) =>
                        setProgressForm({
                          ...progressForm,
                          assessment_score: e.target.value,
                        })
                      }
                      placeholder="e.g. 72"
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 12, color: "#475569" }}>
                      Assignment Result (0-100)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      className="input"
                      value={progressForm.assignment_result}
                      onChange={(e) =>
                        setProgressForm({
                          ...progressForm,
                          assignment_result: e.target.value,
                        })
                      }
                      placeholder="e.g. 68"
                    />
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    marginTop: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <label
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <input
                      type="checkbox"
                      checked={progressForm.task_completed}
                      onChange={(e) =>
                        setProgressForm({
                          ...progressForm,
                          task_completed: e.target.checked,
                        })
                      }
                    />
                    Mark related learning task completed
                  </label>

                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={submittingProgress}
                  >
                    {submittingProgress ? "Saving..." : "Save Progress"}
                  </button>
                </div>
              </form>

              <div
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                  flexWrap: "wrap",
                  marginBottom: 12,
                }}
              >
                <label style={{ fontWeight: 600 }}>Student trend:</label>
                <select
                  className="input"
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  style={{ maxWidth: 320 }}
                >
                  <option value="">All students (average view)</option>
                  {Array.from(
                    new Map(
                      (dashboardData?.progress || []).map((p) => [
                        p.student_id,
                        p.student_name,
                      ]),
                    ).entries(),
                  ).map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              {renderLineChart()}
              <div style={{ height: 12 }} />
              <table className="table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Subject</th>
                    <th>Section</th>
                    <th>Assessment Score</th>
                    <th>Trend</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboardData?.progress?.map((progress) => (
                    <tr key={progress.id}>
                      <td>{progress.student_name}</td>
                      <td>{progress.subject || "-"}</td>
                      <td>{progress.section || "-"}</td>
                      <td>{progress.assessment_score || "-"}</td>
                      <td>
                        <span
                          className={`trend trend-${progress.improvement_trend}`}
                        >
                          {progress.improvement_trend}
                        </span>
                      </td>
                      <td>
                        {new Date(progress.recorded_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Suggestions Modal */}
      {suggestionsModal.open && (
        <div
          className="modal-backdrop"
          onClick={() =>
            setSuggestionsModal({
              open: false,
              suggestions: [],
              clusterName: "",
              clusterId: null,
            })
          }
        >
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "700px", maxHeight: "90vh", overflowY: "auto" }}
          >
            <div className="modal-header">
              <div>
                <h3 style={{ margin: 0 }}>Intervention Suggestions</h3>
                <p className="subtitle" style={{ margin: "4px 0 0" }}>
                  {suggestionsModal.clusterName}
                </p>
              </div>
              <button
                className="icon-button"
                onClick={() =>
                  setSuggestionsModal({
                    open: false,
                    suggestions: [],
                    clusterName: "",
                    clusterId: null,
                  })
                }
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              {suggestionsModal.suggestions.length === 0 ? (
                <p
                  style={{
                    color: "#6b7280",
                    textAlign: "center",
                    padding: "20px",
                  }}
                >
                  No suggestions available for this cluster.
                </p>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "16px",
                  }}
                >
                  {suggestionsModal.suggestions.map((suggestion, idx) => (
                    <div
                      key={idx}
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: "8px",
                        padding: "16px",
                        background:
                          suggestion.type === "group"
                            ? "#f0f9ff"
                            : suggestion.type === "hybrid"
                              ? "#faf5ff"
                              : "#fef3c7",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "start",
                          justifyContent: "space-between",
                          marginBottom: "8px",
                        }}
                      >
                        <div>
                          <h4 style={{ margin: 0, color: "#111827" }}>
                            {suggestion.title}
                          </h4>
                          <span
                            style={{
                              fontSize: "12px",
                              padding: "2px 8px",
                              borderRadius: "4px",
                              background:
                                suggestion.type === "group"
                                  ? "#3b82f6"
                                  : suggestion.type === "hybrid"
                                    ? "#8b5cf6"
                                    : "#f59e0b",
                              color: "white",
                              display: "inline-block",
                              marginTop: "4px",
                            }}
                          >
                            {suggestion.type === "group"
                              ? "Group"
                              : suggestion.type === "hybrid"
                                ? "Hybrid"
                                : "Individual"}
                          </span>
                        </div>
                        {suggestion.priority && (
                          <span
                            style={{
                              fontSize: "12px",
                              padding: "2px 8px",
                              borderRadius: "4px",
                              background:
                                suggestion.priority === "high"
                                  ? "#ef4444"
                                  : suggestion.priority === "medium"
                                    ? "#f59e0b"
                                    : "#10b981",
                              color: "white",
                            }}
                          >
                            {suggestion.priority}
                          </span>
                        )}
                      </div>

                      <p style={{ margin: "8px 0", color: "#4b5563" }}>
                        {suggestion.description}
                      </p>

                      {suggestion.activities &&
                        suggestion.activities.length > 0 && (
                          <div style={{ marginTop: "12px" }}>
                            <strong
                              style={{ fontSize: "14px", color: "#111827" }}
                            >
                              Activities:
                            </strong>
                            <ul
                              style={{
                                margin: "8px 0 0 20px",
                                padding: 0,
                                color: "#4b5563",
                              }}
                            >
                              {suggestion.activities.map((activity, actIdx) => (
                                <li
                                  key={actIdx}
                                  style={{ marginBottom: "4px" }}
                                >
                                  {activity}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                      {(suggestion.duration || suggestion.frequency) && (
                        <div
                          style={{
                            marginTop: "12px",
                            display: "flex",
                            gap: "16px",
                            flexWrap: "wrap",
                            fontSize: "13px",
                            color: "#6b7280",
                          }}
                        >
                          {suggestion.duration && (
                            <span>
                              <strong>Duration:</strong> {suggestion.duration}
                            </span>
                          )}
                          {suggestion.frequency && (
                            <span>
                              <strong>Frequency:</strong> {suggestion.frequency}
                            </span>
                          )}
                        </div>
                      )}

                      {suggestion.expectedOutcome && (
                        <div
                          style={{
                            marginTop: "12px",
                            padding: "8px",
                            background: "#f0fdf4",
                            borderRadius: "4px",
                            fontSize: "13px",
                          }}
                        >
                          <strong style={{ color: "#166534" }}>
                            Expected Outcome:
                          </strong>
                          <p style={{ margin: "4px 0 0", color: "#15803d" }}>
                            {suggestion.expectedOutcome}
                          </p>
                        </div>
                      )}

                      {suggestion.materials && (
                        <div
                          style={{
                            marginTop: "12px",
                            fontSize: "13px",
                            color: "#6b7280",
                          }}
                        >
                          <strong>Materials Needed:</strong>{" "}
                          {suggestion.materials}
                        </div>
                      )}

                      {suggestion.groupSizeNote && (
                        <div
                          style={{
                            marginTop: "12px",
                            padding: "8px",
                            background: "#eff6ff",
                            borderRadius: "4px",
                            fontSize: "13px",
                            color: "#1e40af",
                          }}
                        >
                          <strong>Group Size Note:</strong>{" "}
                          {suggestion.groupSizeNote}
                        </div>
                      )}

                      {suggestion.note && (
                        <div
                          style={{
                            marginTop: "12px",
                            padding: "8px",
                            background: "#fef3c7",
                            borderRadius: "4px",
                            fontSize: "13px",
                            color: "#92400e",
                          }}
                        >
                          <strong>ℹ️ Note:</strong> {suggestion.note}
                        </div>
                      )}

                      {suggestion.clusterInsights && (
                        <div
                          style={{
                            marginTop: "12px",
                            padding: "10px",
                            background: "#f0f9ff",
                            borderRadius: "4px",
                            fontSize: "13px",
                            border: "1px solid #bfdbfe",
                          }}
                        >
                          <strong
                            style={{
                              color: "#1e40af",
                              display: "block",
                              marginBottom: "6px",
                            }}
                          >
                            📊 Cluster Analysis:
                          </strong>
                          {suggestion.clusterInsights.averageScore !==
                            undefined && (
                            <div style={{ marginBottom: "4px" }}>
                              <strong>Average Academic Score:</strong>{" "}
                              {suggestion.clusterInsights.averageScore}%
                            </div>
                          )}
                          {suggestion.clusterInsights.averageAttendance !==
                            undefined && (
                            <div style={{ marginBottom: "4px" }}>
                              <strong>Average Attendance:</strong>{" "}
                              {suggestion.clusterInsights.averageAttendance}%
                            </div>
                          )}
                          {suggestion.clusterInsights.weakSubjects &&
                            suggestion.clusterInsights.weakSubjects.length >
                              0 && (
                              <div style={{ marginBottom: "4px" }}>
                                <strong>Common Weak Subjects:</strong>{" "}
                                {suggestion.clusterInsights.weakSubjects.join(
                                  ", ",
                                )}
                              </div>
                            )}
                          {suggestion.clusterInsights.negativeBehaviors !==
                            undefined && (
                            <div style={{ marginBottom: "4px" }}>
                              <strong>Behavioral Incidents:</strong>{" "}
                              {suggestion.clusterInsights.negativeBehaviors}{" "}
                              total
                              {suggestion.clusterInsights.highSeverityIssues >
                                0 && (
                                <span style={{ color: "#dc2626" }}>
                                  {" "}
                                  (
                                  {
                                    suggestion.clusterInsights
                                      .highSeverityIssues
                                  }{" "}
                                  high severity)
                                </span>
                              )}
                            </div>
                          )}
                          {suggestion.clusterInsights.categories &&
                            suggestion.clusterInsights.categories.length >
                              0 && (
                              <div style={{ marginBottom: "4px" }}>
                                <strong>Behavioral Categories:</strong>{" "}
                                {suggestion.clusterInsights.categories.join(
                                  ", ",
                                )}
                              </div>
                            )}
                          <div
                            style={{
                              marginTop: "6px",
                              paddingTop: "6px",
                              borderTop: "1px solid #bfdbfe",
                            }}
                          >
                            <strong>Risk Level:</strong>{" "}
                            <span
                              style={{
                                color:
                                  suggestion.clusterInsights.riskLevel ===
                                  "high"
                                    ? "#dc2626"
                                    : suggestion.clusterInsights.riskLevel ===
                                        "low"
                                      ? "#16a34a"
                                      : "#f59e0b",
                                fontWeight: 600,
                              }}
                            >
                              {suggestion.clusterInsights.riskLevel.toUpperCase()}
                            </span>
                          </div>
                        </div>
                      )}

                      <div style={{ marginTop: "12px" }}>
                        <button
                          className="btn btn-primary btn-small"
                          onClick={() => createTaskFromSuggestion(suggestion)}
                        >
                          Create Task
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button
                className="btn btn-primary"
                onClick={() =>
                  setSuggestionsModal({
                    open: false,
                    suggestions: [],
                    clusterName: "",
                    clusterId: null,
                  })
                }
              >
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
