const db = require('../config/database');
const { identifyWeakStudents } = require('./academicModel');

const earlyWarningSystem = async (data) => {
  try {
    const { student_id, academicRecords, attendanceRecords, behavioralRecords } = data;

    // Analyze academic performance
    const academicAnalysis = await identifyWeakStudents({
      academicRecords,
      attendanceRecords
    });

    // Calculate behavioral risk
    const behavioralRisk = calculateBehavioralRisk(behavioralRecords);

    // Calculate attendance risk
    const attendanceRisk = calculateAttendanceRisk(attendanceRecords);

    // Combine risk factors
    const riskFactors = {
      academic: {
        isWeak: academicAnalysis.isWeak,
        confidence: academicAnalysis.confidence,
        reasons: academicAnalysis.reasons
      },
      behavioral: behavioralRisk,
      attendance: attendanceRisk
    };

    // Determine overall risk
    let isAtRisk = false;
    let riskLevel = 'low';
    let riskType = 'academic';
    let confidence = 0;

    // High risk if academic is weak
    if (academicAnalysis.isWeak && academicAnalysis.confidence > 0.6) {
      isAtRisk = true;
      confidence = academicAnalysis.confidence;
      if (academicAnalysis.confidence > 0.8) {
        riskLevel = 'high';
      } else if (academicAnalysis.confidence > 0.6) {
        riskLevel = 'medium';
      }
    }

    // Increase risk if behavioral issues
    if (behavioralRisk.severity === 'high') {
      isAtRisk = true;
      if (riskLevel === 'low') riskLevel = 'medium';
      if (riskLevel === 'medium') riskLevel = 'high';
      riskType = riskType === 'academic' ? 'combined' : 'behavioral';
      confidence = Math.max(confidence, behavioralRisk.confidence);
    }

    // Increase risk if attendance is poor
    if (attendanceRisk.severity === 'high') {
      isAtRisk = true;
      if (riskLevel === 'low') riskLevel = 'medium';
      if (riskLevel === 'medium') riskLevel = 'high';
      riskType = riskType === 'academic' ? 'combined' : 'attendance';
      confidence = Math.max(confidence, attendanceRisk.confidence);
    }

    // Critical risk if multiple factors
    if (academicAnalysis.isWeak && behavioralRisk.severity === 'high' && attendanceRisk.severity === 'high') {
      riskLevel = 'critical';
      riskType = 'combined';
      confidence = 0.95;
    }

    return {
      isAtRisk,
      riskType,
      riskLevel,
      confidence,
      riskFactors
    };
  } catch (error) {
    console.error('Error in early warning system:', error);
    return {
      isAtRisk: false,
      riskType: 'academic',
      riskLevel: 'low',
      confidence: 0,
      riskFactors: {}
    };
  }
};

const calculateBehavioralRisk = (behavioralRecords) => {
  if (!behavioralRecords || behavioralRecords.length === 0) {
    return { severity: 'low', confidence: 0, negativeCount: 0, totalCount: 0 };
  }

  const negativeCount = behavioralRecords.filter(r => r.behavior_type === 'negative').length;
  const highSeverityCount = behavioralRecords.filter(r => 
    r.behavior_type === 'negative' && r.severity === 'high'
  ).length;
  const totalCount = behavioralRecords.length;
  const negativeRatio = negativeCount / totalCount;

  let severity = 'low';
  let confidence = 0;

  if (highSeverityCount >= 3 || negativeRatio > 0.7) {
    severity = 'high';
    confidence = 0.9;
  } else if (highSeverityCount >= 2 || negativeRatio > 0.5) {
    severity = 'medium';
    confidence = 0.7;
  } else if (negativeCount > 0) {
    severity = 'low';
    confidence = 0.5;
  }

  return {
    severity,
    confidence,
    negativeCount,
    totalCount,
    negativeRatio
  };
};

const calculateAttendanceRisk = (attendanceRecords) => {
  if (!attendanceRecords || attendanceRecords.length === 0) {
    return { severity: 'low', confidence: 0, attendanceRate: 1 };
  }

  const presentCount = attendanceRecords.filter(r => r.status === 'present').length;
  const absentCount = attendanceRecords.filter(r => r.status === 'absent').length;
  const lateCount = attendanceRecords.filter(r => r.status === 'late').length;
  const totalDays = attendanceRecords.length;
  const attendanceRate = presentCount / totalDays;
  const absenceRate = absentCount / totalDays;

  let severity = 'low';
  let confidence = 0;

  if (attendanceRate < 0.6 || absenceRate > 0.4) {
    severity = 'high';
    confidence = 0.9;
  } else if (attendanceRate < 0.75 || absenceRate > 0.25) {
    severity = 'medium';
    confidence = 0.7;
  } else if (attendanceRate < 0.85) {
    severity = 'low';
    confidence = 0.5;
  }

  return {
    severity,
    confidence,
    attendanceRate,
    absenceRate,
    presentCount,
    absentCount,
    lateCount,
    totalDays
  };
};

module.exports = { earlyWarningSystem };

