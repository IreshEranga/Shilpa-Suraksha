const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const db = require('../config/database');

// Get academic records for a student
router.get('/student/:studentId', authenticate, async (req, res) => {
  try {
    const { studentId } = req.params;
    
    const result = await db.query(
      'SELECT * FROM academic_records WHERE student_id = $1 ORDER BY exam_date DESC',
      [studentId]
    );
    
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add academic record
router.post('/', authenticate, async (req, res) => {
  try {
    const { student_id, subject, score, max_score, exam_type, exam_date } = req.body;
    
    const result = await db.query(
      'INSERT INTO academic_records (student_id, subject, score, max_score, exam_type, exam_date) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [student_id, subject, score, max_score, exam_type, exam_date]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

