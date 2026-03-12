const db = require('../config/database');
const { generateLearningPath } = require('./learningPathModel');
const { calculateBayesianTrend } = require('./bayesianPredictor');
const { getPrerequisiteConcepts } = require('./knowledgeGraph');

// Generate personalized recommendations for a student profile
const generateRecommendations = async (data) => {
  try {
    const { student_id, weak_subject, weak_section, grade_level, academicHistory, risk_level } = data;

    // 1. Knowledge Graph (GNN) Analysis
    const prerequisites = getPrerequisiteConcepts(weak_section) || [];

    // 2. Generate base learning path strictly filtering by Grade Level
    const learningPath = await generateLearningPath({
      subject: weak_subject,
      section: weak_section,
      studentId: student_id,
      gradeLevel: grade_level,
      riskLevel: risk_level || 'medium'
    });

    // 3. Bayesian Performance Analysis
    const performanceAnalysis = analyzePerformance(academicHistory, weak_subject);

    return {
      content: learningPath.content,
      resources: learningPath.resources,
      prerequisites: prerequisites,
      performanceAnalysis
    };
  } catch (error) {
    console.error('Error generating recommendations:', error);
    return {
      content: `\n[ ${data.grade_level || ''} ශ්‍රේණිය | විෂය: ${data.weak_subject} | කොටස: ${data.weak_section} ] සඳහා ඉගෙනුම් මාර්ගය\n\nමූලික සංකල්ප හැදෑරීමට පටන් ගන්න.`,
      resources: [], prerequisites: []
    };
  }
};

const analyzePerformance = (academicHistory, subject) => {
  if (!academicHistory || academicHistory.length === 0) {
    return { averageScore: 0, trend: 'stable', bayesianConfidence: 0, predictedNextScore: 0, weakAreas: [], strengths: [] };
  }

  const subjectRecords = academicHistory.filter(r => r.subject === subject || r.subject_name === subject);
  const scores = subjectRecords.map(r => parseFloat(r.score || r.assessment_score)).filter(s => !isNaN(s) && s > 0);
  const averageScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  
  const bayesianMetrics = calculateBayesianTrend(scores);

  return {
    averageScore: Math.round(averageScore * 100) / 100,
    trend: bayesianMetrics.trend,
    bayesianConfidence: bayesianMetrics.confidence,
    predictedNextScore: bayesianMetrics.predictedNextScore,
    totalAttempts: scores.length,
    weakAreas: averageScore < 50 ? [subject] : [],
    strengths: averageScore > 75 ? [subject] : []
  };
};

module.exports = { generateRecommendations };