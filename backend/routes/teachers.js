const express = require('express');
const router = express.Router();
const { authenticate, requireTeacher } = require('../middleware/auth');
const db = require('../config/database');

// All routes require teacher authentication
router.use(authenticate);
router.use(requireTeacher);

// Get teacher landing page data
router.get('/landing', async (req, res) => {
  try {
    const teacherId = req.userId;

    // Get assigned classroom
    const classResult = await db.query(
      'SELECT * FROM classes WHERE teacher_id = $1 LIMIT 1',
      [teacherId]
    );

    if (classResult.rows.length === 0) {
      return res.json({
        classroom: null,
        students: [],
        message: 'No classroom assigned yet'
      });
    }

    const classroom = classResult.rows[0];

    // Get students in this class
    const studentsResult = await db.query(
      'SELECT * FROM students WHERE class_id = $1 ORDER BY name',
      [classroom.id]
    );

    // Get recent academic records count
    const academicCount = await db.query(
      `SELECT COUNT(*) as count FROM academic_records ar
       JOIN students s ON ar.student_id = s.id
       WHERE s.class_id = $1 AND ar.created_at > NOW() - INTERVAL '30 days'`,
      [classroom.id]
    );

    // Get at-risk students count
    const atRiskCount = await db.query(
      `SELECT COUNT(DISTINCT ars.student_id) as count FROM at_risk_students ars
       JOIN students s ON ars.student_id = s.id
       WHERE s.class_id = $1`,
      [classroom.id]
    );

    res.json({
      classroom: {
        ...classroom,
        student_count: studentsResult.rows.length
      },
      students: studentsResult.rows,
      statistics: {
        total_students: studentsResult.rows.length,
        recent_records: parseInt(academicCount.rows[0].count),
        at_risk_students: parseInt(atRiskCount.rows[0].count)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get assigned classroom
router.get('/assigned-classroom', async (req, res) => {
  try {
    const teacherId = req.userId;

    const result = await db.query(
      'SELECT * FROM classes WHERE teacher_id = $1',
      [teacherId]
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Register student
router.post('/students', async (req, res) => {
  try {
    const teacherId = req.userId;
    const { name, student_id, date_of_birth, gender } = req.body;

    if (!name || !student_id) {
      return res.status(400).json({ error: 'Name and student ID are required' });
    }

    // Get teacher's class
    const classResult = await db.query(
      'SELECT id FROM classes WHERE teacher_id = $1 LIMIT 1',
      [teacherId]
    );

    if (classResult.rows.length === 0) {
      return res.status(400).json({ error: 'No classroom assigned. Please contact administrator.' });
    }

    const classId = classResult.rows[0].id;

    // Check if student ID exists
    const existing = await db.query(
      'SELECT id FROM students WHERE student_id = $1',
      [student_id]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Student ID already exists' });
    }

    // Create student
    const result = await db.query(
      `INSERT INTO students (name, student_id, class_id, date_of_birth, gender)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, student_id, classId, date_of_birth || null, gender || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      res.status(400).json({ error: 'Student ID already exists' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Get students
router.get('/students', async (req, res) => {
  try {
    const teacherId = req.userId;

    const result = await db.query(
      `SELECT s.* FROM students s
       JOIN classes c ON s.class_id = c.id
       WHERE c.teacher_id = $1
       ORDER BY s.name`,
      [teacherId]
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add academic record
router.post('/academic-records', async (req, res) => {
  try {
    const teacherId = req.userId;
    const { student_id, subject, score, max_score, exam_type, exam_date } = req.body;

    if (!student_id || !subject) {
      return res.status(400).json({ error: 'Student ID and subject are required' });
    }

    // Verify student belongs to teacher's class
    const studentCheck = await db.query(
      `SELECT s.id FROM students s
       JOIN classes c ON s.class_id = c.id
       WHERE s.id = $1 AND c.teacher_id = $2`,
      [student_id, teacherId]
    );

    if (studentCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Student not found in your class' });
    }

    const result = await db.query(
      `INSERT INTO academic_records (student_id, subject, score, max_score, exam_type, exam_date)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [student_id, subject, score || null, max_score || 100, exam_type || 'General', exam_date || new Date().toISOString().split('T')[0]]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add attendance record
router.post('/attendance-records', async (req, res) => {
  try {
    const teacherId = req.userId;
    const { student_id, date, status } = req.body;

    if (!student_id || !date || !status) {
      return res.status(400).json({ error: 'Student ID, date, and status are required' });
    }

    // Verify student belongs to teacher's class
    const studentCheck = await db.query(
      `SELECT s.id FROM students s
       JOIN classes c ON s.class_id = c.id
       WHERE s.id = $1 AND c.teacher_id = $2`,
      [student_id, teacherId]
    );

    if (studentCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Student not found in your class' });
    }

    const result = await db.query(
      `INSERT INTO attendance_records (student_id, date, status)
       VALUES ($1, $2, $3)
       ON CONFLICT (student_id, date) DO UPDATE SET status = $3
       RETURNING *`,
      [student_id, date, status]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add behavioral record
router.post('/behavioral-records', async (req, res) => {
  try {
    const teacherId = req.userId;
    const { student_id, observation_date, behavior_type, description, category, severity } = req.body;

    if (!student_id || !observation_date || !behavior_type) {
      return res.status(400).json({ error: 'Student ID, observation date, and behavior type are required' });
    }

    // Verify student belongs to teacher's class
    const studentCheck = await db.query(
      `SELECT s.id FROM students s
       JOIN classes c ON s.class_id = c.id
       WHERE s.id = $1 AND c.teacher_id = $2`,
      [student_id, teacherId]
    );

    if (studentCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Student not found in your class' });
    }

    const result = await db.query(
      `INSERT INTO behavioral_records (student_id, teacher_id, observation_date, behavior_type, description, category, severity)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [student_id, teacherId, observation_date, behavior_type, description || null, category || null, severity || 'medium']
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get guidance page (at-risk students)
router.get('/guidance-page', async (req, res) => {
  try {
    const teacherId = req.userId;

    // Get teacher's class
    const classResult = await db.query(
      'SELECT id FROM classes WHERE teacher_id = $1 LIMIT 1',
      [teacherId]
    );

    if (classResult.rows.length === 0) {
      return res.json({ students: [] });
    }

    const classId = classResult.rows[0].id;

    // Get at-risk students
    const result = await db.query(
      `SELECT 
        s.*,
        ars.risk_type,
        ars.risk_level,
        ars.confidence_score,
        ars.risk_factors,
        ars.identified_by,
        ars.created_at as flagged_at
       FROM at_risk_students ars
       JOIN students s ON ars.student_id = s.id
       WHERE s.class_id = $1
       ORDER BY 
         CASE ars.risk_level
           WHEN 'critical' THEN 1
           WHEN 'high' THEN 2
           WHEN 'medium' THEN 3
           WHEN 'low' THEN 4
         END,
         ars.confidence_score DESC`,
      [classId]
    );

    res.json({ students: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete student (teacher can remove student from their classroom)
router.delete('/students/:studentId', async (req, res) => {
  try {
    const teacherId = req.userId;
    const { studentId } = req.params;

    // Verify student belongs to teacher's class
    const studentCheck = await db.query(
      `SELECT s.id FROM students s
       JOIN classes c ON s.class_id = c.id
       WHERE s.id = $1 AND c.teacher_id = $2`,
      [studentId, teacherId]
    );

    if (studentCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Student not found in your class' });
    }

    await db.query('DELETE FROM students WHERE id = $1', [studentId]);
    res.json({ message: 'Student removed successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
