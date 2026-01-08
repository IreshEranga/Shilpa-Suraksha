const db = require('../config/database');
const { generateLearningPath } = require('./learningPathModel');
const { generateRecommendations } = require('./recommendationSystem');

/**
 * Generate personalized learning path for a flagged student
 * @param {Object} data - Student data and requirements
 * @returns {Object} Complete learning path with recommendations
 */
const generatePersonalizedLearningPath = async (data) => {
  try {
    const { 
      student_id, 
      weak_subject, 
      weak_section, 
      risk_level,
      risk_type,
      academic_history = []
    } = data;

    if (!student_id || !weak_subject || !weak_section) {
      throw new Error('student_id, weak_subject, and weak_section are required');
    }

    // Get student's academic history if not provided
    let academicHistory = academic_history;
    if (academicHistory.length === 0) {
      const academicData = await db.query(
        // academic_records does not have a "date" column. Use exam_date if available, else created_at.
        'SELECT * FROM academic_records WHERE student_id = $1 AND subject = $2 ORDER BY COALESCE(exam_date, created_at) DESC',
        [student_id, weak_subject]
      );
      academicHistory = academicData.rows;
    }

    // Get student's behavioral records
    const behavioralData = await db.query(
      'SELECT * FROM behavioral_records WHERE student_id = $1 ORDER BY observation_date DESC LIMIT 10',
      [student_id]
    );

    // Get existing progress tracking
    const progressData = await db.query(
      `SELECT * FROM progress_tracking 
       WHERE student_id = $1 
       ORDER BY recorded_at DESC 
       LIMIT 20`,
      [student_id]
    );

    // Analyze student's learning profile
    const learningProfile = analyzeLearningProfile({
      academicHistory,
      behavioralRecords: behavioralData.rows,
      progressHistory: progressData.rows,
      risk_level,
      risk_type
    });

    // Generate base recommendations
    const recommendations = await generateRecommendations({
      student_id,
      weak_subject,
      weak_section,
      academicHistory
    });

    // Enhance recommendations based on learning profile
    const enhancedRecommendations = enhanceRecommendations(
      recommendations,
      learningProfile,
      risk_level
    );

    // Generate personalized activities
    const personalizedActivities = generatePersonalizedActivities(
      weak_subject,
      weak_section,
      learningProfile
    );

    // Generate remedial exercises with adaptive difficulty
    const adaptiveExercises = generateAdaptiveExercises(
      weak_subject,
      weak_section,
      learningProfile,
      progressData.rows
    );

    // Generate support strategies based on risk level
    const supportStrategies = generateSupportStrategies(
      learningProfile,
      risk_level,
      risk_type
    );

    // Create learning path structure
    const learningPath = {
      student_id,
      subject: weak_subject,
      section: weak_section,
      content: enhancedRecommendations.content,
      resources: enhancedRecommendations.resources,
      activities: personalizedActivities,
      exercises: adaptiveExercises,
      strategies: supportStrategies,
      learningProfile,
      estimatedDuration: calculateEstimatedDuration(learningProfile, risk_level),
      milestones: generateMilestones(weak_subject, weak_section, learningProfile)
    };

    return learningPath;
  } catch (error) {
    console.error('Error generating personalized learning path:', error);
    throw error;
  }
};

/**
 * Analyze student's learning profile
 */
