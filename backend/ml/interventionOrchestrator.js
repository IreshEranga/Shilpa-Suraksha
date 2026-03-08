// Clusters students and suggests group/individual interventions
const db = require('../config/database');

// Simple K-means clustering implementation
const kMeansClustering = (students, k = 3) => {
  if (students.length === 0) return [];

  // Extract features for clustering
  const features = students.map(student => [
    student.academic_score || 0,
    student.attendance_rate || 0,
    student.behavioral_score || 0
  ]);

  // Initialize centroids randomly
  const centroids = [];
  for (let i = 0; i < k; i++) {
    const randomIndex = Math.floor(Math.random() * features.length);
    centroids.push([...features[randomIndex]]);
  }

  // K-means iteration
  let clusters = [];
  let iterations = 0;
  const maxIterations = 100;

  while (iterations < maxIterations) {
    // Assign points to nearest centroid
    clusters = Array(k).fill(null).map(() => []);
    
    features.forEach((point, index) => {
      let minDist = Infinity;
      let nearestCluster = 0;
      
      centroids.forEach((centroid, cIndex) => {
        const dist = euclideanDistance(point, centroid);
        if (dist < minDist) {
          minDist = dist;
          nearestCluster = cIndex;
        }
      });
      
      clusters[nearestCluster].push(index);
    });

    // Update centroids
    let converged = true;
    centroids.forEach((centroid, cIndex) => {
      if (clusters[cIndex].length === 0) return;
      
      const newCentroid = [0, 0, 0];
      clusters[cIndex].forEach(pointIndex => {
        newCentroid[0] += features[pointIndex][0];
        newCentroid[1] += features[pointIndex][1];
        newCentroid[2] += features[pointIndex][2];
      });
      
      newCentroid[0] /= clusters[cIndex].length;
      newCentroid[1] /= clusters[cIndex].length;
      newCentroid[2] /= clusters[cIndex].length;

      if (euclideanDistance(centroid, newCentroid) > 0.01) {
        converged = false;
      }
      
      centroids[cIndex] = newCentroid;
    });

    if (converged) break;
    iterations++;
  }

  return clusters;
};

const euclideanDistance = (a, b) => {
  return Math.sqrt(
    a.reduce((sum, val, i) => sum + Math.pow(val - b[i], 2), 0)
  );
};

