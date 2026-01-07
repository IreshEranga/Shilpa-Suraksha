const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const db = require('../config/database');

// Get attendance records for a student
router.get('/student/:studentId', authenticate, async (req, res) => {
  try {
    const { studentId } = req.params;
    const { startDate, endDate } = req.query;
    
    let query = 'SELECT * FROM attendance_records WHERE student_id = $1';
    const params = [studentId];
    
    if (startDate && endDate) {
      query += ' AND date BETWEEN $2 AND $3 ORDER BY date DESC';
      params.push(startDate, endDate);
    } else {
      query += ' ORDER BY date DESC LIMIT 30';
    }
    
    const result = await db.query(query, params);
    
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add attendance record
router.post('/', authenticate, async (req, res) => {
  try {
    const { student_id, date, status } = req.body;
    
    const result = await db.query(
      'INSERT INTO attendance_records (student_id, date, status) VALUES ($1, $2, $3) ON CONFLICT (student_id, date) DO UPDATE SET status = $3 RETURNING *',
      [student_id, date, status]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