const analyzeLearningProfile = (data) => {
  const { academicHistory, behavioralRecords, progressHistory, risk_level, risk_type } = data;

  // Calculate academic performance metrics
  const scores = academicHistory.map(r => parseFloat(r.score) || 0);
  const averageScore = scores.length > 0 
    ? scores.reduce((a, b) => a + b, 0) / scores.length 
    : 0;

  // Calculate trend
  const recentScores = scores.slice(0, 3);
  const olderScores = scores.slice(3, 6);
  const recentAvg = recentScores.length > 0 
    ? recentScores.reduce((a, b) => a + b, 0) / recentScores.length 
    : 0;
  const olderAvg = olderScores.length > 0 
    ? olderScores.reduce((a, b) => a + b, 0) / olderScores.length 
    : recentAvg;

  let trend = 'stable';
  if (recentAvg > olderAvg + 5) {
    trend = 'improving';
  } else if (recentAvg < olderAvg - 5) {
    trend = 'declining';
  }

  // Analyze behavioral patterns
  const negativeBehaviors = behavioralRecords.filter(b => b.behavior_type === 'negative');
  const behavioralConcern = negativeBehaviors.length > 3 ? 'high' : 
                           negativeBehaviors.length > 1 ? 'medium' : 'low';

  // Analyze progress history
  const completedTasks = progressHistory.filter(p => p.task_completed).length;
  const totalTasks = progressHistory.length;
  const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  // Calculate improvement trend from progress
  let progressTrend = 'stable';
  if (progressHistory.length >= 2) {
    const recentProgress = progressHistory.slice(0, 3);
    const olderProgress = progressHistory.slice(3, 6);
    
    const recentAvgScore = recentProgress.length > 0
      ? recentProgress.reduce((sum, p) => sum + (parseFloat(p.assessment_score) || 0), 0) / recentProgress.length
      : 0;
    const olderAvgScore = olderProgress.length > 0
      ? olderProgress.reduce((sum, p) => sum + (parseFloat(p.assessment_score) || 0), 0) / olderProgress.length
      : recentAvgScore;

    if (recentAvgScore > olderAvgScore + 5) {
      progressTrend = 'improving';
    } else if (recentAvgScore < olderAvgScore - 5) {
      progressTrend = 'declining';
    }
  }

  // Determine learning style based on patterns
  let learningStyle = 'balanced';
  if (completionRate > 80 && averageScore > 60) {
    learningStyle = 'independent';
  } else if (completionRate < 50 || behavioralConcern === 'high') {
    learningStyle = 'guided';
  }

  return {
    averageScore,
    trend,
    progressTrend,
    behavioralConcern,
    completionRate,
    learningStyle,
    totalAttempts: scores.length,
    weakAreas: averageScore < 50 ? [data.academicHistory[0]?.subject] : [],
    strengths: averageScore > 70 ? [data.academicHistory[0]?.subject] : []
  };
};

/**
 * Enhance recommendations based on learning profile
 */
const enhanceRecommendations = (baseRecommendations, learningProfile, riskLevel) => {
  let enhancedContent = baseRecommendations.content;

  // Add personalized introduction
  if (learningProfile.learningStyle === 'guided') {
    enhancedContent = `\n[විශේෂ උපදෙස්: මෙම ඉගෙනුම් මාර්ගය ඔබගේ ප්‍රගතිය අධීක්ෂණය කරනු ලබන අතර, අවශ්‍ය විට ගුරුවරයාගේ උපකාර ලබා ගන්න.]\n\n${enhancedContent}`;
  }

  // Adjust based on risk level
  if (riskLevel === 'high' || riskLevel === 'critical') {
    enhancedContent += `\n\n⚠️ උසස් අවධානය අවශ්‍ය: මෙම සිසුවාට විශේෂ අවධානය සහ නිතර ප්‍රගතිය අධීක්ෂණය කිරීම අවශ්‍ය වේ.`;
  }

  return {
    ...baseRecommendations,
    content: enhancedContent
  };
};

/**
 * Generate personalized activities
 */
