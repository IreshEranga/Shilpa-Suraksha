// import React, { useState, useEffect } from 'react';
// import api from '../utils/api';
// import TeacherNavbar from './shared/TeacherNavbar';
// import AcademicRecords from './records/AcademicRecords';
// import AttendanceRecords from './records/AttendanceRecords';
// import BehavioralRecords from './records/BehavioralRecords';
// import './RecordsManagement.css';

// const RecordsManagement = ({ user, onLogout }) => {
//   const [students, setStudents] = useState([]);
//   const [selectedStudent, setSelectedStudent] = useState(null);
//   const [activeTab, setActiveTab] = useState('academic');
//   const [loading, setLoading] = useState(true);

//   useEffect(() => {
//     fetchStudents();
//   }, []);

//   const fetchStudents = async () => {
//     try {
//       const res = await api.get('/teachers/students');
//       setStudents(res.data);
//     } catch (error) {
//       console.error('Error fetching students:', error);
//       alert('Error loading students');
//     } finally {
//       setLoading(false);
//     }
//   };

//   if (loading) {
//     return (
//       <div className="records-management">
//         <TeacherNavbar user={user} onLogout={onLogout} />
//         <div className="container">
//           <div className="loading">Loading students...</div>
//         </div>
//       </div>
//     );
//   }

//   return (
//     <div className="records-management">
//       <TeacherNavbar user={user} onLogout={onLogout} />

//       <div className="container">
//         <div className="page-header">
//           <h2>Manage Records</h2>
//           <p>Select a student to view and manage their records</p>
//         </div>

//         <div className="card">
//           <h3>Select Student</h3>
//           <select 
//             className="input input-large"
//             value={selectedStudent || ''}
//             onChange={(e) => setSelectedStudent(e.target.value)}
//           >
//             <option value="">-- Select a student --</option>
//             {students.map(student => (
//               <option key={student.id} value={student.id}>
//                 {student.name} ({student.student_id})
//               </option>
//             ))}
//           </select>
//         </div>

//         {selectedStudent && (
//           <>
//             <div className="tabs">
//               <button 
//                 className={activeTab === 'academic' ? 'tab active' : 'tab'}
//                 onClick={() => setActiveTab('academic')}
//               >
//                 📚 Academic Records
//               </button>
//               <button 
//                 className={activeTab === 'attendance' ? 'tab active' : 'tab'}
//                 onClick={() => setActiveTab('attendance')}
//               >
//                 ✅ Attendance
//               </button>
//               <button 
//                 className={activeTab === 'behavioral' ? 'tab active' : 'tab'}
//                 onClick={() => setActiveTab('behavioral')}
//               >
//                 🎭 Behavioral Records
//               </button>
//             </div>

//             {activeTab === 'academic' && (
//               <AcademicRecords studentId={selectedStudent} />
//             )}

//             {activeTab === 'attendance' && (
//               <AttendanceRecords studentId={selectedStudent} />
//             )}

//             {activeTab === 'behavioral' && (
//               <BehavioralRecords studentId={selectedStudent} />
//             )}
//           </>
//         )}

//         {!selectedStudent && students.length > 0 && (
//           <div className="card info-card">
//             <p>👆 Please select a student from the dropdown above to view and manage their records.</p>
//           </div>
//         )}

//         {students.length === 0 && (
//           <div className="card info-card">
//             <p>No students found. Please register students first.</p>
//           </div>
//         )}
//       </div>
//     </div>
//   );
// };

// export default RecordsManagement;

import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import TeacherNavbar from './shared/TeacherNavbar';
import AcademicRecords from './records/AcademicRecords';
import AttendanceRecords from './records/AttendanceRecords';
import BehavioralRecords from './records/BehavioralRecords';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid
} from 'recharts';
import './RecordsManagement.css';

