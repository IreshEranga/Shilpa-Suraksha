const express = require('express');
const router = express.Router();
const { authenticate, requireAdminOrTeacher } = require('../middleware/auth');
const { trainModel: trainAcademicModel, initializeModel } = require('../ml/academicModel');
const { recalculateThresholds } = require('../ml/thresholdCalculator');
const db = require('../config/database');

// All routes require authentication
router.use(authenticate);
router.use(requireAdminOrTeacher);

/**
 * POST /api/training/academic-model
 * Train the TensorFlow academic model
 */
router.post('/academic-model', async (req, res) => {
  try {
    console.log('🎓 Starting academic model training...');

    // Check if we have enough data
    const studentCount = await db.query('SELECT COUNT(*) FROM students');
    const academicCount = await db.query('SELECT COUNT(*) FROM academic_records');
    const attendanceCount = await db.query('SELECT COUNT(*) FROM attendance_records');

    const students = parseInt(studentCount.rows[0].count);
    const academics = parseInt(academicCount.rows[0].count);
    const attendance = parseInt(attendanceCount.rows[0].count);

    console.log(`Data check: ${students} students, ${academics} academic records, ${attendance} attendance records`);

    if (students < 10) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient data for training',
        details: `Need at least 10 students, currently have ${students}`,
        recommendation: 'Add more student data before training'
      });
    }

    // Initialize model if not already done
    await initializeModel();

    // Train the model
    const startTime = Date.now();
    await trainAcademicModel();
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`✅ Academic model training completed in ${duration}s`);

    res.json({
      success: true,
      message: 'Academic model trained successfully',
      duration: `${duration} seconds`,
      data_used: {
        students,
        academic_records: academics,
        attendance_records: attendance
      }
    });
  } catch (error) {
    console.error('❌ Error training academic model:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to train academic model',
      error: error.message
    });
  }
});

/**
 * POST /api/training/thresholds
 * Recalculate dynamic thresholds
 */
router.post('/thresholds', async (req, res) => {
  try {
    console.log('📊 Recalculating dynamic thresholds...');

    const startTime = Date.now();
    const thresholds = await recalculateThresholds();
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`✅ Thresholds recalculated in ${duration}s`);

    res.json({
      success: true,
      message: 'Thresholds recalculated successfully',
      duration: `${duration} seconds`,
      thresholds
    });
  } catch (error) {
    console.error('❌ Error recalculating thresholds:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to recalculate thresholds',
      error: error.message
    });
  }
});

/**
 * POST /api/training/all
 * Train all models and recalculate thresholds
 */
router.post('/all', async (req, res) => {
  try {
    console.log('🚀 Starting full system training...');

    const results = {
      thresholds: null,
      academicModel: null,
      errors: []
    };

    // 1. Recalculate thresholds first
    try {
      console.log('Step 1/2: Recalculating thresholds...');
      const thresholds = await recalculateThresholds();
      results.thresholds = {
        success: true,
        thresholds
      };
      console.log('✅ Thresholds recalculated');
    } catch (error) {
      console.error('❌ Threshold calculation failed:', error);
      results.errors.push({ component: 'thresholds', error: error.message });
      results.thresholds = { success: false, error: error.message };
    }

    // 2. Train academic model
    try {
      console.log('Step 2/2: Training academic model...');
      
      // Check data availability
      const studentCount = await db.query('SELECT COUNT(*) FROM students');
      const students = parseInt(studentCount.rows[0].count);

      if (students < 10) {
        console.log('⚠️ Skipping academic model training - insufficient data');
        results.academicModel = {
          success: false,
          skipped: true,
          reason: `Only ${students} students (need at least 10)`
        };
      } else {
        await initializeModel();
        await trainAcademicModel();
        results.academicModel = {
          success: true,
          students_used: students
        };
        console.log('✅ Academic model trained');
      }
    } catch (error) {
      console.error('❌ Academic model training failed:', error);
      results.errors.push({ component: 'academic_model', error: error.message });
      results.academicModel = { success: false, error: error.message };
    }

    const allSuccess = results.thresholds?.success && 
                       (results.academicModel?.success || results.academicModel?.skipped);

    console.log('🎉 Full system training completed');

    res.json({
      success: allSuccess,
      message: allSuccess ? 'All training completed successfully' : 'Training completed with some errors',
      results,
      recommendation: !results.academicModel?.success && !results.academicModel?.skipped
        ? 'Academic model training failed - system will use rule-based approach'
        : null
    });
  } catch (error) {
    console.error('❌ Error in full training:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete training',
      error: error.message
    });
  }
});

/**
 * GET /api/training/status
 * Check training data availability and model status
 */
router.get('/status', async (req, res) => {
  try {
    // Get data counts
    const studentCount = await db.query('SELECT COUNT(*) FROM students');
    const academicCount = await db.query('SELECT COUNT(*) FROM academic_records');
    const attendanceCount = await db.query('SELECT COUNT(*) FROM attendance_records');
    const behavioralCount = await db.query('SELECT COUNT(*) FROM behavioral_records');
    const weakStudentCount = await db.query('SELECT COUNT(*) FROM weak_students');

    const students = parseInt(studentCount.rows[0].count);
    const academics = parseInt(academicCount.rows[0].count);
    const attendance = parseInt(attendanceCount.rows[0].count);
    const behavioral = parseInt(behavioralCount.rows[0].count);
    const weakStudents = parseInt(weakStudentCount.rows[0].count);

    // Calculate averages
    const avgAcademicPerStudent = students > 0 ? (academics / students).toFixed(1) : 0;
    const avgAttendancePerStudent = students > 0 ? (attendance / students).toFixed(1) : 0;

    // Determine readiness
    const readyForTraining = students >= 10 && academics >= 20 && attendance >= 50;
    const dataQuality = students >= 50 && academics >= 100 && attendance >= 250 ? 'excellent' :
                        students >= 30 && academics >= 60 && attendance >= 150 ? 'good' :
                        students >= 10 && academics >= 20 && attendance >= 50 ? 'fair' : 'insufficient';

    res.json({
      ready_for_training: readyForTraining,
      data_quality: dataQuality,
      data_summary: {
        students,
        academic_records: academics,
        attendance_records: attendance,
        behavioral_records: behavioral,
        labeled_weak_students: weakStudents,
        avg_academic_per_student: avgAcademicPerStudent,
        avg_attendance_per_student: avgAttendancePerStudent
      },
      recommendations: {
        can_train_thresholds: students >= 5,
        can_train_academic_model: readyForTraining,
        suggested_actions: getSuggestedActions(students, academics, attendance, weakStudents)
      }
    });
  } catch (error) {
    console.error('Error getting training status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

function getSuggestedActions(students, academics, attendance, weakStudents) {
  const actions = [];

  if (students < 10) {
    actions.push(`Add more students (currently ${students}, need 10+ for training)`);
  }
  if (academics < 20) {
    actions.push(`Add more academic records (currently ${academics}, need 20+ for training)`);
  }
  if (attendance < 50) {
    actions.push(`Add more attendance records (currently ${attendance}, need 50+ for training)`);
  }
  if (students >= 10 && academics >= 20 && attendance >= 50) {
    if (weakStudents === 0) {
      actions.push('System will use rule-based labeling (no weak students labeled yet)');
    }
    actions.push('Ready to train! Click "Train All Models"');
  }

  return actions;
}

module.exports = router;