const generatePersonalizedActivities = (subject, section, learningProfile) => {
  const activities = [];

  // Foundational activities for low performers
  if (learningProfile.averageScore < 40) {
    activities.push({
      id: `foundational-${Date.now()}`,
      type: 'foundational',
      title: 'මූලික සංකල්ප පුහුණුව',
      description: 'මූලික සංකල්ප හැදෑරීමට පටන් ගන්න. සරල උදාහරණ සමඟ ආරම්භ කරන්න.',
      duration: '2-3 weeks',
      priority: 'high',
      difficulty: 'easy',
      estimatedTime: '30-45 minutes per session',
      learningStyle: 'guided'
    });
  }

  // Interactive activities
  activities.push({
    id: `interactive-${Date.now()}`,
    type: 'interactive',
    title: 'අන්තර්ක්‍රියාකාරී ක්‍රියාකාරකම්',
    description: `${section} කොටස සඳහා ප්‍රායෝගික අත්දැකීම් සපයන ක්‍රියාකාරකම්.`,
    duration: '1-2 weeks',
    priority: 'medium',
    difficulty: learningProfile.averageScore < 50 ? 'easy' : 'medium',
    estimatedTime: '20-30 minutes per session',
    learningStyle: learningProfile.learningStyle
  });

  // Remedial activities for declining trend
  if (learningProfile.trend === 'declining' || learningProfile.progressTrend === 'declining') {
    activities.push({
      id: `remedial-${Date.now()}`,
      type: 'remedial',
      title: 'ප්‍රතිකාර වැඩසටහන',
      description: 'පසුගිය කාලයේ පෙන්වූ පහළ ඵලදායිතාව හඳුනාගැනීම සහ වැඩිදියුණු කිරීම.',
      duration: '3-4 weeks',
      priority: 'high',
      difficulty: 'easy',
      estimatedTime: '45-60 minutes per session',
      learningStyle: 'guided'
    });
  }

  // Advanced activities for improving students
  if (learningProfile.trend === 'improving' && learningProfile.averageScore > 60) {
    activities.push({
      id: `advanced-${Date.now()}`,
      type: 'advanced',
      title: 'උසස් ක්‍රියාකාරකම්',
      description: 'ඔබගේ ප්‍රගතිය පදනම් කරගෙන උසස් ක්‍රියාකාරකම්.',
      duration: '1-2 weeks',
      priority: 'low',
      difficulty: 'hard',
      estimatedTime: '30-45 minutes per session',
      learningStyle: 'independent'
    });
  }

  return activities;
};

/**
 * Generate adaptive exercises based on performance
 */
const generateAdaptiveExercises = (subject, section, learningProfile, progressHistory) => {
  const exercises = [];

  // Determine difficulty based on recent performance
  let baseDifficulty = 'medium';
  if (learningProfile.averageScore < 40) {
    baseDifficulty = 'easy';
  } else if (learningProfile.averageScore > 70) {
    baseDifficulty = 'hard';
  }

  // Adjust based on recent progress
  if (progressHistory.length > 0) {
    const recentScores = progressHistory.slice(0, 3)
      .map(p => parseFloat(p.assessment_score) || 0)
      .filter(s => s > 0);
    
    if (recentScores.length > 0) {
      const recentAvg = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;
      if (recentAvg < 50) {
        baseDifficulty = 'easy';
      } else if (recentAvg > 80) {
        baseDifficulty = 'hard';
      }
    }
  }

  // Practice exercises
  exercises.push({
    id: `practice-${Date.now()}`,
    type: 'practice',
    title: 'පුනරීක්ෂණ ව්‍යායාම',
    description: `${section} කොටස සඳහා පුනරීක්ෂණ ව්‍යායාම. ${baseDifficulty === 'easy' ? 'සරල' : baseDifficulty === 'hard' ? 'දුෂ්කර' : 'මධ්‍යම'} මට්ටමේ ප්‍රශ්න.`,
    difficulty: baseDifficulty,
    count: baseDifficulty === 'easy' ? 15 : baseDifficulty === 'hard' ? 5 : 10,
    estimatedTime: baseDifficulty === 'easy' ? '20-30 minutes' : baseDifficulty === 'hard' ? '45-60 minutes' : '30-45 minutes'
  });

  // Assessment exercises
  exercises.push({
    id: `assessment-${Date.now()}`,
    type: 'assessment',
    title: 'ස්වයං තක්සේරුව',
    description: 'ඔබගේ ප්‍රගතිය තක්සේරු කිරීම සඳහා කෙටි ප්‍රශ්න පත්‍රය.',
    difficulty: baseDifficulty,
    count: 5,
    estimatedTime: '15-20 minutes'
  });

  // Remedial exercises for specific weak areas
  if (learningProfile.weakAreas.length > 0) {
    exercises.push({
      id: `remedial-${Date.now()}`,
      type: 'remedial',
      title: 'විශේෂිත ප්‍රතිකාර ව්‍යායාම',
      description: `${learningProfile.weakAreas.join(', ')} සඳහා විශේෂිත ව්‍යායාම.`,
      difficulty: 'easy',
      count: 10,
      estimatedTime: '30-40 minutes',
      focusAreas: learningProfile.weakAreas
    });
  }

  return exercises;
};

