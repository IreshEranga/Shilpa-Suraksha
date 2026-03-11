const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const db = require('../config/database');
const { generatePersonalizedLearningPath } = require('../ml/personalizedLearningPathModel');
const { calculateBayesianTrend } = require('../ml/bayesianPredictor');

// Teacher retrieves all learning paths for their students
router.get('/teacher', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT lp.*, s.name as student_name, s.student_id as student_code, s.class_id, c.name as class_name, c.grade as class_grade
       FROM learning_paths lp JOIN students s ON lp.student_id = s.id JOIN classes c ON s.class_id = c.id
       WHERE c.teacher_id = $1 ORDER BY lp.created_at DESC`, [req.userId]
    );
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Student retrieves their active learning paths
router.patch('/:pathId', authenticate, async (req, res) => {
  try {
    const result = await db.query('UPDATE learning_paths SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *', [req.body.status, req.params.pathId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Learning path not found' });
    res.json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Generate personalized learning path for a student based on their weak subject and section
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

    const learningPath = await generatePersonalizedLearningPath({
      student_id: parseInt(studentId), grade_level: finalStudentGrade, weak_subject, weak_section, risk_level: riskLevel
    });

    const weakStudent = await db.query('SELECT id FROM weak_students WHERE student_id = $1 LIMIT 1', [studentId]);
    let weakStudentId = weakStudent.rows.length > 0 ? weakStudent.rows[0].id : (await db.query('INSERT INTO weak_students (student_id, weak_subject, weak_section) VALUES ($1, $2, $3) RETURNING id', [studentId, weak_subject, weak_section])).rows[0].id;

    // Save strictly clean data
    const savedPath = await db.query(
      `INSERT INTO learning_paths 
      (student_id, weak_student_id, subject, section, path_content, resources, graph_prerequisites, status, created_at, updated_at) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING *`,
      [
        studentId, weakStudentId, weak_subject, weak_section, learningPath.content,
        JSON.stringify({ 
          grade_level: finalStudentGrade, 
          activities: learningPath.activities, 
          strategies: learningPath.strategies,
          online_resources: learningPath.resources.online_resources,
          micro_quiz: learningPath.resources.micro_quiz,
          db_materials: learningPath.resources.db_materials
        }),
        JSON.stringify(learningPath.resources.graph_prerequisites || [])
      ]
    );

    let parsedResources = savedPath.rows[0].resources;
    if (typeof parsedResources === 'string') { try { parsedResources = JSON.parse(parsedResources); } catch (e) { parsedResources = {}; } }

    res.status(201).json({ learning_path: savedPath.rows[0], personalized_data: parsedResources });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Record student progress and analyze trends using Bayesian analysis
router.post('/progress', authenticate, async (req, res) => {
  try {
    const { student_id, learning_path_id, task_completed, assessment_score, task_description } = req.body;
    if (!student_id) return res.status(400).json({ error: 'student_id is required' });

    const progressData = await db.query(`SELECT assessment_score FROM progress_tracking WHERE student_id = $1 ORDER BY recorded_at ASC`, [student_id]);
    const historicalScores = progressData.rows.map(p => parseFloat(p.assessment_score)).filter(s => !isNaN(s) && s > 0);
    
    const currentScore = assessment_score ? parseFloat(assessment_score) : null;
    const allScoresForBayesian = currentScore ? [...historicalScores, currentScore] : historicalScores;
    
    const bayesianAnalysis = calculateBayesianTrend(allScoresForBayesian);
    const improvement_trend = bayesianAnalysis.trend;

    const result = await db.query(
      `INSERT INTO progress_tracking 
      (student_id, learning_path_id, task_completed, assessment_score, improvement_trend, bayesian_confidence, predicted_next_score, task_description, recorded_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP) RETURNING *`,
      [student_id, learning_path_id || null, task_completed || false, currentScore, improvement_trend, bayesianAnalysis.confidence, bayesianAnalysis.predictedNextScore, task_description || 'Assessment Activity']
    );

    if (learning_path_id && currentScore && currentScore >= 80) {
      await db.query('UPDATE learning_paths SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', ['completed', learning_path_id]);
    }

    res.status(201).json({ 
      progress: result.rows[0], trend: improvement_trend, 
      bayesian_confidence: bayesianAnalysis.confidence, predicted_next_score: bayesianAnalysis.predictedNextScore, message: 'Progress recorded successfully' 
    });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Get weekly progress report for a learning path with Bayesian trend analysis
router.get('/progress/weekly/:studentId/:learningPathId', authenticate, async (req, res) => {
  try {
    const { studentId, learningPathId } = req.params;
    const progressData = await db.query(
      `SELECT assessment_score, task_completed, task_description, recorded_at 
       FROM progress_tracking WHERE student_id = $1 AND learning_path_id = $2 ORDER BY recorded_at ASC`,
      [studentId, learningPathId]
    );

    if (progressData.rows.length === 0) return res.status(200).json({ report: { weekly_data: [], overall_weekly_trend: 'no_data', bayesian_confidence: 0, predicted_next_score: 0 } });

    const records = progressData.rows;
    const scores = records.map(p => parseFloat(p.assessment_score)).filter(s => !isNaN(s) && s > 0);
    const bayesianAnalysis = calculateBayesianTrend(scores);

    const startDate = new Date(records[0].recorded_at);
    const weeklyDataMap = {};

    records.forEach(record => {
      const diffDays = Math.floor(Math.abs(new Date(record.recorded_at) - startDate) / (1000 * 60 * 60 * 24));
      const weekNumber = Math.floor(diffDays / 7) + 1; 

      if (!weeklyDataMap[weekNumber]) weeklyDataMap[weekNumber] = { week: weekNumber, assessments: [], tasks_completed: 0, total_tasks: 0 };
      if (record.assessment_score !== null) weeklyDataMap[weekNumber].assessments.push(parseFloat(record.assessment_score));
      weeklyDataMap[weekNumber].total_tasks += 1;
      if (record.task_completed) weeklyDataMap[weekNumber].tasks_completed += 1;
    });

    const weeklyAnalysis = Object.values(weeklyDataMap).map(weekData => {
      const avgAssessment = weekData.assessments.length > 0 ? weekData.assessments.reduce((a, b) => a + b, 0) / weekData.assessments.length : 0;
      return {
        week_number: weekData.week,
        avg_assessment_score: Math.round(avgAssessment * 100) / 100,
        task_completion_rate: Math.round((weekData.tasks_completed / weekData.total_tasks) * 100) / 100,
      };
    }).sort((a, b) => a.week_number - b.week_number);

    res.status(200).json({ 
      report: {
        weekly_data: weeklyAnalysis, overall_weekly_trend: bayesianAnalysis.trend,
        bayesian_confidence: bayesianAnalysis.confidence, predicted_next_score: bayesianAnalysis.predictedNextScore,
        total_weeks_active: weeklyAnalysis.length
      }
    });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

module.exports = router;