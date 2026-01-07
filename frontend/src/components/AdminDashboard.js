import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import './AdminDashboard.css';

const AdminDashboard = ({ user, onLogout }) => {
  const navigate = useNavigate();
  const [dashboardData, setDashboardData] = useState(null);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    fetchDashboardData();
    fetchTeachers();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const res = await api.get('/admin/dashboard');
      setDashboardData(res.data);
    } catch (error) {
      console.error('Error fetching dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTeachers = async () => {
    try {
      const res = await api.get('/admin/teachers');
      setTeachers(res.data);
    } catch (error) {
      console.error('Error fetching teachers:', error);
    }
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="admin-dashboard">
      <nav className="navbar">
        <div className="nav-content">
          <h1>School Administrator Dashboard</h1>
          <div className="nav-right">
            <span>Welcome, {user.name}</span>
            <button onClick={onLogout} className="btn btn-secondary">Logout</button>
          </div>
        </div>
      </nav>

      <div className="container">
        <div className="tabs">
          <button 
            className={activeTab === 'overview' ? 'tab active' : 'tab'}
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </button>
          <button 
            className={activeTab === 'teachers' ? 'tab active' : 'tab'}
            onClick={() => setActiveTab('teachers')}
          >
            Teachers
          </button>
          <button 
            className={activeTab === 'classes' ? 'tab active' : 'tab'}
            onClick={() => setActiveTab('classes')}
          >
            Classes/Grades
          </button>
          <button 
            className={activeTab === 'students' ? 'tab active' : 'tab'}
            onClick={() => setActiveTab('students')}
          >
            Students
          </button>
          <button 
            className={activeTab === 'school' ? 'tab active' : 'tab'}
            onClick={() => setActiveTab('school')}
          >
            School Profile
          </button>
        </div>

        {activeTab === 'overview' && dashboardData && (
          <div className="tab-content">
            <div className="stats-grid">
              <div className="stat-card">
                <h3>Teachers</h3>
                <p className="stat-number">{dashboardData.statistics.teachers}</p>
              </div>
              <div className="stat-card">
                <h3>Students</h3>
                <p className="stat-number">{dashboardData.statistics.students}</p>
              </div>
              <div className="stat-card">
                <h3>Classes</h3>
                <p className="stat-number">{dashboardData.statistics.classes}</p>
              </div>
            </div>

            <div className="card">
              <h2>Recent Teachers</h2>
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Class</th>
                    <th>Email Confirmed</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboardData.recentTeachers.map(teacher => (
                    <tr key={teacher.id}>
                      <td>{teacher.name}</td>
                      <td>{teacher.email}</td>
                      <td>{teacher.class_name || 'Not assigned'}</td>
                      <td>
                        {(() => {
                          const status = teacher.status || (teacher.email_verified ? 'verified' : teacher.credentials_sent ? 'sent' : 'pending');
                          switch(status) {
                            case 'verified':
                              return <span className="badge success" title="Email verified and credentials sent">✓ Verified</span>;
                            case 'sent':
                              return <span className="badge info" title="Credentials sent, awaiting email verification">📧 Sent</span>;
                            case 'pending':
                            default:
                              return <span className="badge warning" title="Credentials not sent yet">⏳ Pending</span>;
                          }
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'teachers' && (
          <TeacherManagement 
            teachers={teachers} 
            onRefresh={() => {
              fetchTeachers();
              // Also refresh classes when teachers are updated
              if (activeTab === 'classes') {
                // Classes will refresh when tab is switched
              }
            }}
            user={user}
          />
        )}

        {activeTab === 'classes' && (
          <ClassManagement 
            key={activeTab} // Force re-render when tab changes
            user={user} 
            teachers={teachers}
            onRefresh={fetchTeachers}
          />
        )}

        {activeTab === 'students' && (
          <StudentManagement user={user} />
        )}

        {activeTab === 'school' && (
          <SchoolProfile user={user} />
        )}
      </div>
    </div>
  );
};

// Teacher Management Component
const TeacherManagement = ({ teachers, onRefresh, user }) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState(null);
  const [classes, setClasses] = useState([]);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    grade: '',
    class_id: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchClasses();
  }, []);

  const fetchClasses = async () => {
    try {
      const res = await api.get('/admin/classes');
      setClasses(res.data);
    } catch (error) {
      console.error('Error fetching classes:', error);
    }
  };

  const handleEdit = (teacher) => {
    setEditingTeacher(teacher);
    setFormData({
      name: teacher.name,
      email: teacher.email,
      grade: teacher.grade || '',
      class_id: teacher.class_id || ''
    });
    setShowAddForm(true);
  };

  const handleCancel = () => {
    setShowAddForm(false);
    setEditingTeacher(null);
    setFormData({ name: '', email: '', grade: '', class_id: '' });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (editingTeacher) {
        // Update existing teacher
        // Only send grade if class_id is not selected
        const updateData = {
          name: formData.name,
          email: formData.email,
          class_id: formData.class_id || null
        };
        
        // If no class_id is selected but grade is provided, send grade to create new class
        if (!formData.class_id && formData.grade) {
          updateData.grade = parseInt(formData.grade);
        }
        
        await api.put(`/admin/teachers/${editingTeacher.id}`, updateData);
        alert('Teacher updated successfully!');
      } else {
        // Create new teacher
        await api.post('/admin/teachers', formData);
        alert('Teacher created successfully! Credentials sent to email.');
      }
      handleCancel();
      await onRefresh();
      // Refresh classes if we're on the classes tab (indirect refresh)
      // The classes tab will refresh when user switches to it
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save teacher');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tab-content">
      <div className="card">
        <div className="card-header">
          <h2>Manage Teachers</h2>
          <button 
            onClick={() => {
              if (showAddForm) {
                handleCancel();
              } else {
                setShowAddForm(true);
                setEditingTeacher(null);
                setFormData({ name: '', email: '', grade: '', class_id: '' });
                setError('');
              }
            }} 
            className="btn btn-primary"
          >
            {showAddForm ? 'Cancel' : 'Add Teacher'}
          </button>
        </div>

        {showAddForm && (
          <form onSubmit={handleSubmit} className="add-teacher-form">
            <h3>{editingTeacher ? 'Edit Teacher' : 'Add New Teacher'}</h3>
            <div className="form-row">
              <div className="form-group">
                <label>Name *</label>
                <input
                  type="text"
                  className="input"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Email *</label>
                <input
                  type="email"
                  className="input"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  disabled={!!editingTeacher}
                />
                {editingTeacher && <small style={{ color: '#666' }}>Email cannot be changed</small>}
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Grade (for new class)</label>
                <input
                  type="number"
                  className="input"
                  value={formData.grade}
                  onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                  min="1"
                  max="13"
                  disabled={!!formData.class_id}
                  placeholder="Enter grade (1-5)"
                />
                <small style={{ color: '#666' }}>
                  {formData.class_id 
                    ? 'Select a class instead' 
                    : editingTeacher 
                      ? 'Enter a grade to create/update class for this teacher'
                      : 'Creates a new class for this grade'}
                </small>
              </div>
              <div className="form-group">
                <label>Assign to Existing Class</label>
                <select
                  className="input"
                  value={formData.class_id}
                  onChange={(e) => {
                    const selectedClassId = e.target.value;
                    setFormData({ 
                      ...formData, 
                      class_id: selectedClassId,
                      grade: selectedClassId ? '' : formData.grade // Clear grade if class selected, keep if cleared
                    });
                  }}
                >
                  <option value="">-- Select Class (Optional) --</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} (Grade {c.grade})
                    </option>
                  ))}
                </select>
                <small style={{ color: '#666' }}>
                  {formData.class_id 
                    ? 'Teacher will be assigned to this class' 
                    : editingTeacher
                      ? 'Or enter a grade above to create/update a class'
                      : 'Or create a new class by entering a grade above'}
                </small>
              </div>
            </div>
            {error && <div className="error-message">{error}</div>}
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? (editingTeacher ? 'Updating...' : 'Creating...') : (editingTeacher ? 'Update Teacher' : 'Create Teacher')}
            </button>
          </form>
        )}

        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Class</th>
              <th>Grade</th>
              <th>Email Confirmed</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {teachers.map(teacher => (
              <tr key={teacher.id}>
                <td>{teacher.name}</td>
                <td>{teacher.email}</td>
                <td>{teacher.class_name || 'Not assigned'}</td>
                <td>{teacher.grade || '-'}</td>
                <td>
                  {(() => {
                    const status = teacher.status || (teacher.email_verified ? 'verified' : teacher.credentials_sent ? 'sent' : 'pending');
                    switch(status) {
                      case 'verified':
                        return <span className="badge success" title="Email verified and credentials sent">✓ Verified</span>;
                      case 'sent':
                        return <span className="badge info" title="Credentials sent, awaiting email verification">📧 Sent</span>;
                      case 'pending':
                      default:
                        return <span className="badge warning" title="Credentials not sent yet">⏳ Pending</span>;
                    }
                  })()}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                    <button 
                      onClick={() => handleEdit(teacher)}
                      className="btn btn-small"
                    >
                      Edit
                    </button>
                    {(!teacher.credentials_sent || teacher.status === 'pending') && (
                      <button
                        onClick={async () => {
                          if (!window.confirm(`Resend credentials email to ${teacher.email}?`)) return;
                          try {
                            const res = await api.post(`/admin/teachers/${teacher.id}/resend-credentials`);
                            alert(res.data.message || 'Credentials email sent successfully!');
                            onRefresh();
                          } catch (error) {
                            alert(error.response?.data?.error || 'Failed to resend credentials');
                          }
                        }}
                        className="btn btn-small"
                        style={{ backgroundColor: '#2196F3', color: 'white', border: 'none' }}
                        title="Resend credentials email"
                      >
                        📧 Resend
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Student Management Component
const StudentManagement = ({ user }) => {
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [assignClassId, setAssignClassId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadClassId, setUploadClassId] = useState('');

  useEffect(() => {
    fetchStudents();
    fetchClasses();
  }, []);

  const fetchStudents = async () => {
    try {
      const res = await api.get('/admin/students');
      setStudents(res.data);
    } catch (error) {
      console.error('Error fetching students:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchClasses = async () => {
    try {
      const res = await api.get('/admin/classes');
      setClasses(res.data);
    } catch (error) {
      console.error('Error fetching classes:', error);
    }
  };

  const handleSelectStudent = (studentId) => {
    setSelectedStudents(prev => 
      prev.includes(studentId) 
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId]
    );
  };

  const handleSelectAll = () => {
    if (selectedStudents.length === students.length) {
      setSelectedStudents([]);
    } else {
      setSelectedStudents(students.map(s => s.id));
    }
  };

  const handleBulkAssign = async () => {
    if (selectedStudents.length === 0) {
      alert('Please select at least one student');
      return;
    }

    if (!assignClassId) {
      alert('Please select a class');
      return;
    }

    if (!window.confirm(`Assign ${selectedStudents.length} student(s) to selected class?`)) {
      return;
    }

    try {
      const res = await api.post('/admin/students/assign', {
        student_ids: selectedStudents,
        class_id: parseInt(assignClassId)
      });
      
      alert(res.data.message);
      setSelectedStudents([]);
      setAssignClassId('');
      fetchStudents();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to assign students');
    }
  };

  const handleFileUpload = async (e) => {
    e.preventDefault();
    
    if (!uploadFile) {
      alert('Please select a file');
      return;
    }

    // Class selection is now optional - system will auto-detect from grade column
    // if (!uploadClassId) {
    //   alert('Please select a class for the students');
    //   return;
    // }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('class_id', uploadClassId);

      // Don't set Content-Type manually - axios will set it with boundary automatically
      const res = await api.post('/admin/students/upload', formData);

      alert(res.data.message || `Import complete: ${res.data.imported} imported, ${res.data.skipped} skipped`);
      setShowUploadForm(false);
      setUploadFile(null);
      setUploadClassId('');
      await fetchStudents();
    } catch (error) {
      console.error('Upload error:', error);
      console.error('Error response:', error.response);
      
      let errorMsg = 'Failed to upload students';
      if (error.response?.data?.error) {
        errorMsg = error.response.data.error;
      } else if (error.response?.data?.message) {
        errorMsg = error.response.data.message;
      } else if (error.message) {
        errorMsg = error.message;
      }
      
      alert(`Upload failed: ${errorMsg}\n\nPlease check:\n- File format (.xlsx, .xls, or .csv)\n- File has "Student ID" column\n- Class is selected\n- You are logged in as admin`);
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="tab-content">
      <div className="card">
        <div className="card-header">
          <h2>All Students</h2>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button 
              onClick={() => setShowUploadForm(!showUploadForm)}
              className="btn btn-primary"
            >
              {showUploadForm ? 'Cancel Upload' : 'Upload Students'}
            </button>
          </div>
        </div>

        {showUploadForm && (
          <div style={{ marginBottom: '20px', padding: '20px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
            <h3>Upload Students from Excel</h3>
            <form onSubmit={handleFileUpload}>
              <div className="form-group" style={{ marginBottom: '15px' }}>
                <label>Select Class (Optional)</label>
                <select
                  className="input"
                  value={uploadClassId}
                  onChange={(e) => setUploadClassId(e.target.value)}
                >
                  <option value="">-- Auto-detect from Grade column --</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} (Grade {c.grade})
                    </option>
                  ))}
                </select>
                <small style={{ display: 'block', marginTop: '5px', color: '#666' }}>
                  If your Excel has a "Grade" column, students will be automatically assigned to the correct class. 
                  Or select a class to assign all students to that class.
                </small>
              </div>
              <div className="form-group" style={{ marginBottom: '15px' }}>
                <label>Excel File (.xlsx, .xls, .csv) *</label>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => setUploadFile(e.target.files[0])}
                  required
                />
                <small style={{ display: 'block', marginTop: '5px', color: '#666' }}>
                  File should have columns: Student ID (or "No."), Name, Grade (optional but recommended for auto-assignment)
                </small>
              </div>
              <button 
                type="submit" 
                className="btn btn-primary" 
                disabled={uploading}
              >
                {uploading ? 'Uploading...' : 'Upload Students'}
              </button>
            </form>
          </div>
        )}

        {selectedStudents.length > 0 && (
          <div style={{ marginBottom: '15px', padding: '15px', backgroundColor: '#e3f2fd', borderRadius: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
              <strong>{selectedStudents.length} student(s) selected</strong>
              <select
                className="input"
                value={assignClassId}
                onChange={(e) => setAssignClassId(e.target.value)}
                style={{ width: '200px' }}
              >
                <option value="">-- Select Class --</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} (Grade {c.grade})
                  </option>
                ))}
              </select>
              <button 
                onClick={handleBulkAssign}
                className="btn btn-primary"
                disabled={!assignClassId}
              >
                Assign to Class
              </button>
              <button 
                onClick={() => setSelectedStudents([])}
                className="btn btn-secondary"
              >
                Clear Selection
              </button>
            </div>
          </div>
        )}

        <table className="table">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={selectedStudents.length === students.length && students.length > 0}
                  onChange={handleSelectAll}
                />
              </th>
              <th>Student ID</th>
              <th>Name</th>
              <th>Class</th>
              <th>Grade</th>
              <th>Teacher</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {students.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '20px' }}>
                  No students found. Upload students or they will be imported from the dataset.
                </td>
              </tr>
            ) : (
              students.map(student => (
                <tr key={student.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedStudents.includes(student.id)}
                      onChange={() => handleSelectStudent(student.id)}
                    />
                  </td>
                  <td>{student.student_id}</td>
                  <td>{student.name}</td>
                  <td>{student.class_name || <span style={{ color: '#999', fontStyle: 'italic' }}>Not assigned</span>}</td>
                  <td>{student.grade || '-'}</td>
                  <td>{student.teacher_name || <span style={{ color: '#999', fontStyle: 'italic' }}>No teacher</span>}</td>
                  <td>
                    <select
                      className="input"
                      value={student.class_id || ''}
                      onChange={async (e) => {
                        const newClassId = e.target.value;
                        if (!newClassId) return;
                        
                        try {
                          await api.post('/admin/students/assign', {
                            student_ids: [student.id],
                            class_id: parseInt(newClassId)
                          });
                          fetchStudents();
                        } catch (error) {
                          alert(error.response?.data?.error || 'Failed to assign student');
                        }
                      }}
                      style={{ fontSize: '12px', padding: '4px 8px' }}
                    >
                      <option value="">Change Class...</option>
                      {classes.map(c => (
                        <option key={c.id} value={c.id} selected={c.id === student.class_id}>
                          {c.name} (Grade {c.grade})
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// School Profile Component
const SchoolProfile = ({ user }) => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({});

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const res = await api.get('/admin/school-profile');
      setProfile(res.data);
      setFormData(res.data);
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      await api.put('/admin/school-profile', formData);
      setEditing(false);
      fetchProfile();
      alert('Profile updated successfully');
    } catch (error) {
      alert('Error updating profile');
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="tab-content">
      <div className="card">
        <div className="card-header">
          <h2>School Profile</h2>
          <button 
            onClick={() => editing ? handleSave() : setEditing(true)}
            className="btn btn-primary"
          >
            {editing ? 'Save' : 'Edit'}
          </button>
        </div>

        <div className="profile-form">
          <div className="form-group">
            <label>School Name</label>
            <input
              type="text"
              className="input"
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              disabled={!editing}
            />
          </div>
          <div className="form-group">
            <label>Registration Number</label>
            <input
              type="text"
              className="input"
              value={formData.registration_number || ''}
              disabled
            />
          </div>
          <div className="form-group">
            <label>Address</label>
            <textarea
              className="input"
              value={formData.address || ''}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              disabled={!editing}
              rows="3"
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Phone</label>
              <input
                type="tel"
                className="input"
                value={formData.phone || ''}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                disabled={!editing}
              />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                className="input"
                value={formData.email || ''}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                disabled={!editing}
              />
            </div>
          </div>
          <div className="form-group">
            <label>Principal Name</label>
            <input
              type="text"
              className="input"
              value={formData.principal_name || ''}
              onChange={(e) => setFormData({ ...formData, principal_name: e.target.value })}
              disabled={!editing}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

// Class Management Component
const ClassManagement = ({ user, teachers, onRefresh }) => {
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingClass, setEditingClass] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    grade: '',
    teacher_id: ''
  });
  const [error, setError] = useState('');

  const fetchClasses = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/classes');
      setClasses(res.data || []);
    } catch (error) {
      console.error('Error fetching classes:', error);
      setClasses([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClasses();
  }, []);

  // Refresh classes when teachers list changes (e.g., after creating teacher with grade)
  useEffect(() => {
    fetchClasses();
  }, [teachers]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    try {
      if (editingClass) {
        await api.put(`/admin/classes/${editingClass.id}`, formData);
        alert('Class updated successfully!');
      } else {
        await api.post('/admin/classes', formData);
        alert('Class created successfully!');
      }
      setShowAddForm(false);
      setEditingClass(null);
      setFormData({ name: '', grade: '', teacher_id: '' });
      await fetchClasses();
      if (onRefresh) onRefresh(); // Refresh teachers list if callback provided
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save class');
    }
  };

  const handleEdit = (classItem) => {
    setEditingClass(classItem);
    setFormData({
      name: classItem.name,
      grade: classItem.grade,
      teacher_id: classItem.teacher_id || ''
    });
    setShowAddForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this class? Students assigned to this class will be unassigned.')) {
      return;
    }

    try {
      await api.delete(`/admin/classes/${id}`);
      alert('Class deleted successfully!');
      await fetchClasses();
      if (onRefresh) onRefresh(); // Refresh teachers list if callback provided
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete class');
    }
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="tab-content">
      <div className="card">
        <div className="card-header">
          <h2>Manage Classes/Grades</h2>
          <button 
            onClick={() => {
              setShowAddForm(!showAddForm);
              setEditingClass(null);
              setFormData({ name: '', grade: '', teacher_id: '' });
            }} 
            className="btn btn-primary"
          >
            {showAddForm ? 'Cancel' : 'Add Class'}
          </button>
        </div>

        {showAddForm && (
          <form onSubmit={handleSubmit} className="add-teacher-form">
            <div className="form-row">
              <div className="form-group">
                <label>Class Name *</label>
                <input
                  type="text"
                  className="input"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Grade 1A, Grade 2B"
                  required
                />
              </div>
              <div className="form-group">
                <label>Grade *</label>
                <input
                  type="number"
                  className="input"
                  value={formData.grade}
                  onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                  min="1"
                  max="13"
                  required
                />
              </div>
            </div>
            <div className="form-group">
              <label>Assign Teacher (Optional)</label>
              <select
                className="input"
                value={formData.teacher_id}
                onChange={(e) => setFormData({ ...formData, teacher_id: e.target.value })}
              >
                <option value="">-- No Teacher Assigned --</option>
                {teachers.map(teacher => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.name} ({teacher.email})
                  </option>
                ))}
              </select>
              <small>You can assign a teacher now or later by editing the class.</small>
            </div>
            {error && <div className="error-message">{error}</div>}
            <button type="submit" className="btn btn-primary">
              {editingClass ? 'Update Class' : 'Create Class'}
            </button>
          </form>
        )}

        <table className="table">
          <thead>
            <tr>
              <th>Class Name</th>
              <th>Grade</th>
              <th>Teacher</th>
              <th>Students</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {classes.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center', padding: '20px' }}>
                  No classes found. Click "Add Class" to create one.
                </td>
              </tr>
            ) : (
              classes.map(classItem => (
                <tr key={classItem.id}>
                  <td>{classItem.name}</td>
                  <td>{classItem.grade}</td>
                  <td>
                    {classItem.teacher_name ? (
                      <span>{classItem.teacher_name}</span>
                    ) : (
                      <span style={{ color: '#999', fontStyle: 'italic' }}>Not assigned</span>
                    )}
                  </td>
                  <td>{classItem.student_count || 0}</td>
                  <td>
                    <button 
                      onClick={() => handleEdit(classItem)}
                      className="btn btn-small"
                      style={{ marginRight: '5px' }}
                    >
                      Edit
                    </button>
                    <button 
                      onClick={() => handleDelete(classItem.id)}
                      className="btn btn-small btn-danger"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminDashboard;