/**
 * Generate support strategies
 */
const generateSupportStrategies = (learningProfile, riskLevel, riskType) => {
  const strategies = [];

  // One-on-one support for low performers
  if (learningProfile.averageScore < 50 || riskLevel === 'high' || riskLevel === 'critical') {
    strategies.push({
      id: `one-on-one-${Date.now()}`,
      type: 'one_on_one',
      title: 'පුද්ගලික උපකාර',
      description: 'ගුරුවරයා සමඟ පුද්ගලික සැසි සැලසුම් කරන්න.',
      frequency: riskLevel === 'critical' ? 'Daily' : 'Weekly',
      priority: 'high',
      duration: '30-45 minutes per session'
    });
  }

  // Peer learning
  strategies.push({
    id: `peer-learning-${Date.now()}`,
    type: 'peer_learning',
    title: 'සමකාලීන ඉගෙනීම',
    description: 'වඩා හොඳින් කටයුතු කරන සිසුන් සමඟ ඉගෙනීම.',
    frequency: 'As needed',
    priority: 'medium',
    duration: 'Flexible'
  });

  // Parent involvement for behavioral or high risk
  if (riskType === 'behavioral' || riskType === 'combined' || riskLevel === 'high' || riskLevel === 'critical') {
    strategies.push({
      id: `parent-involvement-${Date.now()}`,
      type: 'parent_involvement',
      title: 'පවුලේ සහභාගීත්වය',
      description: 'පවුලේ සාමාජිකයන් සමඟ සන්නිවේදනය කරන්න.',
      frequency: riskLevel === 'critical' ? 'Weekly' : 'Monthly',
      priority: riskLevel === 'critical' ? 'high' : 'medium',
      duration: 'Ongoing'
    });
  }

  // Behavioral support if needed
  if (learningProfile.behavioralConcern === 'high' || riskType === 'behavioral' || riskType === 'combined') {
    strategies.push({
      id: `behavioral-support-${Date.now()}`,
      type: 'behavioral_support',
      title: 'චර්යාත්මක සහාය',
      description: 'චර්යාත්මක ගැටළු සමඟ කටයුතු කිරීම සඳහා විශේෂිත සහාය.',
      frequency: 'Weekly',
      priority: 'high',
      duration: 'Ongoing'
    });
  }

  return strategies;
};

/**
 * Calculate estimated duration for learning path
 */
const calculateEstimatedDuration = (learningProfile, riskLevel) => {
  let baseWeeks = 4;

  // Adjust based on performance
  if (learningProfile.averageScore < 40) {
    baseWeeks = 6;
  } else if (learningProfile.averageScore > 70) {
    baseWeeks = 3;
  }

  // Adjust based on risk level
  if (riskLevel === 'critical') {
    baseWeeks += 2;
  } else if (riskLevel === 'high') {
    baseWeeks += 1;
  }

  // Adjust based on trend
  if (learningProfile.trend === 'declining') {
    baseWeeks += 1;
  } else if (learningProfile.trend === 'improving') {
    baseWeeks -= 1;
  }

  return `${Math.max(2, baseWeeks)}-${baseWeeks + 2} weeks`;
};