// Create clusters from students
const createClusters = async (students) => {
  try {
    // Enrich students with data
    const enrichedStudents = await Promise.all(
      students.map(async (student) => {
        // Get academic data
        const academicData = await db.query(
          `SELECT AVG(score / NULLIF(max_score, 0)) as avg_score
           FROM academic_records WHERE student_id = $1`,
          [student.id]
        );
        const academicScore = parseFloat(academicData.rows[0]?.avg_score || 0) * 100;

        // Get attendance data
        const attendanceData = await db.query(
          `SELECT 
             COUNT(*) FILTER (WHERE status = 'present')::float / NULLIF(COUNT(*), 0) as attendance_rate
           FROM attendance_records WHERE student_id = $1`,
          [student.id]
        );
        const attendanceRate = parseFloat(attendanceData.rows[0]?.attendance_rate || 1) * 100;

        // Get behavioral data
        const behavioralData = await db.query(
          `SELECT 
             COUNT(*) FILTER (WHERE behavior_type = 'positive')::float / NULLIF(COUNT(*), 0) as behavioral_score
           FROM behavioral_records WHERE student_id = $1`,
          [student.id]
        );
        const behavioralScore = parseFloat(behavioralData.rows[0]?.behavioral_score || 0.5) * 100;

        return {
          ...student,
          academic_score: academicScore,
          attendance_rate: attendanceRate,
          behavioral_score: behavioralScore
        };
      })
    );

    // Determine optimal number of clusters (3-5)
    const k = Math.min(5, Math.max(3, Math.ceil(enrichedStudents.length / 5)));
    
    // Perform clustering
    const clusterAssignments = kMeansClustering(enrichedStudents, k);

    // Create cluster records and assignments
    const createdClusters = [];

    for (let i = 0; i < clusterAssignments.length; i++) {
      if (clusterAssignments[i].length === 0) continue;

      const clusterStudents = clusterAssignments[i].map(idx => enrichedStudents[idx]);
      
      // Determine cluster characteristics
      const avgAcademic = clusterStudents.reduce((sum, s) => sum + s.academic_score, 0) / clusterStudents.length;
      const avgAttendance = clusterStudents.reduce((sum, s) => sum + s.attendance_rate, 0) / clusterStudents.length;
      const avgBehavioral = clusterStudents.reduce((sum, s) => sum + s.behavioral_score, 0) / clusterStudents.length;

      let clusterType = 'academic';
      if (avgBehavioral < 50) clusterType = 'behavioral';
      if (avgAcademic < 50 && avgBehavioral < 50) clusterType = 'combined';

      const clusterName = getClusterName(clusterType, avgAcademic, avgAttendance, avgBehavioral);
      const description = getClusterDescription(clusterType, avgAcademic, avgAttendance, avgBehavioral);

      // Create cluster
      const clusterResult = await db.query(
        `INSERT INTO student_clusters (cluster_name, cluster_type, description)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [clusterName, clusterType, description]
      );

      const cluster = clusterResult.rows[0];

      // Assign students to cluster
      for (const student of clusterStudents) {
        const confidence = calculateClusterConfidence(student, {
          academic: avgAcademic,
          attendance: avgAttendance,
          behavioral: avgBehavioral
        });

        await db.query(
          `INSERT INTO student_cluster_assignments (student_id, cluster_id, confidence_score)
           VALUES ($1, $2, $3)
           ON CONFLICT (student_id, cluster_id) DO UPDATE SET confidence_score = $3`,
          [student.id, cluster.id, confidence]
        );
      }

      createdClusters.push({
        ...cluster,
        student_count: clusterStudents.length,
        characteristics: {
          avgAcademic,
          avgAttendance,
          avgBehavioral
        }
      });
    }

    return createdClusters;
  } catch (error) {
    console.error('Error creating clusters:', error);
    throw error;
  }
};

const getClusterName = (type, academic, attendance, behavioral) => {
  if (type === 'combined') {
    return 'Multiple Risk Factors';
  } else if (type === 'behavioral') {
    return 'Behavioral Support Needed';
  } else if (academic < 50) {
    return 'Academic Remediation';
  } else if (academic < 70) {
    return 'Academic Support';
  } else {
    return 'On Track';
  }
};

const getClusterDescription = (type, academic, attendance, behavioral) => {
  if (type === 'combined') {
    return 'Students with both academic and behavioral challenges requiring comprehensive support.';
  } else if (type === 'behavioral') {
    return 'Students requiring behavioral intervention and support strategies.';
  } else if (academic < 50) {
    return 'Students needing intensive academic remediation and foundational support.';
  } else if (academic < 70) {
    return 'Students requiring additional academic support to reach grade-level expectations.';
  } else {
    return 'Students performing at or above grade level with minimal intervention needed.';
  }
};

const calculateClusterConfidence = (student, clusterAvg) => {
  const academicDiff = Math.abs(student.academic_score - clusterAvg.academic);
  const attendanceDiff = Math.abs(student.attendance_rate - clusterAvg.attendance);
  const behavioralDiff = Math.abs(student.behavioral_score - clusterAvg.behavioral);
  
  const avgDiff = (academicDiff + attendanceDiff + behavioralDiff) / 3;
  return Math.max(0, Math.min(1, 1 - (avgDiff / 100)));
};

// Analyze cluster data to generate intelligent suggestions
const analyzeClusterData = async (cluster, students) => {
  const analysis = {
    studentCount: students.length,
    averageAcademicScore: 0,
    averageAttendance: 0,
    commonWeakSubjects: [],
    behavioralIssues: [],
    riskLevel: 'medium'
  };

  if (students.length === 0) return analysis;

  // Get academic scores for all students
  const studentIds = students.map(s => s.id);
  const academicData = await db.query(
    `SELECT student_id, subject, AVG(score / NULLIF(max_score, 0)) * 100 as avg_score
     FROM academic_records 
     WHERE student_id = ANY($1::int[])
     GROUP BY student_id, subject`,
    [studentIds]
  );

  // Get attendance data
  const attendanceData = await db.query(
    `SELECT student_id, 
            COUNT(*) FILTER (WHERE status = 'present') * 100.0 / NULLIF(COUNT(*), 0) as attendance_rate
     FROM attendance_records 
     WHERE student_id = ANY($1::int[])
     GROUP BY student_id`,
    [studentIds]
  );

  // Get behavioral records
  const behavioralData = await db.query(
    `SELECT student_id, behavior_type, severity, category
     FROM behavioral_records 
     WHERE student_id = ANY($1::int[])
     ORDER BY observation_date DESC`,
    [studentIds]
  );

  // Calculate averages
  const scores = academicData.rows.map(r => parseFloat(r.avg_score) || 0);
  analysis.averageAcademicScore = scores.length > 0 
    ? scores.reduce((a, b) => a + b, 0) / scores.length 
    : 0;

  const attendanceRates = attendanceData.rows.map(r => parseFloat(r.attendance_rate) || 0);
  analysis.averageAttendance = attendanceRates.length > 0
    ? attendanceRates.reduce((a, b) => a + b, 0) / attendanceRates.length
    : 0;

  // Find common weak subjects
  const subjectScores = {};
  academicData.rows.forEach(r => {
    const subject = r.subject;
    const score = parseFloat(r.avg_score) || 0;
    if (!subjectScores[subject]) {
      subjectScores[subject] = { total: 0, count: 0 };
    }
    subjectScores[subject].total += score;
    subjectScores[subject].count += 1;
  });

  Object.entries(subjectScores).forEach(([subject, data]) => {
    const avg = data.total / data.count;
    if (avg < 50) {
      analysis.commonWeakSubjects.push({ subject, averageScore: avg });
    }
  });
  analysis.commonWeakSubjects.sort((a, b) => a.averageScore - b.averageScore);

  // Analyze behavioral issues
  const negativeBehaviors = behavioralData.rows.filter(b => b.behavior_type === 'negative');
  const highSeverityCount = negativeBehaviors.filter(b => b.severity === 'high').length;
  analysis.behavioralIssues = {
    totalNegative: negativeBehaviors.length,
    highSeverity: highSeverityCount,
    categories: [...new Set(negativeBehaviors.map(b => b.category))].filter(Boolean)
  };

  // Determine overall risk level
  if (analysis.averageAcademicScore < 40 || analysis.averageAttendance < 70 || highSeverityCount > 3) {
    analysis.riskLevel = 'high';
  } else if (analysis.averageAcademicScore > 70 && analysis.averageAttendance > 90 && negativeBehaviors.length === 0) {
    analysis.riskLevel = 'low';
  }

  return analysis;
};

// Suggest group interventions
const suggestGroupInterventions = async (cluster, students) => {
  const suggestions = [];
  const studentCount = students.length;

  // Analyze cluster data for intelligent suggestions
  const clusterAnalysis = await analyzeClusterData(cluster, students);

  // Adjust group size recommendations based on actual cluster size
  const groupSizeNote = studentCount > 10 
    ? `This cluster has ${studentCount} students. Consider splitting into smaller groups of 4-6 students for optimal peer learning.`
    : studentCount >= 6
    ? `This cluster has ${studentCount} students. Ideal for group activities with 2-3 smaller breakout groups.`
    : `This cluster has ${studentCount} students. Perfect size for collaborative group learning.`;

  if (cluster.cluster_type === 'academic') {
    // Generate personalized description based on cluster analysis
    const weakSubjectsText = clusterAnalysis.commonWeakSubjects.length > 0
      ? `Focusing on ${clusterAnalysis.commonWeakSubjects.slice(0, 2).map(s => s.subject).join(' and ')} where students show average scores of ${Math.round(clusterAnalysis.commonWeakSubjects[0].averageScore)}%.`
      : 'Addressing common learning gaps identified in this cluster.';

    const intensityNote = clusterAnalysis.averageAcademicScore < 40
      ? 'Intensive support recommended due to low average scores.'
      : clusterAnalysis.averageAcademicScore < 60
      ? 'Moderate support needed to improve performance.'
      : 'Focus on reinforcement and advanced concepts.';

    suggestions.push({
      type: 'group',
      title: 'Group Tutoring Session',
      description: `Organize small group tutoring sessions (3-5 students) focusing on common learning gaps identified in this cluster. ${weakSubjectsText} ${intensityNote} Students can learn from each other while receiving targeted support.`,
      activities: [
        'Peer learning activities - students teach each other concepts',
        'Collaborative problem-solving - work together on challenging problems',
        'Group assessments - practice tests with peer review',
        'Interactive games and quizzes - make learning engaging',
        'Study groups - structured review sessions'
      ],
      duration: clusterAnalysis.averageAcademicScore < 40 ? '6-8 weeks' : '4-6 weeks',
      frequency: clusterAnalysis.averageAcademicScore < 40 ? '3-4 times per week' : '2-3 times per week',
      expectedOutcome: 'Improved understanding of core concepts, increased confidence, better peer collaboration',
      materials: 'Workbooks, practice sheets, visual aids, interactive tools',
      groupSizeNote: groupSizeNote,
      clusterInsights: {
        averageScore: Math.round(clusterAnalysis.averageAcademicScore),
        averageAttendance: Math.round(clusterAnalysis.averageAttendance),
        weakSubjects: clusterAnalysis.commonWeakSubjects.slice(0, 3).map(s => s.subject),
        riskLevel: clusterAnalysis.riskLevel
      }
    });
  }

  if (cluster.cluster_type === 'behavioral') {
    const behavioralIssues = clusterAnalysis.behavioralIssues;
    const focusAreas = behavioralIssues.categories.length > 0
      ? `Focus areas: ${behavioralIssues.categories.slice(0, 3).join(', ')}.`
      : 'Addressing general behavioral and social skill development.';

    const urgencyNote = behavioralIssues.highSeverity > 3
      ? 'High-priority intervention needed due to multiple high-severity incidents.'
      : behavioralIssues.totalNegative > 5
      ? 'Moderate intervention recommended to address recurring behavioral patterns.'
      : 'Preventive support to maintain positive behavior.';

    suggestions.push({
      type: 'group',
      title: 'Social Skills Group',
      description: `Structured group activities to improve social and behavioral skills. ${focusAreas} ${urgencyNote} Focus on emotional regulation, communication, and positive interactions.`,
      activities: [
        'Role-playing exercises - practice social scenarios',
        'Conflict resolution workshops - learn to solve disagreements peacefully',
        'Positive behavior reinforcement - reward good behavior',
        'Emotional awareness activities - identify and express feelings appropriately',
        'Team-building exercises - build trust and cooperation'
      ],
      duration: behavioralIssues.highSeverity > 3 ? '8-10 weeks' : '6-8 weeks',
      frequency: behavioralIssues.highSeverity > 3 ? '2 times per week' : 'Weekly',
      expectedOutcome: 'Better social interactions, improved emotional regulation, reduced behavioral incidents',
      materials: 'Activity cards, role-play scenarios, behavior charts, reward systems',
      groupSizeNote: groupSizeNote,
      clusterInsights: {
        negativeBehaviors: behavioralIssues.totalNegative,
        highSeverityIssues: behavioralIssues.highSeverity,
        categories: behavioralIssues.categories,
        riskLevel: clusterAnalysis.riskLevel
      }
    });
  }

  if (cluster.cluster_type === 'combined') {
    suggestions.push({
      type: 'group',
      title: 'Comprehensive Support Program',
      description: 'Multi-faceted intervention addressing both academic and behavioral needs. Integrated approach for students requiring support in multiple areas.',
      activities: [
        'Academic remediation sessions - targeted subject support',
        'Behavioral counseling - address emotional and social needs',
        'Parent-teacher collaboration - regular communication and updates',
        'Mentorship program - pair with positive role models',
        'Progress monitoring - regular check-ins and adjustments'
      ],
      duration: '8-12 weeks',
      frequency: 'Multiple times per week',
      expectedOutcome: 'Holistic improvement in both academic performance and behavior, increased engagement, better family-school partnership',
      materials: 'Comprehensive learning materials, behavior tracking tools, communication logs, progress reports',
      groupSizeNote: groupSizeNote
    });
  }

  return suggestions;
};

// Suggest individual interventions
const suggestIndividualInterventions = async (student) => {
  const suggestions = [];

  // Get student data
  const academicData = await db.query(
    `SELECT AVG(score / NULLIF(max_score, 0)) as avg_score
     FROM academic_records WHERE student_id = $1`,
    [student.id]
  );
  const academicScore = parseFloat(academicData.rows[0]?.avg_score || 0) * 100;

  if (academicScore < 50) {
    suggestions.push({
      type: 'individual',
      title: 'One-on-One Tutoring',
      description: 'Personalized tutoring sessions to address specific learning gaps. Focus on foundational concepts and build confidence through targeted support.',
      priority: 'high',
      activities: [
        'Diagnostic assessment to identify specific gaps',
        'Customized lesson plans based on learning style',
        'Regular progress checks and adjustments',
        'Encouragement and positive reinforcement',
        'Homework support and practice exercises'
      ],
      duration: 'Ongoing until improvement shown',
      frequency: '2-3 times per week',
      expectedOutcome: 'Improved academic performance, increased confidence, better understanding of core concepts'
    });
  }

  suggestions.push({
    type: 'individual',
    title: 'Personalized Learning Plan',
    description: 'Customized learning path based on student\'s specific needs and learning style. Adaptive approach that adjusts as student progresses.',
    priority: 'medium',
    activities: [
      'Learning style assessment',
      'Goal setting and milestone tracking',
      'Adaptive content delivery',
      'Regular feedback and reflection',
      'Celebration of achievements'
    ],
    duration: 'Ongoing throughout academic year',
    frequency: 'Integrated into regular classroom activities',
    expectedOutcome: 'Sustained improvement, increased engagement, better self-awareness of learning needs'
  });

  return suggestions;
};

module.exports = {
  createClusters,
  suggestGroupInterventions,
  suggestIndividualInterventions
};

