const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const db = require('../config/database');
const { identifyWeakStudents } = require('../ml/academicModel');

// Get weak students for a teacher's class
router.get('/class/:classId', authenticate, async (req, res) => {
  try {
    const { classId } = req.params;
    
    const result = await db.query(
      `SELECT ws.*, s.name as student_name, s.student_id, s.class_id
       FROM weak_students ws
       JOIN students s ON ws.student_id = s.id
       WHERE s.class_id = $1
       ORDER BY ws.created_at DESC`,
      [classId]
    );
    
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update weak student information (teacher input)
router.put('/:weakStudentId', authenticate, async (req, res) => {
  try {
    const { weakStudentId } = req.params;
    const { weak_subject, weak_section } = req.body;
    
    const result = await db.query(
      'UPDATE weak_students SET weak_subject = $1, weak_section = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *',
      [weak_subject, weak_section, weakStudentId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Weak student record not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Identify weak students using ML model
router.post('/identify/:classId', authenticate, async (req, res) => {
  try {
    const { classId } = req.params;
    const teacherId = req.userId;
    
    // Get all students in the class
    const studentsResult = await db.query(
      'SELECT id FROM students WHERE class_id = $1',
      [classId]
    );
    
    const weakStudents = [];
    
    for (const student of studentsResult.rows) {
      // Get academic and attendance data
      const academicData = await db.query(
        'SELECT subject, score, max_score, exam_date FROM academic_records WHERE student_id = $1',
        [student.id]
      );
      
      const attendanceData = await db.query(
        'SELECT status, date FROM attendance_records WHERE student_id = $1 ORDER BY date DESC LIMIT 30',
        [student.id]
      );
      
      // Use ML model to identify if student is weak
      const prediction = await identifyWeakStudents({
        academicRecords: academicData.rows,
        attendanceRecords: attendanceData.rows
      });
      
      if (prediction.isWeak) {
        // Insert or update weak student record
        const existingRecord = await db.query(
          'SELECT id FROM weak_students WHERE student_id = $1 AND teacher_id = $2',
          [student.id, teacherId]
        );

        if (existingRecord.rows.length === 0) {
          await db.query(
            `INSERT INTO weak_students (student_id, teacher_id, identified_by_model, confidence_score)
             VALUES ($1, $2, $3, $4)`,
            [student.id, teacherId, 'academic', prediction.confidence]
          );
        } else {
          await db.query(
            `UPDATE weak_students 
             SET identified_by_model = $3, confidence_score = $4, updated_at = CURRENT_TIMESTAMP
             WHERE student_id = $1 AND teacher_id = $2`,
            [student.id, teacherId, 'academic', prediction.confidence]
          );
        }
        
        weakStudents.push({
          student_id: student.id,
          confidence: prediction.confidence,
          reasons: prediction.reasons
        });
      }
    }
    
    res.json({ message: 'Weak students identified', count: weakStudents.length, students: weakStudents });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Identify weak students using Behavioral/Emotion signals (Component 2)
router.post('/identify-behavioral/:classId', authenticate, async (req, res) => {
  try {
    const { classId } = req.params;
    const teacherId = req.userId;

    const studentsResult = await db.query(
      'SELECT id FROM students WHERE class_id = $1',
      [classId]
    );

    const flagged = [];

    for (const student of studentsResult.rows) {
      // Pull last 10 handwriting emotion analyses
      const handwriting = await db.query(
        `SELECT emotion_detected, confidence_score, analysis_date
         FROM handwriting_analysis
         WHERE student_id = $1
         ORDER BY analysis_date DESC
         LIMIT 10`,
        [student.id]
      );

      // Pull last 10 behavioral records
      const behavioral = await db.query(
        `SELECT behavior_type, severity, observation_date
         FROM behavioral_records
         WHERE student_id = $1
         ORDER BY observation_date DESC
         LIMIT 10`,
        [student.id]
      );

      // Simple scoring rule (fast + explainable):
      // - Negative emotions (angry/fear/sad) with confidence >= 0.6 contribute
      // - High severity negative behavioral records contribute
      const negativeEmotions = handwriting.rows.filter(r =>
        ['angry', 'fear', 'sad'].includes((r.emotion_detected || '').toLowerCase()) &&
        (parseFloat(r.confidence_score) || 0) >= 0.6
      );

      const avgNegConf = negativeEmotions.length
        ? negativeEmotions.reduce((a, r) => a + (parseFloat(r.confidence_score) || 0), 0) / negativeEmotions.length
        : 0;

      const negativeBehavioral = behavioral.rows.filter(r => r.behavior_type === 'negative');
      const highSeverityNeg = negativeBehavioral.filter(r => r.severity === 'high').length;

      // Decision thresholds: require some evidence
      const isWeakBehavioral =
        (negativeEmotions.length >= 2 && avgNegConf >= 0.65) ||
        (highSeverityNeg >= 2) ||
        (negativeEmotions.length >= 3);

      if (!isWeakBehavioral) continue;

      const confidence = Math.min(
        0.99,
        Math.max(avgNegConf || 0.7, highSeverityNeg ? 0.75 : 0.65)
      );

      // Upsert weak student record. If academic already exists, mark as both.
      const existingRecord = await db.query(
        'SELECT id, identified_by_model FROM weak_students WHERE student_id = $1 AND teacher_id = $2',
        [student.id, teacherId]
      );

      if (existingRecord.rows.length === 0) {
        await db.query(
          `INSERT INTO weak_students (student_id, teacher_id, identified_by_model, confidence_score)
           VALUES ($1, $2, $3, $4)`,
          [student.id, teacherId, 'handwriting', confidence]
        );
      } else {
        const prev = existingRecord.rows[0].identified_by_model;
        const nextModel =
          prev === 'academic' ? 'both' :
          prev === 'handwriting' ? 'handwriting' :
          prev === 'both' ? 'both' :
          'handwriting';

        await db.query(
          `UPDATE weak_students
           SET identified_by_model = $3,
               confidence_score = GREATEST(COALESCE(confidence_score, 0), $4),
               updated_at = CURRENT_TIMESTAMP
           WHERE student_id = $1 AND teacher_id = $2`,
          [student.id, teacherId, nextModel, confidence]
        );
      }

      flagged.push({
        student_id: student.id,
        confidence,
        reasons: {
          negativeEmotionCount: negativeEmotions.length,
          avgNegativeEmotionConfidence: avgNegConf,
          highSeverityNegativeBehavioralCount: highSeverityNeg
        }
      });
    }

    res.json({ message: 'Behavioral weak students identified', count: flagged.length, students: flagged });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