/**
 * Generate milestones for tracking progress
 */
const generateMilestones = (subject, section, learningProfile) => {
  const milestones = [];

  milestones.push({
    id: 'milestone-1',
    title: 'මූලික සංකල්ප හැදෑරීම',
    description: `${section} හි මූලික සංකල්ප හැදෑරීම සහ අවබෝධ කර ගැනීම.`,
    targetScore: 50,
    estimatedWeek: 1,
    status: 'pending'
  });

  milestones.push({
    id: 'milestone-2',
    title: 'ප්‍රායෝගික යෙදීම',
    description: 'සංකල්ප ප්‍රායෝගිකව යෙදීම සහ ව්‍යායාම කිරීම.',
    targetScore: 65,
    estimatedWeek: 2,
    status: 'pending'
  });

  milestones.push({
    id: 'milestone-3',
    title: 'ස්වයං තක්සේරුව',
    description: 'ස්වයං තක්සේරුව හරහා ප්‍රගතිය තක්සේරු කිරීම.',
    targetScore: 75,
    estimatedWeek: 3,
    status: 'pending'
  });

  milestones.push({
    id: 'milestone-4',
    title: 'අවසන් තක්සේරුව',
    description: 'ඉගෙනුම් මාර්ගයේ අවසන් තක්සේරුව.',
    targetScore: 80,
    estimatedWeek: 4,
    status: 'pending'
  });

  return milestones;
};

/**
 * Calculate improvement trend dynamically
 */
const calculateImprovementTrend = async (studentId, learningPathId = null) => {
  try {
    // Get recent progress records
    let query = `
      SELECT * FROM progress_tracking 
      WHERE student_id = $1
    `;
    const params = [studentId];
    
    if (learningPathId) {
      query += ' AND learning_path_id = $2';
      params.push(learningPathId);
    }
    
    query += ' ORDER BY recorded_at DESC LIMIT 10';
    
    const progressData = await db.query(query, params);

    if (progressData.rows.length < 2) {
      return 'stable';
    }

    // Calculate trend from assessment scores
    const scores = progressData.rows
      .map(p => parseFloat(p.assessment_score))
      .filter(s => !isNaN(s) && s > 0);

    if (scores.length < 2) {
      // Use assignment results if available
      const assignments = progressData.rows
        .map(p => parseFloat(p.assignment_result))
        .filter(s => !isNaN(s) && s > 0);

      if (assignments.length < 2) {
        return 'stable';
      }

      const recentAvg = assignments.slice(0, 3).reduce((a, b) => a + b, 0) / Math.min(3, assignments.length);
      const olderAvg = assignments.slice(3, 6).reduce((a, b) => a + b, 0) / Math.min(3, assignments.length - 3);

      if (recentAvg > olderAvg + 5) return 'improving';
      if (recentAvg < olderAvg - 5) return 'declining';
      return 'stable';
    }

    const recentAvg = scores.slice(0, 3).reduce((a, b) => a + b, 0) / Math.min(3, scores.length);
    const olderAvg = scores.slice(3, 6).reduce((a, b) => a + b, 0) / Math.min(3, scores.length - 3);

    if (recentAvg > olderAvg + 5) return 'improving';
    if (recentAvg < olderAvg - 5) return 'declining';
    return 'stable';
  } catch (error) {
    console.error('Error calculating improvement trend:', error);
    return 'stable';
  }
};

/**
 * Evaluate learning path effectiveness
 */
