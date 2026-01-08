// Analyzes emotional indicators and behavioral patterns
const db = require('../config/database');

const emotionBehavioralAnalysis = async (data) => {
  try {
    const { student_id, behavioralRecords, emotionAnalysis } = data;

    // Analyze behavioral patterns
    const behavioralPattern = analyzeBehavioralPattern(behavioralRecords);

    // Analyze emotions if available
    const emotionPattern = emotionAnalysis ? analyzeEmotionPattern(emotionAnalysis) : null;

    // Combine analysis
    const factors = {
      behavioral: behavioralPattern,
      emotional: emotionPattern
    };

    // Determine risk
    let isAtRisk = false;
    let riskLevel = 'low';
    let confidence = 0;

    // High risk if negative emotions detected
    if (emotionPattern && emotionPattern.isNegative && emotionPattern.confidence > 0.7) {
      isAtRisk = true;
      riskLevel = 'high';
      confidence = emotionPattern.confidence;
    }

    // Increase risk if behavioral issues
    if (behavioralPattern.severity === 'high') {
      isAtRisk = true;
      if (riskLevel === 'low') riskLevel = 'medium';
      if (riskLevel === 'medium') riskLevel = 'high';
      confidence = Math.max(confidence, behavioralPattern.confidence);
    }

    // Critical if both emotional and behavioral issues
    if (emotionPattern && emotionPattern.isNegative && behavioralPattern.severity === 'high') {
      riskLevel = 'critical';
      confidence = 0.95;
    }

    return {
      isAtRisk,
      riskLevel,
      confidence,
      factors,
      recommendations: generateBehavioralRecommendations(factors)
    };
  } catch (error) {
    console.error('Error in emotion behavioral analysis:', error);
    return {
      isAtRisk: false,
      riskLevel: 'low',
      confidence: 0,
      factors: {},
      recommendations: []
    };
  }
};

const analyzeBehavioralPattern = (behavioralRecords) => {
  if (!behavioralRecords || behavioralRecords.length === 0) {
    return { severity: 'low', confidence: 0, pattern: 'insufficient_data' };
  }

  const negativeRecords = behavioralRecords.filter(r => r.behavior_type === 'negative');
  const positiveRecords = behavioralRecords.filter(r => r.behavior_type === 'positive');
  const highSeverityCount = negativeRecords.filter(r => r.severity === 'high').length;
  const recentNegativeCount = negativeRecords.filter(r => {
    const recordDate = new Date(r.observation_date);
    const daysAgo = (Date.now() - recordDate.getTime()) / (1000 * 60 * 60 * 24);
    return daysAgo <= 30;
  }).length;

  const negativeRatio = negativeRecords.length / behavioralRecords.length;
  const positiveRatio = positiveRecords.length / behavioralRecords.length;

  let severity = 'low';
  let confidence = 0;
  let pattern = 'stable';

  if (highSeverityCount >= 3 || (recentNegativeCount >= 5 && negativeRatio > 0.6)) {
    severity = 'high';
    confidence = 0.9;
    pattern = 'escalating';
  } else if (highSeverityCount >= 2 || (recentNegativeCount >= 3 && negativeRatio > 0.5)) {
    severity = 'medium';
    confidence = 0.7;
    pattern = 'concerning';
  } else if (negativeRecords.length > 0) {
    severity = 'low';
    confidence = 0.5;
    pattern = 'monitoring';
  } else if (positiveRatio > 0.7) {
    pattern = 'positive';
    confidence = 0.8;
  }

  return {
    severity,
    confidence,
    pattern,
    negativeCount: negativeRecords.length,
    positiveCount: positiveRecords.length,
    highSeverityCount,
    recentNegativeCount
  };
};

const analyzeEmotionPattern = (emotionAnalysis) => {
  if (!emotionAnalysis) {
    return null;
  }

  const { emotion, confidence, isWeak } = emotionAnalysis;

  const isNegative = ['angry', 'fear', 'sad'].includes(emotion);
  const isPositive = emotion === 'happy';

  return {
    emotion,
    isNegative,
    isPositive,
    confidence,
    isWeak,
    interpretation: getEmotionInterpretation(emotion, confidence)
  };
};

const getEmotionInterpretation = (emotion, confidence) => {
  const interpretations = {
    angry: 'Student shows signs of frustration or anger, which may indicate learning difficulties or social challenges.',
    fear: 'Student displays fear or anxiety, potentially related to academic pressure or classroom environment.',
    sad: 'Student appears sad or withdrawn, which could signal emotional distress affecting learning.',
    happy: 'Student shows positive emotions, indicating good engagement and well-being.'
  };

  return interpretations[emotion] || 'Emotional state requires further observation.';
};

const generateBehavioralRecommendations = (factors) => {
  const recommendations = [];

  if (factors.behavioral && factors.behavioral.severity === 'high') {
    recommendations.push({
      type: 'immediate_intervention',
      title: 'Immediate Behavioral Support',
      description: 'Student requires immediate behavioral intervention and support.',
      priority: 'high'
    });
  }

  if (factors.emotional && factors.emotional.isNegative) {
    recommendations.push({
      type: 'emotional_support',
      title: 'Emotional Support Needed',
      description: 'Provide emotional support and counseling resources.',
      priority: 'medium'
    });
  }

  if (factors.behavioral && factors.behavioral.pattern === 'escalating') {
    recommendations.push({
      type: 'parent_communication',
      title: 'Parent Communication',
      description: 'Schedule meeting with parents to discuss behavioral patterns.',
      priority: 'high'
    });
  }

  return recommendations;
};

module.exports = { emotionBehavioralAnalysis };

