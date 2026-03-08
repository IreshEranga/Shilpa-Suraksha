const db = require('../config/database');
const { generateLearningPath } = require('./learningPathModel');
const { generateRecommendations } = require('./recommendationSystem');

const generatePersonalizedLearningPath = async (data) => {
  try {
    const { student_id, weak_subject, weak_section, risk_level, risk_type, grade_level, academic_history = [] } = data;

    if (!student_id || !weak_subject || !weak_section) throw new Error('student_id, weak_subject, and weak_section are required');

    let academicHistory = academic_history;
    if (academicHistory.length === 0) {
      const academicData = await db.query(
        'SELECT * FROM academic_records WHERE student_id = $1 AND subject = $2 ORDER BY COALESCE(exam_date, created_at) DESC', [student_id, weak_subject]
      );
      academicHistory = academicData.rows;
    }

    const behavioralData = await db.query('SELECT * FROM behavioral_records WHERE student_id = $1 ORDER BY observation_date DESC LIMIT 10', [student_id]);
    const progressData = await db.query(`SELECT * FROM progress_tracking WHERE student_id = $1 ORDER BY recorded_at DESC LIMIT 20`, [student_id]);

    const learningProfile = analyzeLearningProfile({
      academicHistory, behavioralRecords: behavioralData.rows, progressHistory: progressData.rows, risk_level, risk_type
    });

    const recommendations = await generateRecommendations({ student_id, weak_subject, weak_section, grade_level, academicHistory });
    const enhancedRecommendations = enhanceRecommendations(recommendations, learningProfile, risk_level);

    const personalizedActivities = generatePersonalizedActivities(weak_subject, weak_section, learningProfile, grade_level);
    const adaptiveExercises = generateAdaptiveExercises(weak_subject, weak_section, learningProfile, progressData.rows);
    const supportStrategies = generateSupportStrategies(learningProfile, risk_level, risk_type);

    return {
      student_id, subject: weak_subject, section: weak_section, grade_level,
      content: enhancedRecommendations.content, resources: enhancedRecommendations.resources,
      activities: personalizedActivities, exercises: adaptiveExercises, strategies: supportStrategies,
      learningProfile, estimatedDuration: calculateEstimatedDuration(learningProfile, risk_level),
      milestones: generateMilestones(weak_subject, weak_section, learningProfile)
    };
  } catch (error) {
    console.error('Error generating personalized learning path:', error);
    throw error;
  }
};

const analyzeLearningProfile = (data) => {
  const { academicHistory, behavioralRecords, progressHistory, risk_level, risk_type } = data;
  const scores = academicHistory.map(r => parseFloat(r.score) || 0);
  const averageScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  
  const recentScores = scores.slice(0, 3);
  const olderScores = scores.slice(3, 6);
  const recentAvg = recentScores.length > 0 ? recentScores.reduce((a, b) => a + b, 0) / recentScores.length : 0;
  const olderAvg = olderScores.length > 0 ? olderScores.reduce((a, b) => a + b, 0) / olderScores.length : recentAvg;

  let trend = 'stable';
  if (recentAvg > olderAvg + 5) trend = 'improving';
  else if (recentAvg < olderAvg - 5) trend = 'declining';

  const negativeBehaviors = behavioralRecords.filter(b => b.behavior_type === 'negative');
  const behavioralConcern = negativeBehaviors.length > 3 ? 'high' : negativeBehaviors.length > 1 ? 'medium' : 'low';

  const completedTasks = progressHistory.filter(p => p.task_completed).length;
  const totalTasks = progressHistory.length;
  const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  let progressTrend = 'stable';
  if (progressHistory.length >= 2) {
    const recentProgress = progressHistory.slice(0, 3);
    const olderProgress = progressHistory.slice(3, 6);
    const recentAvgScore = recentProgress.length > 0 ? recentProgress.reduce((sum, p) => sum + (parseFloat(p.assessment_score) || 0), 0) / recentProgress.length : 0;
    const olderAvgScore = olderProgress.length > 0 ? olderProgress.reduce((sum, p) => sum + (parseFloat(p.assessment_score) || 0), 0) / olderProgress.length : recentAvgScore;
    
    if (recentAvgScore > olderAvgScore + 5) progressTrend = 'improving';
    else if (recentAvgScore < olderAvgScore - 5) progressTrend = 'declining';
  }

  let learningStyle = 'balanced';
  if (completionRate > 80 && averageScore > 60) learningStyle = 'independent';
  else if (completionRate < 50 || behavioralConcern === 'high') learningStyle = 'guided';

  return {
    averageScore, trend, progressTrend, behavioralConcern, completionRate, learningStyle, totalAttempts: scores.length,
    weakAreas: averageScore < 50 ? [data.academicHistory[0]?.subject] : [],
    strengths: averageScore > 70 ? [data.academicHistory[0]?.subject] : []
  };
};

