import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import api from '../utils/api';
import './WeakStudents.css';

const WeakStudents = ({ teacher, onLogout }) => {
  const [searchParams] = useSearchParams();
  const classId = searchParams.get('classId');
  
  const [students, setStudents] = useState([]);
  const [weakStudents, setWeakStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState(classId || '');
  const [loading, setLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState('all'); // all | academic | behavioral | both
  const [editingStudent, setEditingStudent] = useState(null);
  const [formData, setFormData] = useState({ weak_subject: '', weak_section: '' });

  useEffect(() => {
    fetchClasses();
    if (selectedClass) {
      fetchStudents();
      fetchWeakStudents();
    }
  }, [selectedClass]);

  const fetchClasses = async () => {
    try {
      const res = await api.get(`/classes/teacher/${teacher.id}`);
      setClasses(res.data);
      if (!selectedClass && res.data.length > 0) {
        setSelectedClass(res.data[0].id);
      }
    } catch (error) {
      console.error('Error fetching classes:', error);
    }
  };

  const fetchStudents = async () => {
    if (!selectedClass) return;
    try {
      const res = await api.get(`/students/class/${selectedClass}`);
      setStudents(res.data);
    } catch (error) {
      console.error('Error fetching students:', error);
    }
  };

  const fetchWeakStudents = async () => {
    if (!selectedClass) return;
    try {
      const res = await api.get(`/weak-students/class/${selectedClass}`);
      setWeakStudents(res.data);
    } catch (error) {
      console.error('Error fetching weak students:', error);
    }
  };

  const identifyBehavioralWeakStudents = async () => {
    if (!selectedClass) return;
    setLoading(true);
    try {
      await api.post(`/weak-students/identify-behavioral/${selectedClass}`);
      fetchWeakStudents();
      alert('Behavioral weak students identified successfully!');
    } catch (error) {
      alert('Error identifying behavioral weak students: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const filteredWeakStudents = weakStudents.filter(ws => {
    if (activeCategory === 'all') return true;
    const by = (ws.identified_by_model || '').toLowerCase();
    if (activeCategory === 'academic') return by === 'academic';
    if (activeCategory === 'behavioral') return by === 'handwriting' || by === 'behavioral';
    if (activeCategory === 'both') return by === 'both';
    return true;
  });

  const identifyWeakStudents = async () => {
    if (!selectedClass) return;
    setLoading(true);
    try {
      await api.post(`/weak-students/identify/${selectedClass}`);
      fetchWeakStudents();
      alert('Weak students identified successfully!');
    } catch (error) {
      alert('Error identifying weak students: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (student) => {
    setEditingStudent(student);
    setFormData({
      weak_subject: student.weak_subject || '',
      weak_section: student.weak_section || ''
    });
  };

  const handleSave = async () => {
    if (!editingStudent) return;
    try {
      await api.put(`/weak-students/${editingStudent.id}`, formData);
      setEditingStudent(null);
      fetchWeakStudents();
      alert('Student information updated successfully!');
    } catch (error) {
      alert('Error updating student: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleGeneratePath = async (weakStudentId) => {
    const student = weakStudents.find(ws => ws.id === weakStudentId);
    if (!student.weak_subject || !student.weak_section) {
      alert('Please specify weak subject and section first');
      return;
    }
    try {
      // Use the new personalized learning path endpoint
      const response = await api.post(`/learning-paths/personalized/${student.student_id}`, {
        weak_subject: student.weak_subject,
        weak_section: student.weak_section
      });
      alert('Personalized learning path generated successfully!');
      window.location.href = '/teacher/learning-paths';
    } catch (error) {
      console.error('Error generating learning path:', error);
      alert('Error generating learning path: ' + (error.response?.data?.error || error.message));
    }
  };

  return (
    <div className="weak-students">
      <nav className="navbar">
        <div className="nav-content">
          <Link to="/dashboard" style={{ color: 'white', textDecoration: 'none' }}>
            <h1>Weak Students</h1>
          </Link>
          <div className="nav-right">
            <span>Welcome, {teacher.name}</span>
            <button onClick={onLogout} className="btn btn-secondary">Logout</button>
          </div>
        </div>
      </nav>

      <div className="container">
        <div className="card">
          <h2>Select Class</h2>
          <select 
            className="input" 
            value={selectedClass} 
            onChange={(e) => setSelectedClass(e.target.value)}
          >
            <option value="">Select a class</option>
            {classes.map(cls => (
              <option key={cls.id} value={cls.id}>{cls.name} - Grade {cls.grade}</option>
            ))}
          </select>
        </div>

        {selectedClass && (
          <>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2>Weak Students</h2>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button 
                    onClick={identifyWeakStudents} 
                    className="btn btn-primary"
                    disabled={loading}
                    title="Uses academic ML model (Component 1)"
                  >
                    {loading ? 'Identifying...' : 'Identify Academic (ML)'}
                  </button>
                  <button 
                    onClick={identifyBehavioralWeakStudents} 
                    className="btn btn-secondary"
                    disabled={loading}
                    title="Uses handwriting/emotion + behavioral signals (Component 2)"
                  >
                    {loading ? 'Identifying...' : 'Identify Behavioral (AI)'}
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', margin: '12px 0', flexWrap: 'wrap' }}>
                <button className={`btn btn-small ${activeCategory === 'all' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveCategory('all')}>All</button>
                <button className={`btn btn-small ${activeCategory === 'academic' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveCategory('academic')}>Academic</button>
                <button className={`btn btn-small ${activeCategory === 'behavioral' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveCategory('behavioral')}>Behavioral</button>
                <button className={`btn btn-small ${activeCategory === 'both' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveCategory('both')}>Both</button>
              </div>

              {filteredWeakStudents.length === 0 ? (
                <p>No weak students identified for this category yet. Use the buttons above to run identification.</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Student ID</th>
                      <th>Name</th>
                      <th>Weak Subject</th>
                      <th>Weak Section</th>
                      <th>Identified By</th>
                      <th>Confidence</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredWeakStudents.map(student => (
                      <tr key={student.id}>
                        <td>{student.student_id}</td>
                        <td>{student.student_name}</td>
                        <td>{student.weak_subject || 'Not specified'}</td>
                        <td>{student.weak_section || 'Not specified'}</td>
                        <td>{student.identified_by_model || 'N/A'}</td>
                        <td>{(student.confidence_score * 100).toFixed(1)}%</td>
                        <td>
                          <button 
                            onClick={() => handleEdit(student)}
                            className="btn btn-secondary"
                            style={{ marginRight: '5px' }}
                          >
                            Edit
                          </button>
                          <button 
                            onClick={() => handleGeneratePath(student.id)}
                            className="btn btn-primary"
                          >
                            Generate Path
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {editingStudent && (
              <div className="card">
                <h2>Edit Weak Student Information</h2>
                <div>
                  <label className="label">Weak Subject</label>
                  <input
                    type="text"
                    className="input"
                    value={formData.weak_subject}
                    onChange={(e) => setFormData({ ...formData, weak_subject: e.target.value })}
                    placeholder="e.g., Mathematics"
                  />
                </div>
                <div>
                  <label className="label">Weak Section</label>
                  <textarea
                    className="input"
                    value={formData.weak_section}
                    onChange={(e) => setFormData({ ...formData, weak_section: e.target.value })}
                    placeholder="e.g., Addition, Subtraction"
                    rows="3"
                  />
                </div>
                <div style={{ marginTop: '15px' }}>
                  <button onClick={handleSave} className="btn btn-primary">Save</button>
                  <button 
                    onClick={() => setEditingStudent(null)} 
                    className="btn btn-secondary"
                    style={{ marginLeft: '10px' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default WeakStudents;

