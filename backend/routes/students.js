const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const db = require('../config/database');

// Get students by class
router.get('/class/:classId', authenticate, async (req, res) => {
  try {
    const { classId } = req.params;
    
    const result = await db.query(
      'SELECT * FROM students WHERE class_id = $1 ORDER BY name',
      [classId]
    );
    
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single student
router.get('/:studentId', authenticate, async (req, res) => {
  try {
    const { studentId } = req.params;
    
    const result = await db.query(
      'SELECT * FROM students WHERE id = $1',
      [studentId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