const enhanceRecommendations = (baseRecommendations, learningProfile, riskLevel) => {
  let enhancedContent = baseRecommendations.content;
  if (learningProfile.learningStyle === 'guided') enhancedContent = `\n[විශේෂ උපදෙස්: මෙම සිසුවාගේ ප්‍රගතිය ගුරුවරයා විසින් විශේෂයෙන් අධීක්ෂණය කළ යුතුය.]\n${enhancedContent}`;
  if (riskLevel === 'high' || riskLevel === 'critical') enhancedContent += `\n\n⚠️ උසස් අවධානය අවශ්‍ය: මෙම සිසුවාට විශේෂ අවධානය සහ නිතර ප්‍රගතිය අධීක්ෂණය කිරීම අවශ්‍ය වේ.`;
  return { ...baseRecommendations, content: enhancedContent };
};

const generatePersonalizedActivities = (subject, section, learningProfile, gradeLevel) => {
  const activities = [];
  if (learningProfile.averageScore < 40) {
    activities.push({ id: `foundational-${Date.now()}`, type: 'foundational', title: `මූලික සංකල්ප පුහුණුව (ශ්‍රේණිය ${gradeLevel})`, description: `${section} හි මූලික සංකල්ප හැදෑරීමට පටන් ගන්න.`, duration: '2-3 weeks', priority: 'high', difficulty: 'easy', estimatedTime: '30-45 mins', learningStyle: 'guided' });
  }
  activities.push({ id: `interactive-${Date.now()}`, type: 'interactive', title: 'අන්තර්ක්‍රියාකාරී ක්‍රියාකාරකම්', description: `${section} සඳහා ප්‍රායෝගික අත්දැකීම්.`, duration: '1-2 weeks', priority: 'medium', difficulty: learningProfile.averageScore < 50 ? 'easy' : 'medium', estimatedTime: '20-30 mins', learningStyle: learningProfile.learningStyle });
  if (learningProfile.trend === 'declining' || learningProfile.progressTrend === 'declining') {
    activities.push({ id: `remedial-${Date.now()}`, type: 'remedial', title: 'ප්‍රතිකාර වැඩසටහන', description: 'පහළ ඵලදායිතාව හඳුනාගැනීම සහ වැඩිදියුණු කිරීම.', duration: '3-4 weeks', priority: 'high', difficulty: 'easy', estimatedTime: '45-60 mins', learningStyle: 'guided' });
  }
  if (learningProfile.trend === 'improving' && learningProfile.averageScore > 60) {
    activities.push({ id: `advanced-${Date.now()}`, type: 'advanced', title: 'උසස් ක්‍රියාකාරකම්', description: 'ප්‍රගතිය පදනම් කරගෙන උසස් ක්‍රියාකාරකම්.', duration: '1-2 weeks', priority: 'low', difficulty: 'hard', estimatedTime: '30-45 mins', learningStyle: 'independent' });
  }
  return activities;
};

