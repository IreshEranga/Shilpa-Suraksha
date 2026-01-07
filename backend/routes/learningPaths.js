const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const db = require('../config/database');
const { generateLearningPath } = require('../ml/learningPathModel');
const { 
  generatePersonalizedLearningPath, 
  calculateImprovementTrend, 
  evaluateEffectiveness 
} = require('../ml/personalizedLearningPathModel');

// Get all learning paths for the authenticated teacher (across their classes)
router.get('/teacher', authenticate, async (req, res) => {
  try {
    const teacherId = req.userId;

    const result = await db.query(
      `SELECT 
         lp.*,
         s.name as student_name,
         s.student_id as student_code,
         s.class_id,
         c.name as class_name,
         c.grade as class_grade
       FROM learning_paths lp
       JOIN students s ON lp.student_id = s.id
       JOIN classes c ON s.class_id = c.id
       WHERE c.teacher_id = $1
       ORDER BY lp.created_at DESC`,
      [teacherId]
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generate learning path for a weak student
router.post('/generate/:weakStudentId', authenticate, async (req, res) => {
  try {
    const { weakStudentId } = req.params;
    const { weak_subject, weak_section } = req.body;
    
    // Get weak student record
    const weakStudentResult = await db.query(
      'SELECT * FROM weak_students WHERE id = $1',
      [weakStudentId]
    );
    
    if (weakStudentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Weak student record not found' });
    }
    
    const weakStudent = weakStudentResult.rows[0];
    
    // Generate learning path using ML model
    const learningPath = await generateLearningPath({
      subject: weak_subject || weakStudent.weak_subject,
      section: weak_section || weakStudent.weak_section,
      studentId: weakStudent.student_id
    });
    
    // Save learning path
    const result = await db.query(
      `INSERT INTO learning_paths (student_id, weak_student_id, subject, section, path_content, resources)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        weakStudent.student_id,
        weakStudentId,
        weak_subject || weakStudent.weak_subject,
        weak_section || weakStudent.weak_section,
        learningPath.content,
        JSON.stringify(learningPath.resources || {})
      ]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get learning paths for a student
router.get('/student/:studentId', authenticate, async (req, res) => {
  try {
    const { studentId } = req.params;
    
    const result = await db.query(
      'SELECT * FROM learning_paths WHERE student_id = $1 ORDER BY created_at DESC',
      [studentId]
    );
    
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update learning path status
router.patch('/:pathId', authenticate, async (req, res) => {
  try {
    const { pathId } = req.params;
    const { status } = req.body;
    
    const result = await db.query(
      'UPDATE learning_paths SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [status, pathId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Learning path not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generate personalized learning path for flagged/at-risk student
router.post('/personalized/:studentId', authenticate, async (req, res) => {
  try {
    const { studentId } = req.params;
    const { weak_subject, weak_section } = req.body;

    if (!weak_subject || !weak_section) {
      return res.status(400).json({ error: 'weak_subject and weak_section are required' });
    }

    // Get student's at-risk status
    const atRiskData = await db.query(
      'SELECT * FROM at_risk_students WHERE student_id = $1',
      [studentId]
    );

    const riskLevel = atRiskData.rows.length > 0 ? atRiskData.rows[0].risk_level : 'medium';
    const riskType = atRiskData.rows.length > 0 ? atRiskData.rows[0].risk_type : 'academic';

    // Generate personalized learning path
    const learningPath = await generatePersonalizedLearningPath({
      student_id: parseInt(studentId),
      weak_subject,
      weak_section,
      risk_level: riskLevel,
      risk_type: riskType
    });

    // Get or create weak student record
    const weakStudent = await db.query(
      'SELECT id FROM weak_students WHERE student_id = $1 LIMIT 1',
      [studentId]
    );

    let weakStudentId = null;
    if (weakStudent.rows.length > 0) {
      weakStudentId = weakStudent.rows[0].id;
    } else {
      const newWeakStudent = await db.query(
        'INSERT INTO weak_students (student_id, weak_subject, weak_section) VALUES ($1, $2, $3) RETURNING id',
        [studentId, weak_subject, weak_section]
      );
      weakStudentId = newWeakStudent.rows[0].id;
    }

    // Save learning path to database
    const savedPath = await db.query(
      `INSERT INTO learning_paths (
        student_id, weak_student_id, subject, section, path_content, 
        resources, status, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *`,
      [
        studentId,
        weakStudentId,
        weak_subject,
        weak_section,
        learningPath.content,
        JSON.stringify({
          activities: learningPath.activities,
          exercises: learningPath.exercises,
          strategies: learningPath.strategies,
          milestones: learningPath.milestones,
          learningProfile: learningPath.learningProfile,
          estimatedDuration: learningPath.estimatedDuration
        })
      ]
    );

    res.status(201).json({
      learning_path: savedPath.rows[0],
      personalized_data: {
        activities: learningPath.activities,
        exercises: learningPath.exercises,
        strategies: learningPath.strategies,
        milestones: learningPath.milestones,
        learningProfile: learningPath.learningProfile,
        estimatedDuration: learningPath.estimatedDuration
      }
    });
  } catch (error) {
    console.error('Error generating personalized learning path:', error);
    res.status(500).json({ error: error.message });
  }
});

// Record progress (assignment, task, assessment)
router.post('/progress', authenticate, async (req, res) => {
  try {
    const { 
      student_id, 
      learning_path_id, 
      assignment_result, 
      task_completed, 
      assessment_score,
      task_description 
    } = req.body;

    if (!student_id) {
      return res.status(400).json({ error: 'student_id is required' });
    }

    // Calculate improvement trend dynamically
    const improvement_trend = await calculateImprovementTrend(student_id, learning_path_id);

    // Insert progress record
    const result = await db.query(
      `INSERT INTO progress_tracking (
        student_id, learning_path_id, assignment_result, 
        task_completed, assessment_score, improvement_trend, recorded_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
      RETURNING *`,
      [
        student_id,
        learning_path_id || null,
        assignment_result ? parseFloat(assignment_result) : null,
        task_completed || false,
        assessment_score ? parseFloat(assessment_score) : null,
        improvement_trend
      ]
    );

    // Update learning path if assessment score indicates completion
    if (learning_path_id && assessment_score && parseFloat(assessment_score) >= 80) {
      await db.query(
        'UPDATE learning_paths SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['completed', learning_path_id]
      );
    }

    res.status(201).json({
      progress: result.rows[0],
      trend: improvement_trend,
      message: 'Progress recorded successfully'
    });
  } catch (error) {
    console.error('Error recording progress:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get progress visualization data
router.get('/progress/:studentId', authenticate, async (req, res) => {
  try {
    const { studentId } = req.params;
    const { learning_path_id } = req.query;

    let query = `
      SELECT 
        pt.*,
        lp.subject,
        lp.section,
        lp.status as path_status
      FROM progress_tracking pt
      LEFT JOIN learning_paths lp ON pt.learning_path_id = lp.id
      WHERE pt.student_id = $1
    `;
    const params = [studentId];

    if (learning_path_id) {
      query += ' AND pt.learning_path_id = $2';
      params.push(learning_path_id);
    }

    query += ' ORDER BY pt.recorded_at ASC';

    const progressData = await db.query(query, params);

    // Calculate statistics
    const scores = progressData.rows
      .map(p => parseFloat(p.assessment_score) || parseFloat(p.assignment_result) || 0)
      .filter(s => s > 0);

    const taskCompletionRate = progressData.rows.length > 0
      ? (progressData.rows.filter(p => p.task_completed).length / progressData.rows.length) * 100
      : 0;

    const averageScore = scores.length > 0
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : 0;

    const initialScore = scores.length > 0 ? scores[0] : 0;
    const finalScore = scores.length > 0 ? scores[scores.length - 1] : 0;
    const improvement = finalScore - initialScore;

    // Get current trend
    const currentTrend = await calculateImprovementTrend(studentId, learning_path_id || null);

    // Prepare chart data
    const chartData = {
      labels: progressData.rows.map((p, i) => `Record ${i + 1}`),
      dates: progressData.rows.map(p => p.recorded_at),
      scores: progressData.rows.map(p => 
        parseFloat(p.assessment_score) || parseFloat(p.assignment_result) || null
      ),
      taskCompletion: progressData.rows.map(p => p.task_completed ? 100 : 0),
      trends: progressData.rows.map(p => p.improvement_trend)
    };

    res.json({
      progress: progressData.rows,
      statistics: {
        totalRecords: progressData.rows.length,
        averageScore: Math.round(averageScore * 100) / 100,
        initialScore: Math.round(initialScore * 100) / 100,
        finalScore: Math.round(finalScore * 100) / 100,
        improvement: Math.round(improvement * 100) / 100,
        taskCompletionRate: Math.round(taskCompletionRate * 100) / 100,
        currentTrend
      },
      chartData
    });
  } catch (error) {
    console.error('Error getting progress data:', error);
    res.status(500).json({ error: error.message });
  }
});

// Evaluate learning path effectiveness
router.get('/effectiveness/:learningPathId', authenticate, async (req, res) => {
  try {
    const { learningPathId } = req.params;

    // Get learning path
    const pathResult = await db.query(
      'SELECT * FROM learning_paths WHERE id = $1',
      [learningPathId]
    );

    if (pathResult.rows.length === 0) {
      return res.status(404).json({ error: 'Learning path not found' });
    }

    const learningPath = pathResult.rows[0];

    // Evaluate effectiveness
    const evaluation = await evaluateEffectiveness(learningPath.student_id, learningPathId);

    res.json({
      learning_path: learningPath,
      evaluation
    });
  } catch (error) {
    console.error('Error evaluating effectiveness:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all learning paths for a flagged student with progress
router.get('/flagged/:studentId', authenticate, async (req, res) => {
  try {
    const { studentId } = req.params;

    // Get all learning paths for student
    const pathsResult = await db.query(
      `SELECT lp.*, 
              ws.weak_subject, ws.weak_section,
              COUNT(pt.id) as progress_count,
              AVG(pt.assessment_score) as avg_score
       FROM learning_paths lp
       LEFT JOIN weak_students ws ON lp.weak_student_id = ws.id
       LEFT JOIN progress_tracking pt ON lp.id = pt.learning_path_id
       WHERE lp.student_id = $1
       GROUP BY lp.id, ws.weak_subject, ws.weak_section
       ORDER BY lp.created_at DESC`,
      [studentId]
    );

    // Get progress for each path
    const pathsWithProgress = await Promise.all(
      pathsResult.rows.map(async (path) => {
        const evaluation = await evaluateEffectiveness(studentId, path.id);
        return {
          ...path,
          effectiveness: evaluation
        };
      })
    );

    res.json({
      student_id: studentId,
      learning_paths: pathsWithProgress
    });
  } catch (error) {
    console.error('Error getting flagged student learning paths:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