const evaluateEffectiveness = async (studentId, learningPathId) => {
  try {
    // Get all progress for this learning path
    const progressData = await db.query(
      `SELECT * FROM progress_tracking 
       WHERE student_id = $1 AND learning_path_id = $2 
       ORDER BY recorded_at ASC`,
      [studentId, learningPathId]
    );

    if (progressData.rows.length === 0) {
      return {
        effectiveness: 'unknown',
        score: 0,
        metrics: {}
      };
    }

    // Calculate metrics
    const scores = progressData.rows
      .map(p => parseFloat(p.assessment_score) || parseFloat(p.assignment_result) || 0)
      .filter(s => s > 0);

    const taskCompletionRate = (progressData.rows.filter(p => p.task_completed).length / progressData.rows.length) * 100;
    
    const initialScore = scores.length > 0 ? scores[0] : 0;
    const finalScore = scores.length > 0 ? scores[scores.length - 1] : 0;
    const improvement = finalScore - initialScore;
    const averageScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

    // Calculate trend
    const trend = await calculateImprovementTrend(studentId, learningPathId);

    // Determine effectiveness
    let effectiveness = 'moderate';
    let effectivenessScore = 50;

    if (improvement > 15 && taskCompletionRate > 70 && trend === 'improving') {
      effectiveness = 'high';
      effectivenessScore = 85;
    } else if (improvement > 10 && taskCompletionRate > 60) {
      effectiveness = 'good';
      effectivenessScore = 70;
    } else if (improvement < 0 || taskCompletionRate < 40 || trend === 'declining') {
      effectiveness = 'low';
      effectivenessScore = 30;
    }

    return {
      effectiveness,
      score: effectivenessScore,
      metrics: {
        initialScore,
        finalScore,
        improvement,
        averageScore,
        taskCompletionRate,
        trend,
        totalRecords: progressData.rows.length
      },
      recommendations: getEffectivenessRecommendations(effectiveness, improvement, taskCompletionRate, trend)
    };
  } catch (error) {
    console.error('Error evaluating effectiveness:', error);
    return {
      effectiveness: 'unknown',
      score: 0,
      metrics: {},
      error: error.message
    };
  }
};

/**
 * Get recommendations based on effectiveness evaluation
 */
const getEffectivenessRecommendations = (effectiveness, improvement, completionRate, trend) => {
  const recommendations = [];

  if (effectiveness === 'low' || trend === 'declining') {
    recommendations.push({
      type: 'adjust_path',
      title: 'ඉගෙනුම් මාර්ගය සකස් කිරීම',
      description: 'වර්තමාන ඉගෙනුම් මාර්ගය ඵලදායී නොවන බැවින්, විකල්ප ප්‍රවේශයක් සලකා බලන්න.',
      priority: 'high'
    });

    if (completionRate < 50) {
      recommendations.push({
        type: 'increase_support',
        title: 'සහාය වැඩි කිරීම',
        description: 'කාර්ය සම්පූර්ණ කිරීමේ අනුපාතය අඩු බැවින්, වැඩි සහාය සැලසීම අවශ්‍ය වේ.',
        priority: 'high'
      });
    }
  } else if (effectiveness === 'high' || trend === 'improving') {
    recommendations.push({
      type: 'continue_path',
      title: 'ඉගෙනුම් මාර්ගය දිගටම කරගෙන යාම',
      description: 'වර්තමාන ඉගෙනුම් මාර්ගය ඵලදායී වන බැවින්, එය දිගටම කරගෙන යන්න.',
      priority: 'low'
    });
  }

  if (improvement < 5 && completionRate > 60) {
    recommendations.push({
      type: 'increase_difficulty',
      title: 'දුෂ්කරතාවය වැඩි කිරීම',
      description: 'සිසුවා කාර්යයන් සම්පූර්ණ කරන නමුත් ප්‍රගතිය සීමිත බැවින්, වැඩි අභියෝග සැලසීම සලකා බලන්න.',
      priority: 'medium'
    });
  }

  return recommendations;
};

module.exports = {
  generatePersonalizedLearningPath,
  calculateImprovementTrend,
  evaluateEffectiveness,
  analyzeLearningProfile
};