const generateAdaptiveExercises = (subject, section, learningProfile, progressHistory) => {
  const exercises = [];
  let baseDifficulty = 'medium';
  if (learningProfile.averageScore < 40) baseDifficulty = 'easy';
  else if (learningProfile.averageScore > 70) baseDifficulty = 'hard';

  if (progressHistory.length > 0) {
    const recentScores = progressHistory.slice(0, 3).map(p => parseFloat(p.assessment_score) || 0).filter(s => s > 0);
    if (recentScores.length > 0) {
      const recentAvg = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;
      if (recentAvg < 50) baseDifficulty = 'easy';
      else if (recentAvg > 80) baseDifficulty = 'hard';
    }
  }

  exercises.push({ id: `practice-${Date.now()}`, type: 'practice', title: 'පුනරීක්ෂණ ව්‍යායාම', description: `${section} සඳහා පුනරීක්ෂණ ව්‍යායාම.`, difficulty: baseDifficulty, count: baseDifficulty === 'easy' ? 15 : baseDifficulty === 'hard' ? 5 : 10, estimatedTime: '30 mins' });
  exercises.push({ id: `assessment-${Date.now()}`, type: 'assessment', title: 'ස්වයං තක්සේරුව', description: 'ප්‍රගතිය තක්සේරු කිරීම සඳහා කෙටි ප්‍රශ්න පත්‍රය.', difficulty: baseDifficulty, count: 5, estimatedTime: '15-20 mins' });
  return exercises;
};

const generateSupportStrategies = (learningProfile, riskLevel, riskType) => {
  const strategies = [];
  if (learningProfile.averageScore < 50 || riskLevel === 'high' || riskLevel === 'critical') {
    strategies.push({ id: `one-on-one-${Date.now()}`, type: 'one_on_one', title: 'පුද්ගලික උපකාර', description: 'ගුරුවරයා සමඟ පුද්ගලික සැසි සැලසුම් කරන්න.', frequency: riskLevel === 'critical' ? 'Daily' : 'Weekly', priority: 'high', duration: '30-45 mins' });
  }
  strategies.push({ id: `peer-learning-${Date.now()}`, type: 'peer_learning', title: 'සමකාලීන ඉගෙනීම', description: 'වඩා හොඳින් කටයුතු කරන සිසුන් සමඟ ඉගෙනීම.', frequency: 'As needed', priority: 'medium', duration: 'Flexible' });
  if (riskType === 'behavioral' || riskType === 'combined' || riskLevel === 'high' || riskLevel === 'critical') {
    strategies.push({ id: `parent-involvement-${Date.now()}`, type: 'parent_involvement', title: 'පවුලේ සහභාගීත්වය', description: 'පවුලේ සාමාජිකයන් සමඟ සන්නිවේදනය කරන්න.', frequency: riskLevel === 'critical' ? 'Weekly' : 'Monthly', priority: riskLevel === 'critical' ? 'high' : 'medium', duration: 'Ongoing' });
  }
  return strategies;
};

const calculateEstimatedDuration = (learningProfile, riskLevel) => {
  let baseWeeks = 4;
  if (learningProfile.averageScore < 40) baseWeeks = 6;
  else if (learningProfile.averageScore > 70) baseWeeks = 3;
  if (riskLevel === 'critical') baseWeeks += 2;
  else if (riskLevel === 'high') baseWeeks += 1;
  if (learningProfile.trend === 'declining') baseWeeks += 1;
  else if (learningProfile.trend === 'improving') baseWeeks -= 1;
  return `${Math.max(2, baseWeeks)}-${baseWeeks + 2} weeks`;
};

const generateMilestones = (subject, section, learningProfile) => {
  return [
    { id: 'milestone-1', title: 'මූලික සංකල්ප හැදෑරීම', description: `${section} හි මූලික සංකල්ප හැදෑරීම.`, targetScore: 50, estimatedWeek: 1, status: 'pending' },
    { id: 'milestone-2', title: 'ප්‍රායෝගික යෙදීම', description: 'සංකල්ප ප්‍රායෝගිකව යෙදීම.', targetScore: 65, estimatedWeek: 2, status: 'pending' },
    { id: 'milestone-3', title: 'ස්වයං තක්සේරුව', description: 'ස්වයං තක්සේරුව හරහා ප්‍රගතිය මැනීම.', targetScore: 75, estimatedWeek: 3, status: 'pending' },
    { id: 'milestone-4', title: 'අවසන් තක්සේරුව', description: 'ඉගෙනුම් මාර්ගයේ අවසන් තක්සේරුව.', targetScore: 80, estimatedWeek: 4, status: 'pending' }
  ];
};

