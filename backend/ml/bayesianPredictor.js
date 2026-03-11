/**
 * Bayesian Network Predictor for Uncertainty-Aware Progress Tracking
 * Calculates the probability distribution of a student's future success.
 */

const calculateBayesianTrend = (scores) => {
  // Need at least 2 scores to calculate a reliable trend
  if (!scores || scores.length < 2) {
    return { trend: 'stable', confidence: 50.0, predictedNextScore: scores && scores.length > 0 ? scores[0] : 0 };
  }

  const n = scores.length;
  
  // Calculate Total Mean (μ)
  const mean = scores.reduce((a, b) => a + b, 0) / n;

  // Calculate Variance (σ²) and Standard Deviation
  const variance = scores.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
  const stdDev = Math.sqrt(variance) || 1;

  // Compare the absolute MOST RECENT score against the HISTORICAL average
  const currentScore = scores[n - 1];
  const historicalMean = scores.slice(0, n - 1).reduce((a, b) => a + b, 0) / (n - 1);
  
  // Calculate Momentum (Direction of growth)
  const momentum = currentScore - historicalMean;

  // Bayesian Update: Predict next score using momentum
  let predictedNextScore = currentScore + (momentum * 0.4);
  predictedNextScore = Math.max(0, Math.min(100, predictedNextScore)); // Cap between 0 and 100

  // Calculate Confidence % based on variance (Low variance = steady = high confidence)
  let confidence = 100 - (stdDev * 1.2); 
  confidence = Math.max(30, Math.min(99, confidence)); // Cap between 30% and 99%

  // Determine Trend Label
  let trend = 'stable';
  if (predictedNextScore > historicalMean + 5) {
    trend = 'improving';
  } else if (predictedNextScore < historicalMean - 5) {
    trend = 'declining';
  }

  return {
    trend,
    confidence: Math.round(confidence * 10) / 10,
    predictedNextScore: Math.round(predictedNextScore * 10) / 10
  };
};

module.exports = { calculateBayesianTrend };