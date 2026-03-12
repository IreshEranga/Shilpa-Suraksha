const express = require('express');
const router = express.Router();
const { authenticate, requireAdminOrTeacher } = require('../middleware/auth');
const { generateMeaningfulDataset } = require('../database/datasetGenerator');
const db = require('../config/database');

// Require authentication and admin/teacher role
router.use(authenticate);
router.use(requireAdminOrTeacher);

/**
 * POST /api/dataset/generate
 * Generate meaningful dataset with all risk types
 */
router.post('/generate', async (req, res) => {
  try {
    console.log('📊 Generating meaningful dataset...');
    
    const result = await generateMeaningfulDataset();
    
    res.json({
      success: true,
      message: 'Dataset generated successfully',
      ...result
    });
  } catch (error) {
    console.error('Error generating dataset:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/dataset/clear
 * Clear all student data (use with caution!)
 */
router.delete('/clear', async (req, res) => {
  try {
    const { confirm } = req.body;
    
    if (confirm !== 'DELETE_ALL_DATA') {
      return res.status(400).json({
        success: false,
        error: 'Must provide confirmation: "DELETE_ALL_DATA"'
      });
    }

    console.log('🗑️ Clearing all student data...');

    await db.query('DELETE FROM progress_tracking');
    await db.query('DELETE FROM intervention_history');
    await db.query('DELETE FROM student_cluster_assignments');
    await db.query('DELETE FROM student_clusters');
    await db.query('DELETE FROM learning_paths');
    await db.query('DELETE FROM at_risk_students');
    await db.query('DELETE FROM weak_students');
    await db.query('DELETE FROM behavioral_records');
    await db.query('DELETE FROM attendance_records');
    await db.query('DELETE FROM academic_records');
    await db.query('DELETE FROM students');

    console.log('✓ All student data cleared');

    res.json({
      success: true,
      message: 'All student data cleared successfully'
    });
  } catch (error) {
    console.error('Error clearing data:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/dataset/stats
 * Get current dataset statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = {};

    // Student counts
    const studentCount = await db.query('SELECT COUNT(*) as count FROM students');
    stats.total_students = parseInt(studentCount.rows[0].count);

    // Academic records
    const academicCount = await db.query('SELECT COUNT(*) as count FROM academic_records');
    stats.academic_records = parseInt(academicCount.rows[0].count);

    // Attendance records
    const attendanceCount = await db.query('SELECT COUNT(*) as count FROM attendance_records');
    stats.attendance_records = parseInt(attendanceCount.rows[0].count);

    // Behavioral records
    const behavioralCount = await db.query('SELECT COUNT(*) as count FROM behavioral_records');
    stats.behavioral_records = parseInt(behavioralCount.rows[0].count);

    // Weak students
    const weakCount = await db.query('SELECT COUNT(*) as count FROM weak_students');
    stats.labeled_weak_students = parseInt(weakCount.rows[0].count);

    // At-risk students
    const atRiskCount = await db.query('SELECT COUNT(*) as count FROM at_risk_students');
    stats.at_risk_students = parseInt(atRiskCount.rows[0].count);

    // Risk level distribution
    const riskLevels = await db.query(`
      SELECT risk_level, COUNT(*) as count
      FROM at_risk_students
      GROUP BY risk_level
      ORDER BY 
        CASE risk_level
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
        END
    `);
    stats.risk_level_distribution = riskLevels.rows;

    // Risk type distribution
    const riskTypes = await db.query(`
      SELECT risk_type, COUNT(*) as count
      FROM at_risk_students
      GROUP BY risk_type
      ORDER BY count DESC
    `);
    stats.risk_type_distribution = riskTypes.rows;

    // Average scores by subject
    const avgScores = await db.query(`
      SELECT 
        subject,
        ROUND(AVG(score / NULLIF(max_score, 0) * 100), 2) as avg_percentage
      FROM academic_records
      GROUP BY subject
      ORDER BY avg_percentage DESC
    `);
    stats.average_scores_by_subject = avgScores.rows;

    // Overall attendance rate
    const attendanceRate = await db.query(`
      SELECT 
        ROUND(
          COUNT(*) FILTER (WHERE status = 'present')::numeric / 
          NULLIF(COUNT(*), 0) * 100, 
          2
        ) as attendance_rate
      FROM attendance_records
    `);
    stats.overall_attendance_rate = attendanceRate.rows[0]?.attendance_rate || 0;

    // Behavioral summary
    const behaviorSummary = await db.query(`
      SELECT 
        behavior_type,
        severity,
        COUNT(*) as count
      FROM behavioral_records
      GROUP BY behavior_type, severity
      ORDER BY behavior_type, 
        CASE severity
          WHEN 'high' THEN 1
          WHEN 'medium' THEN 2
          WHEN 'low' THEN 3
        END
    `);
    stats.behavioral_summary = behaviorSummary.rows;

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;