const calculateImprovementTrend = async (studentId, learningPathId = null) => {
  try {
    let query = `SELECT * FROM progress_tracking WHERE student_id = $1`;
    const params = [studentId];
    if (learningPathId) { query += ' AND learning_path_id = $2'; params.push(learningPathId); }
    query += ' ORDER BY recorded_at DESC LIMIT 10';
    const progressData = await db.query(query, params);
    if (progressData.rows.length < 2) return 'stable';

    const scores = progressData.rows.map(p => parseFloat(p.assessment_score)).filter(s => !isNaN(s) && s > 0);
    if (scores.length < 2) return 'stable';

    const recentAvg = scores.slice(0, 3).reduce((a, b) => a + b, 0) / Math.min(3, scores.length);
    const olderAvg = scores.slice(3, 6).reduce((a, b) => a + b, 0) / Math.min(3, scores.length - 3);

    if (recentAvg > olderAvg + 5) return 'improving';
    if (recentAvg < olderAvg - 5) return 'declining';
    return 'stable';
  } catch (error) { return 'stable'; }
};

const evaluateEffectiveness = async (studentId, learningPathId) => {
  try {
    const progressData = await db.query(`SELECT * FROM progress_tracking WHERE student_id = $1 AND learning_path_id = $2 ORDER BY recorded_at ASC`, [studentId, learningPathId]);
    if (progressData.rows.length === 0) return { effectiveness: 'unknown', score: 0, metrics: {} };

    const scores = progressData.rows.map(p => parseFloat(p.assessment_score) || 0).filter(s => s > 0);
    const taskCompletionRate = (progressData.rows.filter(p => p.task_completed).length / progressData.rows.length) * 100;
    
    const initialScore = scores.length > 0 ? scores[0] : 0;
    const finalScore = scores.length > 0 ? scores[scores.length - 1] : 0;
    const improvement = finalScore - initialScore;
    const averageScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const trend = await calculateImprovementTrend(studentId, learningPathId);

    let effectiveness = 'moderate'; let effectivenessScore = 50;
    if (improvement > 15 && taskCompletionRate > 70 && trend === 'improving') { effectiveness = 'high'; effectivenessScore = 85; }
    else if (improvement > 10 && taskCompletionRate > 60) { effectiveness = 'good'; effectivenessScore = 70; }
    else if (improvement < 0 || taskCompletionRate < 40 || trend === 'declining') { effectiveness = 'low'; effectivenessScore = 30; }

    return {
      effectiveness, score: effectivenessScore,
      metrics: { initialScore, finalScore, improvement, averageScore, taskCompletionRate, trend, totalRecords: progressData.rows.length },
      recommendations: getEffectivenessRecommendations(effectiveness, improvement, taskCompletionRate, trend)
    };
  } catch (error) { return { effectiveness: 'unknown', score: 0, metrics: {}, error: error.message }; }
};

const getEffectivenessRecommendations = (effectiveness, improvement, completionRate, trend) => {
  const recommendations = [];
  if (effectiveness === 'low' || trend === 'declining') {
    recommendations.push({ type: 'adjust_path', title: 'ඉගෙනුම් මාර්ගය සකස් කිරීම', description: 'වර්තමාන ඉගෙනුම් මාර්ගය ඵලදායී නොවන බැවින්, විකල්ප ප්‍රවේශයක් සලකා බලන්න.', priority: 'high' });
    if (completionRate < 50) recommendations.push({ type: 'increase_support', title: 'සහාය වැඩි කිරීම', description: 'කාර්ය සම්පූර්ණ කිරීමේ අනුපාතය අඩු බැවින්, වැඩි සහාය සැලසීම අවශ්‍ය වේ.', priority: 'high' });
  } else if (effectiveness === 'high' || trend === 'improving') {
    recommendations.push({ type: 'continue_path', title: 'ඉගෙනුම් මාර්ගය දිගටම කරගෙන යාම', description: 'වර්තමාන ඉගෙනුම් මාර්ගය ඵලදායී වන බැවින්, එය දිගටම කරගෙන යන්න.', priority: 'low' });
  }
  return recommendations;
};

