const express = require('express');
const router = express.Router();
const { authenticate, requireTeacher } = require('../middleware/auth');
const db = require('../config/database');

router.use(authenticate);
router.use(requireTeacher);

// Get behavioral records for a student
router.get('/student/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const teacherId = req.userId;

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

    const result = await db.query(
      'SELECT * FROM behavioral_records WHERE student_id = $1 ORDER BY observation_date DESC',
      [studentId]
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

