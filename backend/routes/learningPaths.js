const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const db = require('../config/database');
const { generateLearningPath } = require('../ml/learningPathModel');
const { 
  generatePersonalizedLearningPath, 
  calculateImprovementTrend, 
  evaluateEffectiveness,
  trackWeeklyProgress
} = require('../ml/personalizedLearningPathModel');

// Get all learning paths for a teacher's students, ordered by most recent
router.get('/teacher', authenticate, async (req, res) => {
  try {
    const teacherId = req.userId;
    const result = await db.query(
      `SELECT lp.*, s.name as student_name, s.student_id as student_code, s.class_id, c.name as class_name, c.grade as class_grade
       FROM learning_paths lp
       JOIN students s ON lp.student_id = s.id
       JOIN classes c ON s.class_id = c.id
       WHERE c.teacher_id = $1
       ORDER BY lp.created_at DESC`,
      [teacherId]
    );
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Generate learning path for a weak student based on their weak subject and section
router.post('/generate/:weakStudentId', authenticate, async (req, res) => {
  try {
    const { weakStudentId } = req.params;
    const { weak_subject, weak_section, grade_level } = req.body;
    
    const weakStudentResult = await db.query('SELECT * FROM weak_students WHERE id = $1', [weakStudentId]);
    if (weakStudentResult.rows.length === 0) return res.status(404).json({ error: 'Weak student record not found' });
    const weakStudent = weakStudentResult.rows[0];

    const studentInfo = await db.query(`SELECT c.grade FROM students s JOIN classes c ON s.class_id = c.id WHERE s.id = $1`, [weakStudent.student_id]);
    const grade = grade_level || (studentInfo.rows.length > 0 ? studentInfo.rows[0].grade : 10);
    
    const learningPath = await generateLearningPath({
      subject: weak_subject || weakStudent.weak_subject,
      section: weak_section || weakStudent.weak_section,
      studentId: weakStudent.student_id,
      gradeLevel: grade
    });
    
    const result = await db.query(
      `INSERT INTO learning_paths (student_id, weak_student_id, subject, section, path_content, resources) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [weakStudent.student_id, weakStudentId, weak_subject || weakStudent.weak_subject, weak_section || weakStudent.weak_section, learningPath.content, JSON.stringify(learningPath.resources || {})]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Get all learning paths for a specific student, ordered by most recent
router.get('/student/:studentId', authenticate, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM learning_paths WHERE student_id = $1 ORDER BY created_at DESC', [req.params.studentId]);
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Update learning path status (e.g., active, completed, needs review)
router.patch('/:pathId', authenticate, async (req, res) => {
  try {
    const result = await db.query('UPDATE learning_paths SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *', [req.body.status, req.params.pathId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Learning path not found' });
    res.json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Generate personalized learning path for a student based on their weak subjects, academic history, and risk factors
router.post('/personalized/:studentId', authenticate, async (req, res) => {
  try {
    const { studentId } = req.params;
    const { weak_subject, weak_section, grade_level } = req.body;

    if (!weak_subject || !weak_section) return res.status(400).json({ error: 'weak_subject and weak_section are required' });

    const studentInfoResult = await db.query(`SELECT s.id, c.grade FROM students s JOIN classes c ON s.class_id = c.id WHERE s.id = $1`, [studentId]);
    if (studentInfoResult.rows.length === 0) return res.status(404).json({ error: 'Student not found' });
    
    const dbGrade = parseInt(studentInfoResult.rows[0].grade) || null;
    const finalStudentGrade = grade_level ? parseInt(grade_level) : (dbGrade || 10);

    const atRiskData = await db.query('SELECT * FROM at_risk_students WHERE student_id = $1', [studentId]);
    const riskLevel = atRiskData.rows.length > 0 ? atRiskData.rows[0].risk_level : 'medium';
    const riskType = atRiskData.rows.length > 0 ? atRiskData.rows[0].risk_type : 'academic';

    const learningPath = await generatePersonalizedLearningPath({
      student_id: parseInt(studentId), grade_level: finalStudentGrade, weak_subject, weak_section, risk_level: riskLevel, risk_type: riskType
    });

    const weakStudent = await db.query('SELECT id FROM weak_students WHERE student_id = $1 LIMIT 1', [studentId]);
    let weakStudentId = weakStudent.rows.length > 0 ? weakStudent.rows[0].id : (await db.query('INSERT INTO weak_students (student_id, weak_subject, weak_section) VALUES ($1, $2, $3) RETURNING id', [studentId, weak_subject, weak_section])).rows[0].id;

    const savedPath = await db.query(
      `INSERT INTO learning_paths (student_id, weak_student_id, subject, section, path_content, resources, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING *`,
      [
        studentId, weakStudentId, weak_subject, weak_section, learningPath.content,
        JSON.stringify({ grade_level: finalStudentGrade, activities: learningPath.activities, exercises: learningPath.exercises, strategies: learningPath.strategies, milestones: learningPath.milestones, learningProfile: learningPath.learningProfile, estimatedDuration: learningPath.estimatedDuration })
      ]
    );

    let parsedResources = savedPath.rows[0].resources;
    if (typeof parsedResources === 'string') {
        try { parsedResources = JSON.parse(parsedResources); } catch (e) { parsedResources = {}; }
    }
    res.status(201).json({ learning_path: savedPath.rows[0], personalized_data: parsedResources });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Record Progress - STRICTLY Assessments and Tasks now
router.post('/progress', authenticate, async (req, res) => {
  try {
    const { student_id, learning_path_id, task_completed, assessment_score, task_description } = req.body;
    if (!student_id) return res.status(400).json({ error: 'student_id is required' });

    const improvement_trend = await calculateImprovementTrend(student_id, learning_path_id);
    
    // Save to database without assignment_result
    const result = await db.query(
      `INSERT INTO progress_tracking (student_id, learning_path_id, task_completed, assessment_score, improvement_trend, task_description, recorded_at) 
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP) RETURNING *`,
      [student_id, learning_path_id || null, task_completed || false, assessment_score ? parseFloat(assessment_score) : null, improvement_trend, task_description || 'Assessment Activity']
    );

    if (learning_path_id && assessment_score && parseFloat(assessment_score) >= 80) {
      await db.query('UPDATE learning_paths SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', ['completed', learning_path_id]);
    }
    res.status(201).json({ progress: result.rows[0], trend: improvement_trend, message: 'Progress recorded successfully' });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Weekly Progress Report - STRICTLY Assessments and Tasks now
router.get('/progress/weekly/:studentId/:learningPathId', authenticate, async (req, res) => {
  try {
    const weeklyProgressReport = await trackWeeklyProgress(req.params.studentId, req.params.learningPathId);
    res.status(200).json({ report: weeklyProgressReport });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

module.exports = router;