/**
 * ML Trend Analysis: Track and analyze student progress on weekly assessments 
 */
const trackWeeklyProgress = async (studentId, learningPathId) => {
  try {
    const progressData = await db.query(
      `SELECT assessment_score, task_completed, task_description, recorded_at 
       FROM progress_tracking 
       WHERE student_id = $1 AND learning_path_id = $2 
       ORDER BY recorded_at ASC`,
      [studentId, learningPathId]
    );

    if (progressData.rows.length === 0) {
      return { weekly_data: [], overall_weekly_trend: 'no_data', total_weeks_active: 0 };
    }

    const records = progressData.rows;
    const startDate = new Date(records[0].recorded_at);
    const weeklyDataMap = {};

    records.forEach(record => {
      const recordDate = new Date(record.recorded_at);
      const diffTime = Math.abs(recordDate - startDate);
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      const weekNumber = Math.floor(diffDays / 7) + 1; 

      if (!weeklyDataMap[weekNumber]) {
        weeklyDataMap[weekNumber] = { week: weekNumber, assessments: [], tasks_completed: 0, total_tasks: 0 };
      }

      if (record.assessment_score !== null && !isNaN(parseFloat(record.assessment_score))) {
        weeklyDataMap[weekNumber].assessments.push(parseFloat(record.assessment_score));
      }
      
      weeklyDataMap[weekNumber].total_tasks += 1;
      if (record.task_completed) {
        weeklyDataMap[weekNumber].tasks_completed += 1;
      }
    });

    const weeklyAnalysis = Object.values(weeklyDataMap).map(weekData => {
      const avgAssessment = weekData.assessments.length > 0 
        ? weekData.assessments.reduce((a, b) => a + b, 0) / weekData.assessments.length 
        : 0;

      const completionRate = weekData.total_tasks > 0 
        ? (weekData.tasks_completed / weekData.total_tasks) * 100 
        : 0;

      return {
        week_number: weekData.week,
        avg_assessment_score: Math.round(avgAssessment * 100) / 100,
        task_completion_rate: Math.round(completionRate * 100) / 100,
        total_activities_done: weekData.total_tasks
      };
    }).sort((a, b) => a.week_number - b.week_number);

    let overallTrend = 'stable';
    let wow_improvement = 0;

    if (weeklyAnalysis.length >= 2) {
      const lastWeek = weeklyAnalysis[weeklyAnalysis.length - 1];
      const previousWeek = weeklyAnalysis[weeklyAnalysis.length - 2];
      wow_improvement = lastWeek.avg_assessment_score - previousWeek.avg_assessment_score;
      if (wow_improvement > 5) overallTrend = 'improving';
      else if (wow_improvement < -5) overallTrend = 'declining';
    } else if (weeklyAnalysis.length === 1) {
      if (weeklyAnalysis[0].avg_assessment_score > 60) overallTrend = 'improving';
      else if (weeklyAnalysis[0].avg_assessment_score < 40) overallTrend = 'declining';
    }

    return {
      weekly_data: weeklyAnalysis,
      overall_weekly_trend: overallTrend,
      week_over_week_change: Math.round(wow_improvement * 100) / 100,
      total_weeks_active: weeklyAnalysis.length
    };

  } catch (error) {
    console.error('Error tracking weekly progress:', error);
    throw error;
  }
};

module.exports = {
  generatePersonalizedLearningPath,
  generateMilestones,
  calculateImprovementTrend,
  evaluateEffectiveness,
  analyzeLearningProfile,
  enhanceRecommendations,
  generatePersonalizedActivities,
  generateAdaptiveExercises,
  generateSupportStrategies,
  getEffectivenessRecommendations,
  trackWeeklyProgress
};