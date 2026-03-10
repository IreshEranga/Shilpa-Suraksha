const db = require('../config/database');
const { generateLearningPath } = require('./learningPathModel');

// Generate personalized recommendations for a student based on their weak subjects, academic history, and risk factors
const generateRecommendations = async (data) => {
  try {
    const { student_id, weak_subject, weak_section, grade_level, academicHistory } = data;

    // Generate base learning path strictly filtering by Grade Level
    const learningPath = await generateLearningPath({
      subject: weak_subject,
      section: weak_section,
      studentId: student_id,
      gradeLevel: grade_level
    });

    const performanceAnalysis = analyzePerformance(academicHistory, weak_subject);

    const activities = generateActivityRecommendations(weak_subject, weak_section, performanceAnalysis, grade_level);
    const exercises = generateRemedialExercises(weak_subject, weak_section, performanceAnalysis);
    const strategies = generateSupportStrategies(performanceAnalysis);

    return {
      content: learningPath.content,
      resources: learningPath.resources,
      activities,
      exercises,
      strategies,
      performanceAnalysis
    };
  } catch (error) {
    console.error('Error generating recommendations:', error);
    return {
      content: `\n[ ${data.grade_level || ''} ශ්‍රේණිය | විෂය: ${data.weak_subject} | කොටස: ${data.weak_section} ] සඳහා ඉගෙනුම් මාර්ගය\n\nමූලික සංකල්ප හැදෑරීමට පටන් ගන්න.`,
      resources: [], activities: [], exercises: [], strategies: []
    };
  }
};

// Analyze academic performance to identify trends, weak areas, and strengths
const analyzePerformance = (academicHistory, subject) => {
  if (!academicHistory || academicHistory.length === 0) {
    return { averageScore: 0, trend: 'unknown', weakAreas: [], strengths: [] };
  }

  const subjectRecords = academicHistory.filter(r => r.subject === subject);
  const scores = subjectRecords.map(r => parseFloat(r.score) || 0);
  const averageScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  const recentScores = scores.slice(-3);
  const olderScores = scores.slice(0, -3);
  const recentAvg = recentScores.length > 0 ? recentScores.reduce((a, b) => a + b, 0) / recentScores.length : 0;
  const olderAvg = olderScores.length > 0 ? olderScores.reduce((a, b) => a + b, 0) / olderScores.length : recentAvg;

  let trend = 'stable';
  if (recentAvg > olderAvg + 5) trend = 'improving';
  else if (recentAvg < olderAvg - 5) trend = 'declining';

  return {
    averageScore, trend, totalAttempts: scores.length,
    weakAreas: averageScore < 50 ? [subject] : [],
    strengths: averageScore > 70 ? [subject] : []
  };
};

// Generate personalized activity recommendations based on performance analysis and grade level
const generateActivityRecommendations = (subject, section, performanceAnalysis, gradeLevel) => {
  const activities = [];
  const remedialGrade = gradeLevel ? gradeLevel - 1 : '';

  if (performanceAnalysis.averageScore < 40) {
    activities.push({
      type: 'foundational',
      title: `මූලික සංකල්ප පුහුණුව (ශ්‍රේණිය ${remedialGrade} පුනරීක්ෂණ)`,
      description: `${section} හි මූලික සංකල්ප හැදෑරීමට පටන් ගන්න. සරල උදාහරණ සමඟ ආරම්භ කරන්න.`,
      duration: '2-3 weeks', priority: 'high'
    });
  }

  activities.push({
    type: 'interactive', title: 'අන්තර්ක්‍රියාකාරී ක්‍රියාකාරකම්',
    description: `${section} කොටස සඳහා ප්‍රායෝගික අත්දැකීම් සපයන ක්‍රියාකාරකම්.`,
    duration: '1-2 weeks', priority: 'medium'
  });

  if (performanceAnalysis.trend === 'declining') {
    activities.push({
      type: 'remedial', title: 'ප්‍රතිකාර වැඩසටහන',
      description: 'පසුගිය කාලයේ පෙන්වූ පහළ ඵලදායිතාව හඳුනාගැනීම සහ වැඩිදියුණු කිරීම.',
      duration: '3-4 weeks', priority: 'high'
    });
  }
  return activities;
};

const generateRemedialExercises = (subject, section, performanceAnalysis) => {
  return [
    { type: 'practice', title: 'පුනරීක්ෂණ ව්‍යායාම', description: `${section} කොටස සඳහා පුනරීක්ෂණ ව්‍යායාම. සරල සිට දුෂ්කර දක්වා.`, difficulty: performanceAnalysis.averageScore < 50 ? 'easy' : 'medium', count: 10 },
    { type: 'assessment', title: 'ස්වයං තක්සේරුව', description: 'ඔබගේ ප්‍රගතිය තක්සේරු කිරීම සඳහා කෙටි ප්‍රශ්න පත්‍රය.', difficulty: 'medium', count: 5 }
  ];
};

const generateSupportStrategies = (performanceAnalysis) => {
  const strategies = [];
  if (performanceAnalysis.averageScore < 50) {
    strategies.push({ type: 'one_on_one', title: 'පුද්ගලික උපකාර', description: 'ගුරුවරයා සමඟ පුද්ගලික සැසි සැලසුම් කරන්න.', frequency: 'Weekly' });
  }
  strategies.push({ type: 'peer_learning', title: 'සමකාලීන ඉගෙනීම', description: 'වඩා හොඳින් කටයුතු කරන සිසුන් සමඟ ඉගෙනීම.', frequency: 'As needed' });
  if (performanceAnalysis.trend === 'declining') {
    strategies.push({ type: 'parent_involvement', title: 'පවුලේ සහභාගීත්වය', description: 'පවුලේ සාමාජිකයන් සමඟ සන්නිවේදනය කරන්න.', frequency: 'Monthly' });
  }
  return strategies;
};

module.exports = { generateRecommendations };