const express = require('express');
const router = express.Router();
const { authenticate, requireAdminOrTeacher } = require('../middleware/auth');
const db = require('../config/database');
const { earlyWarningSystem } = require('../ml/earlyWarningSystem');
const { emotionBehavioralAnalysis } = require('../ml/emotionBehavioralAnalysis');
const { generateRecommendations } = require('../ml/recommendationSystem');
const interventionOrchestrator = require('../ml/interventionOrchestrator');

// Helper function to get higher risk level
const getHigherRiskLevel = (level1, level2) => {
  const levels = { 'low': 1, 'medium': 2, 'high': 3, 'critical': 4 };
  return levels[level1] >= levels[level2] ? level1 : level2;
};

// All routes require authentication
router.use(authenticate);
router.use(requireAdminOrTeacher);

// Component 1: Early Warning System
router.post('/early-warning', async (req, res) => {
  try {
    const { student_id, class_id } = req.body;
    const teacherId = req.userRole === 'teacher' ? req.userId : null;

    let studentsToAnalyze = [];

    if (student_id) {
      // Analyze single student
      const student = await db.query('SELECT * FROM students WHERE id = $1', [student_id]);
      if (student.rows.length === 0) {
        return res.status(404).json({ error: 'Student not found' });
      }
      studentsToAnalyze = student.rows;
    } else if (class_id) {
      // Analyze all students in class
      const students = await db.query(
        'SELECT * FROM students WHERE class_id = $1',
        [class_id]
      );
      studentsToAnalyze = students.rows;
    } else if (teacherId) {
      // Analyze all students in teacher's class
      const classResult = await db.query(
        'SELECT id FROM classes WHERE teacher_id = $1 LIMIT 1',
        [teacherId]
      );
      if (classResult.rows.length > 0) {
        const students = await db.query(
          'SELECT * FROM students WHERE class_id = $1',
          [classResult.rows[0].id]
        );
        studentsToAnalyze = students.rows;
      }
    } else {
      return res.status(400).json({ error: 'student_id, class_id, or teacher context required' });
    }

    const results = [];

    for (const student of studentsToAnalyze) {
      // Get academic and attendance data
      const academicData = await db.query(
        'SELECT * FROM academic_records WHERE student_id = $1',
        [student.id]
      );

      const attendanceData = await db.query(
        'SELECT * FROM attendance_records WHERE student_id = $1 ORDER BY date DESC LIMIT 30',
        [student.id]
      );

      const behavioralData = await db.query(
        'SELECT * FROM behavioral_records WHERE student_id = $1 ORDER BY observation_date DESC LIMIT 10',
        [student.id]
      );

      // Run early warning analysis
      const analysis = await earlyWarningSystem({
        student_id: student.id,
        academicRecords: academicData.rows,
        attendanceRecords: attendanceData.rows,
        behavioralRecords: behavioralData.rows
      });

      if (analysis.isAtRisk) {
        // Check if record exists
        const existing = await db.query(
          'SELECT id FROM at_risk_students WHERE student_id = $1',
          [student.id]
        );

        if (existing.rows.length > 0) {
          // Update existing
          await db.query(
            `UPDATE at_risk_students SET
             risk_type = $1,
             risk_level = $2,
             confidence_score = $3,
             risk_factors = $4,
             identified_by = $5,
             updated_at = CURRENT_TIMESTAMP
             WHERE student_id = $6`,
            [
              analysis.riskType,
              analysis.riskLevel,
              analysis.confidence,
              JSON.stringify(analysis.riskFactors),
              'early_warning',
              student.id
            ]
          );
        } else {
          // Insert new
          await db.query(
            `INSERT INTO at_risk_students (student_id, risk_type, risk_level, confidence_score, risk_factors, identified_by)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              student.id,
              analysis.riskType,
              analysis.riskLevel,
              analysis.confidence,
              JSON.stringify(analysis.riskFactors),
              'early_warning'
            ]
          );
        }

        results.push({
          student_id: student.id,
          student_name: student.name,
          ...analysis
        });
      }
    }

    res.json({
      message: 'Early warning analysis completed',
      at_risk_count: results.length,
      results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Component 2: Emotion and Behavioral Analysis
router.post('/emotion-analysis', async (req, res) => {
  try {
    const { student_id, image_path } = req.body;
    const teacherId = req.userRole === 'teacher' ? req.userId : null;

    if (!student_id) {
      return res.status(400).json({ error: 'student_id is required' });
    }

    // Get student's behavioral records
    const behavioralData = await db.query(
      'SELECT * FROM behavioral_records WHERE student_id = $1 ORDER BY observation_date DESC',
      [student_id]
    );

    // Get handwriting analysis if image provided
    let emotionAnalysis = null;
    if (image_path) {
      const { analyzeHandwriting } = require('../ml/handwritingModel');
      emotionAnalysis = await analyzeHandwriting(image_path);
    }

    // Run emotion and behavioral analysis
    const analysis = await emotionBehavioralAnalysis({
      student_id,
      behavioralRecords: behavioralData.rows,
      emotionAnalysis
    });

    // Update at-risk students if needed
    if (analysis.isAtRisk) {
      const existing = await db.query(
        'SELECT * FROM at_risk_students WHERE student_id = $1',
        [student_id]
      );

      if (existing.rows.length > 0) {
        const existingRecord = existing.rows[0];
        const newRiskType = existingRecord.risk_type === 'academic' ? 'combined' : 'behavioral';
        const newRiskLevel = getHigherRiskLevel(existingRecord.risk_level, analysis.riskLevel);
        const newConfidence = Math.max(existingRecord.confidence_score || 0, analysis.confidence);
        const newIdentifiedBy = existingRecord.identified_by === 'early_warning' ? 'both' : 'emotion_analysis';
        const mergedFactors = {
          ...(existingRecord.risk_factors || {}),
          ...analysis.factors
        };

        await db.query(
          `UPDATE at_risk_students SET
           risk_type = $1,
           risk_level = $2,
           confidence_score = $3,
           risk_factors = $4,
           identified_by = $5,
           updated_at = CURRENT_TIMESTAMP
           WHERE student_id = $6`,
          [
            newRiskType,
            newRiskLevel,
            newConfidence,
            JSON.stringify(mergedFactors),
            newIdentifiedBy,
            student_id
          ]
        );
      } else {
        await db.query(
          `INSERT INTO at_risk_students (student_id, risk_type, risk_level, confidence_score, risk_factors, identified_by)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            student_id,
            'behavioral',
            analysis.riskLevel,
            analysis.confidence,
            JSON.stringify(analysis.factors),
            'emotion_analysis'
          ]
        );
      }
    }

    res.json(analysis);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Guidance Page (at-risk students)
router.get('/guidance-page', async (req, res) => {
  try {
    const teacherId = req.userRole === 'teacher' ? req.userId : null;
    const schoolId = req.schoolId;

    let query = `
      SELECT 
        s.*,
        ars.risk_type,
        ars.risk_level,
        ars.confidence_score,
        ars.risk_factors,
        ars.identified_by,
        ars.created_at as flagged_at,
        c.name as class_name,
        c.grade
      FROM at_risk_students ars
      JOIN students s ON ars.student_id = s.id
      JOIN classes c ON s.class_id = c.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

    if (teacherId) {
      paramCount++;
      query += ` AND c.teacher_id = $${paramCount}`;
      params.push(teacherId);
    } else if (schoolId) {
      paramCount++;
      query += ` AND EXISTS (
        SELECT 1 FROM teachers t WHERE t.id = c.teacher_id AND t.school_id = $${paramCount}
      )`;
      params.push(schoolId);
    }

    query += ` ORDER BY 
      CASE ars.risk_level
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 3
        WHEN 'low' THEN 4
      END,
      ars.confidence_score DESC`;

    const result = await db.query(query, params);

    res.json({ students: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Component 3: Intelligent Recommendation System
router.post('/generate-recommendations', async (req, res) => {
  try {
    const { student_id, weak_subject, weak_section } = req.body;

    if (!student_id || !weak_subject || !weak_section) {
      return res.status(400).json({ error: 'student_id, weak_subject, and weak_section are required' });
    }

    // Get student data
    const student = await db.query('SELECT * FROM students WHERE id = $1', [student_id]);
    if (student.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Get academic history
    const academicData = await db.query(
      'SELECT * FROM academic_records WHERE student_id = $1 AND subject = $2',
      [student_id, weak_subject]
    );

    // Generate recommendations
    const recommendations = await generateRecommendations({
      student_id,
      weak_subject,
      weak_section,
      academicHistory: academicData.rows
    });

    // Create or update learning path
    const weakStudent = await db.query(
      'SELECT id FROM weak_students WHERE student_id = $1 LIMIT 1',
      [student_id]
    );

    let weakStudentId = null;
    if (weakStudent.rows.length > 0) {
      weakStudentId = weakStudent.rows[0].id;
    } else {
      const newWeakStudent = await db.query(
        'INSERT INTO weak_students (student_id, weak_subject, weak_section) VALUES ($1, $2, $3) RETURNING id',
        [student_id, weak_subject, weak_section]
      );
      weakStudentId = newWeakStudent.rows[0].id;
    }

    const learningPath = await db.query(
      `INSERT INTO learning_paths (student_id, weak_student_id, subject, section, path_content, resources, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'active')
       RETURNING *`,
      [
        student_id,
        weakStudentId,
        weak_subject,
        weak_section,
        recommendations.content,
        JSON.stringify(recommendations.resources)
      ]
    );

    res.json({
      learning_path: learningPath.rows[0],
      recommendations
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Component 4: Intervention Orchestrator
router.get('/improvement-dashboard', async (req, res) => {
  try {
    const teacherId = req.userRole === 'teacher' ? req.userId : null;
    const schoolId = req.schoolId;

    // Get clusters
    let clustersQuery = `
      SELECT sc.*, COUNT(sca.student_id) as student_count
      FROM student_clusters sc
      LEFT JOIN student_cluster_assignments sca ON sc.id = sca.cluster_id
    `;
    const params = [];
    let paramCount = 0;

    if (teacherId) {
      paramCount++;
      clustersQuery += `
        WHERE EXISTS (
          SELECT 1 FROM student_cluster_assignments sca2
          JOIN students s ON sca2.student_id = s.id
          JOIN classes c ON s.class_id = c.id
          WHERE sca2.cluster_id = sc.id AND c.teacher_id = $${paramCount}
        )
      `;
      params.push(teacherId);
    } else if (schoolId) {
      paramCount++;
      clustersQuery += `
        WHERE EXISTS (
          SELECT 1 FROM student_cluster_assignments sca2
          JOIN students s ON sca2.student_id = s.id
          JOIN classes c ON s.class_id = c.id
          JOIN teachers t ON c.teacher_id = t.id
          WHERE sca2.cluster_id = sc.id AND t.school_id = $${paramCount}
        )
      `;
      params.push(schoolId);
    }

    clustersQuery += ' GROUP BY sc.id ORDER BY sc.created_at DESC';

    const clusters = await db.query(clustersQuery, params);

    // Get intervention history
    let interventionsQuery = `
      SELECT ih.*, s.name as student_name, sc.cluster_name
      FROM intervention_history ih
      JOIN students s ON ih.student_id = s.id
      LEFT JOIN student_clusters sc ON ih.cluster_id = sc.id
      WHERE 1=1
    `;
    const interventionParams = [];
    let interventionParamCount = 0;

    if (teacherId) {
      interventionParamCount++;
      interventionsQuery += ` AND EXISTS (
        SELECT 1 FROM classes c WHERE c.id = s.class_id AND c.teacher_id = $${interventionParamCount}
      )`;
      interventionParams.push(teacherId);
    } else if (schoolId) {
      interventionParamCount++;
      interventionsQuery += ` AND EXISTS (
        SELECT 1 FROM classes c
        JOIN teachers t ON c.teacher_id = t.id
        WHERE c.id = s.class_id AND t.school_id = $${interventionParamCount}
      )`;
      interventionParams.push(schoolId);
    }

    interventionsQuery += ' ORDER BY ih.created_at DESC LIMIT 50';

    const interventions = await db.query(interventionsQuery, interventionParams);

    // Get progress trends
    let progressQuery = `
      SELECT 
        pt.*,
        s.name as student_name,
        lp.subject,
        lp.section
      FROM progress_tracking pt
      JOIN students s ON pt.student_id = s.id
      LEFT JOIN learning_paths lp ON pt.learning_path_id = lp.id
      WHERE 1=1
    `;
    const progressParams = [];
    let progressParamCount = 0;

    if (teacherId) {
      progressParamCount++;
      progressQuery += ` AND EXISTS (
        SELECT 1 FROM classes c WHERE c.id = s.class_id AND c.teacher_id = $${progressParamCount}
      )`;
      progressParams.push(teacherId);
    } else if (schoolId) {
      progressParamCount++;
      progressQuery += ` AND EXISTS (
        SELECT 1 FROM classes c
        JOIN teachers t ON c.teacher_id = t.id
        WHERE c.id = s.class_id AND t.school_id = $${progressParamCount}
      )`;
      progressParams.push(schoolId);
    }

    progressQuery += ' ORDER BY pt.recorded_at DESC LIMIT 100';

    const progress = await db.query(progressQuery, progressParams);

    // Cluster visualization points (for scatter plot/heatmap)
    // Return per-student scores + cluster assignment to allow frontend visualization + tooltips.
    let pointsQuery = `
      SELECT
        s.id as student_id,
        s.name as student_name,
        sca.cluster_id,
        sc.cluster_name,
        sc.cluster_type,
        COALESCE((
          SELECT AVG(ar.score / NULLIF(ar.max_score, 0)) * 100
          FROM academic_records ar
          WHERE ar.student_id = s.id
        ), 0) as academic_score,
        COALESCE((
          SELECT (COUNT(*) FILTER (WHERE status = 'present')::float / NULLIF(COUNT(*), 0)) * 100
          FROM attendance_records att
          WHERE att.student_id = s.id
        ), 100) as attendance_rate,
        COALESCE((
          SELECT (COUNT(*) FILTER (WHERE behavior_type = 'positive')::float / NULLIF(COUNT(*), 0)) * 100
          FROM behavioral_records br
          WHERE br.student_id = s.id
        ), 50) as behavioral_score
      FROM student_cluster_assignments sca
      JOIN students s ON sca.student_id = s.id
      JOIN student_clusters sc ON sca.cluster_id = sc.id
      JOIN classes c ON s.class_id = c.id
      WHERE 1=1
    `;
    const pointsParams = [];
    let pointsParamCount = 0;

    if (teacherId) {
      pointsParamCount++;
      pointsQuery += ` AND c.teacher_id = $${pointsParamCount}`;
      pointsParams.push(teacherId);
    } else if (schoolId) {
      pointsParamCount++;
      pointsQuery += ` AND EXISTS (
        SELECT 1 FROM teachers t WHERE t.id = c.teacher_id AND t.school_id = $${pointsParamCount}
      )`;
      pointsParams.push(schoolId);
    }

    pointsQuery += ' ORDER BY sca.cluster_id, s.name';
    const clusterPoints = await db.query(pointsQuery, pointsParams);

    res.json({
      clusters: clusters.rows,
      interventions: interventions.rows,
      progress: progress.rows,
      clusterPoints: clusterPoints.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create clusters
router.post('/create-clusters', async (req, res) => {
  try {
    const { class_id } = req.body;
    const teacherId = req.userRole === 'teacher' ? req.userId : null;

    let studentsQuery = 'SELECT * FROM students';
    const params = [];
    let paramCount = 0;

    if (class_id) {
      paramCount++;
      studentsQuery += ' WHERE class_id = $' + paramCount;
      params.push(class_id);
    } else if (teacherId) {
      const classResult = await db.query(
        'SELECT id FROM classes WHERE teacher_id = $1 LIMIT 1',
        [teacherId]
      );
      if (classResult.rows.length > 0) {
        paramCount++;
        studentsQuery += ' WHERE class_id = $' + paramCount;
        params.push(classResult.rows[0].id);
      } else {
        return res.json({ message: 'No students found', clusters: [] });
      }
    }

    const students = await db.query(studentsQuery, params);

    if (students.rows.length === 0) {
      return res.json({ message: 'No students found', clusters: [] });
    }

    // Run clustering
    const clusters = await interventionOrchestrator.createClusters(students.rows);

    res.json({
      message: 'Clusters created successfully',
      clusters
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get intervention suggestions
router.get('/intervention-suggestions', async (req, res) => {
  try {
    const { cluster_id, student_id } = req.query;

    let suggestions = [];

    if (cluster_id) {
      // Get cluster and students
      const cluster = await db.query('SELECT * FROM student_clusters WHERE id = $1', [cluster_id]);
      if (cluster.rows.length > 0) {
        const students = await db.query(
          `SELECT s.* FROM students s
           JOIN student_cluster_assignments sca ON s.id = sca.student_id
           WHERE sca.cluster_id = $1`,
          [cluster_id]
        );
        
        const studentCount = students.rows.length;
        const { suggestGroupInterventions, suggestIndividualInterventions } = require('../ml/interventionOrchestrator');
        
        // If cluster has 1-2 students, suggest individual interventions
        if (studentCount <= 2) {
          // For small clusters, suggest individual interventions for each student
          for (const student of students.rows) {
            const individualSuggestions = await suggestIndividualInterventions(student);
            suggestions.push(...individualSuggestions);
          }
          // Also add a note about why individual is recommended
          if (suggestions.length > 0) {
            suggestions[0].note = `This cluster has only ${studentCount} student(s). Individual interventions are recommended for personalized support.`;
          }
        } else {
          // For clusters with 3+ students, suggest group interventions
          const groupSuggestions = await suggestGroupInterventions(
            cluster.rows[0],
            students.rows
          );
          suggestions.push(...groupSuggestions);
          
          // For medium-sized groups (3-5), also suggest some individual support options
          if (studentCount >= 3 && studentCount <= 5) {
            suggestions.push({
              type: 'hybrid',
              title: 'Hybrid Approach: Group + Individual Support',
              description: `This cluster has ${studentCount} students. Consider combining group sessions with periodic individual check-ins for students who need extra support.`,
              activities: [
                'Weekly group sessions for peer learning',
                'Bi-weekly individual progress reviews',
                'Flexible support based on individual needs',
                'Group activities with breakout individual sessions'
              ],
              duration: '6-8 weeks',
              frequency: '2 group sessions + 1 individual session per week',
              expectedOutcome: 'Balanced approach combining peer learning benefits with personalized attention',
              priority: 'medium'
            });
          }
        }
      }
    } else if (student_id) {
      // Get individual suggestions
      const student = await db.query('SELECT * FROM students WHERE id = $1', [student_id]);
      if (student.rows.length > 0) {
        const { suggestIndividualInterventions } = require('../ml/interventionOrchestrator');
        suggestions = await suggestIndividualInterventions(student.rows[0]);
      }
    } else {
      return res.status(400).json({ error: 'cluster_id or student_id required' });
    }

    res.json({ suggestions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Track progress
router.post('/track-progress', async (req, res) => {
  try {
    const { student_id, learning_path_id, assignment_result, task_completed, assessment_score } = req.body;

    if (!student_id) {
      return res.status(400).json({ error: 'student_id is required' });
    }

    // Calculate improvement trend
    const previousProgress = await db.query(
      'SELECT * FROM progress_tracking WHERE student_id = $1 ORDER BY recorded_at DESC LIMIT 1',
      [student_id]
    );

    let improvement_trend = 'stable';
    if (previousProgress.rows.length > 0) {
      const prevScore = previousProgress.rows[0].assessment_score || 0;
      const currentScore = assessment_score || 0;
      if (currentScore > prevScore + 5) {
        improvement_trend = 'improving';
      } else if (currentScore < prevScore - 5) {
        improvement_trend = 'declining';
      }
    } else if (assessment_score && assessment_score > 70) {
      improvement_trend = 'improving';
    }

    const result = await db.query(
      `INSERT INTO progress_tracking (student_id, learning_path_id, assignment_result, task_completed, assessment_score, improvement_trend)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [student_id, learning_path_id || null, assignment_result || null, task_completed || false, assessment_score || null, improvement_trend]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