const RecordsManagement = ({ user, onLogout }) => {
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentInfo, setStudentInfo] = useState(null);
  const [academicTrend, setAcademicTrend] = useState([]);
  const [activeTab, setActiveTab] = useState('academic');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStudents();
  }, []);

  useEffect(() => {
    if (selectedStudent) {
      fetchStudentSummary();
    }
  }, [selectedStudent]);

  const fetchStudents = async () => {
    try {
      const res = await api.get('/teachers/students');
      setStudents(res.data);
    } catch (error) {
      console.error('Error fetching students:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStudentSummary = async () => {
    try {
      const res = await api.get(`/students/${selectedStudent}/summary`);
      setStudentInfo(res.data.student);
      setAcademicTrend(res.data.academicTrend || []);
    } catch (error) {
      console.error('Error loading student summary', error);
    }
  };

  if (loading) {
    return (
      <div className="records-management">
        <TeacherNavbar user={user} onLogout={onLogout} />
        <div className="loading-screen">
          <div className="spinner"></div>
          <p>Loading students...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="records-management">
      <TeacherNavbar user={user} onLogout={onLogout} />

      <div className="container">

        {/* Page Header */}
        <div className="page-header">
          <h2>Student Records Management</h2>
          <p>View academic, attendance and behavioral performance</p>
        </div>

        {/* Student Selector */}
        <div className="card selector-card">
          <label>Select Student</label>

          <select
            className="input input-large"
            value={selectedStudent || ''}
            onChange={(e) => setSelectedStudent(e.target.value)}
          >
            <option value="">-- Select a student --</option>
            {students.map(student => (
              <option key={student.id} value={student.id}>
                {student.name} ({student.student_id})
              </option>
            ))}
          </select>
        </div>

        {/* Student Summary Dashboard */}
        {studentInfo && (
          <div className="student-summary">

            <div className="summary-card">
              <h4>Student</h4>
              <p>{studentInfo.name}</p>
            </div>

            <div className="summary-card">
              <h4>Grade</h4>
              <p>{studentInfo.grade}</p>
            </div>

            <div className="summary-card">
              <h4>Risk Score</h4>
              <p>{studentInfo.risk_score}%</p>
            </div>

            <div className="summary-card">
              <h4>Weak Subjects</h4>
              <p>{studentInfo.weak_subjects?.join(', ') || 'None'}</p>
            </div>

          </div>
        )}

        {/* Academic Performance Trend */}
        {academicTrend.length > 0 && (
          <div className="card chart-card">

            <h3>Academic Performance Trend</h3>

            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={academicTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="term" />
                <YAxis />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#4CAF50"
                  strokeWidth={3}
                />
              </LineChart>
            </ResponsiveContainer>

          </div>
        )}

        {/* Tabs */}
        {selectedStudent && (
          <>
            <div className="tabs">

              <button
                className={activeTab === 'academic' ? 'tab active' : 'tab'}
                onClick={() => setActiveTab('academic')}
              >
                📚 Academic
              </button>

              <button
                className={activeTab === 'attendance' ? 'tab active' : 'tab'}
                onClick={() => setActiveTab('attendance')}
              >
                ✅ Attendance
              </button>

              <button
                className={activeTab === 'behavioral' ? 'tab active' : 'tab'}
                onClick={() => setActiveTab('behavioral')}
              >
                🎭 Behavior
              </button>

            </div>

            <div className="tab-content">

              {activeTab === 'academic' && (
                <AcademicRecords studentId={selectedStudent} />
              )}

              {activeTab === 'attendance' && (
                <AttendanceRecords studentId={selectedStudent} />
              )}

              {activeTab === 'behavioral' && (
                <BehavioralRecords studentId={selectedStudent} />
              )}

            </div>
          </>
        )}

        {!selectedStudent && (
          <div className="card info-card">
            <p>Select a student above to view their performance dashboard.</p>
          </div>
        )}

      </div>
    </div>
  );
};

export default RecordsManagement;