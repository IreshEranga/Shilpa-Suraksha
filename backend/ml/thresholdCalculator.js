// const db = require('../config/database');

// /**
//  * Calculate dynamic thresholds from historical data
//  * Uses percentiles and statistical measures from existing student data
//  */

// let cachedThresholds = null;
// let lastCalculated = null;
// const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// // Calculate and cache thresholds
// const calculateThresholds = async () => {
//   try {
//     // Check if cache is still valid
//     if (cachedThresholds && lastCalculated && (Date.now() - lastCalculated < CACHE_DURATION)) {
//       return cachedThresholds;
//     }

//     console.log('Calculating dynamic thresholds from historical data...');

//     // 1. Calculate Academic Performance Thresholds
//     const academicStats = await db.query(`
//       SELECT 
//         PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY avg_score) as p25_score,
//         PERCENTILE_CONT(0.40) WITHIN GROUP (ORDER BY avg_score) as p40_score,
//         PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY avg_score) as median_score,
//         AVG(avg_score) as mean_score,
//         STDDEV(avg_score) as stddev_score
//       FROM (
//         SELECT 
//           s.id,
//           AVG(ar.score / NULLIF(ar.max_score, 0)) as avg_score
//         FROM students s
//         LEFT JOIN academic_records ar ON s.id = ar.student_id
//         WHERE ar.score IS NOT NULL AND ar.max_score > 0
//         GROUP BY s.id
//         HAVING COUNT(ar.id) >= 2
//       ) student_scores
//     `);

//     // 2. Calculate Attendance Thresholds
//     const attendanceStats = await db.query(`
//       SELECT 
//         PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY attendance_rate) as p25_attendance,
//         PERCENTILE_CONT(0.40) WITHIN GROUP (ORDER BY attendance_rate) as p40_attendance,
//         PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY attendance_rate) as median_attendance,
//         AVG(attendance_rate) as mean_attendance,
//         STDDEV(attendance_rate) as stddev_attendance
//       FROM (
//         SELECT 
//           student_id,
//           CAST(COUNT(*) FILTER (WHERE status = 'present') AS FLOAT) / 
//           NULLIF(COUNT(*), 0) as attendance_rate
//         FROM attendance_records
//         GROUP BY student_id
//         HAVING COUNT(*) >= 5
//       ) student_attendance
//     `);

//     // 3. Calculate Behavioral Risk Thresholds
//     const behavioralStats = await db.query(`
//       SELECT 
//         PERCENTILE_CONT(0.60) WITHIN GROUP (ORDER BY negative_ratio) as p60_negative_ratio,
//         PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY negative_ratio) as p75_negative_ratio,
//         AVG(negative_count) as avg_negative_count,
//         PERCENTILE_CONT(0.67) WITHIN GROUP (ORDER BY high_severity_count) as p67_high_severity,
//         PERCENTILE_CONT(0.85) WITHIN GROUP (ORDER BY high_severity_count) as p85_high_severity
//       FROM (
//         SELECT 
//           student_id,
//           COUNT(*) FILTER (WHERE behavior_type = 'negative') as negative_count,
//           COUNT(*) FILTER (WHERE behavior_type = 'negative' AND severity = 'high') as high_severity_count,
//           CAST(COUNT(*) FILTER (WHERE behavior_type = 'negative') AS FLOAT) / 
//           NULLIF(COUNT(*), 0) as negative_ratio
//         FROM behavioral_records
//         GROUP BY student_id
//         HAVING COUNT(*) >= 2
//       ) student_behavior
//     `);

//     // 4. Calculate absence rate thresholds
//     const absenceStats = await db.query(`
//       SELECT 
//         PERCENTILE_CONT(0.60) WITHIN GROUP (ORDER BY absence_rate) as p60_absence,
//         PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY absence_rate) as p75_absence
//       FROM (
//         SELECT 
//           student_id,
//           CAST(COUNT(*) FILTER (WHERE status = 'absent') AS FLOAT) / 
//           NULLIF(COUNT(*), 0) as absence_rate
//         FROM attendance_records
//         GROUP BY student_id
//         HAVING COUNT(*) >= 5
//       ) student_absences
//     `);

//     // Parse results with defaults if no data exists
//     const academic = academicStats.rows[0] || {};
//     const attendance = attendanceStats.rows[0] || {};
//     const behavioral = behavioralStats.rows[0] || {};
//     const absence = absenceStats.rows[0] || {};

//     // Build threshold object with fallback to sensible defaults
//     const thresholds = {
//       academic: {
//         // Use 40th percentile for medium risk, 25th percentile for high risk
//         lowScoreThreshold: parseFloat(academic.p40_score) || 0.50,
//         criticalScoreThreshold: parseFloat(academic.p25_score) || 0.40,
//         medianScore: parseFloat(academic.median_score) || 0.65,
//         meanScore: parseFloat(academic.mean_score) || 0.65,
//         stddevScore: parseFloat(academic.stddev_score) || 0.15
//       },
//       attendance: {
//         // Use 40th percentile for medium risk, 25th percentile for high risk
//         mediumRiskThreshold: parseFloat(attendance.p40_attendance) || 0.75,
//         highRiskThreshold: parseFloat(attendance.p25_attendance) || 0.60,
//         medianAttendance: parseFloat(attendance.median_attendance) || 0.85,
//         meanAttendance: parseFloat(attendance.mean_attendance) || 0.85
//       },
//       behavioral: {
//         // Medium risk: top 40% of negative ratios, High risk: top 25%
//         mediumNegativeRatio: parseFloat(behavioral.p60_negative_ratio) || 0.50,
//         highNegativeRatio: parseFloat(behavioral.p75_negative_ratio) || 0.70,
//         avgNegativeCount: parseFloat(behavioral.avg_negative_count) || 2,
//         mediumHighSeverityCount: Math.ceil(parseFloat(behavioral.p67_high_severity) || 2),
//         highHighSeverityCount: Math.ceil(parseFloat(behavioral.p85_high_severity) || 3)
//       },
//       absence: {
//         // Absence rate thresholds (inverse of attendance)
//         mediumRiskThreshold: parseFloat(absence.p60_absence) || 0.25,
//         highRiskThreshold: parseFloat(absence.p75_absence) || 0.40
//       }
//     };

//     // Cache the thresholds
//     cachedThresholds = thresholds;
//     lastCalculated = Date.now();

//     console.log('Dynamic thresholds calculated:', JSON.stringify(thresholds, null, 2));

//     return thresholds;
//   } catch (error) {
//     console.error('Error calculating thresholds:', error);
    
//     // Return sensible defaults if calculation fails
//     return {
//       academic: {
//         lowScoreThreshold: 0.50,
//         criticalScoreThreshold: 0.40,
//         medianScore: 0.65,
//         meanScore: 0.65,
//         stddevScore: 0.15
//       },
//       attendance: {
//         mediumRiskThreshold: 0.75,
//         highRiskThreshold: 0.60,
//         medianAttendance: 0.85,
//         meanAttendance: 0.85
//       },
//       behavioral: {
//         mediumNegativeRatio: 0.50,
//         highNegativeRatio: 0.70,
//         avgNegativeCount: 2,
//         mediumHighSeverityCount: 2,
//         highHighSeverityCount: 3
//       },
//       absence: {
//         mediumRiskThreshold: 0.25,
//         highRiskThreshold: 0.40
//       }
//     };
//   }
// };

// // Force recalculation of thresholds
// const recalculateThresholds = async () => {
//   cachedThresholds = null;
//   lastCalculated = null;
//   return await calculateThresholds();
// };

// // Get current thresholds (from cache or calculate)
// const getThresholds = async () => {
//   return await calculateThresholds();
// };

// module.exports = {
//   calculateThresholds,
//   recalculateThresholds,
//   getThresholds
// };


const db = require('../config/database');

/**
 * Calculate dynamic thresholds from historical data
 * Uses percentiles and statistical measures from existing student data
 * 
 */

let cachedThresholds = null;
let lastCalculated = null;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours (for manual API calls)

// Calculate and cache thresholds
const calculateThresholds = async (forceRecalculate = false) => {
  try {
    // Check if cache is still valid (unless force recalculate)
    if (!forceRecalculate && cachedThresholds && lastCalculated && (Date.now() - lastCalculated < CACHE_DURATION)) {
      console.log('Using cached thresholds (calculated', Math.floor((Date.now() - lastCalculated) / 1000 / 60), 'minutes ago)');
      return cachedThresholds;
    }

    console.log('Calculating dynamic thresholds from historical data...');

    // 1. Calculate Academic Performance Thresholds
    const academicStats = await db.query(`
      SELECT 
        PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY avg_score) as p25_score,
        PERCENTILE_CONT(0.40) WITHIN GROUP (ORDER BY avg_score) as p40_score,
        PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY avg_score) as median_score,
        AVG(avg_score) as mean_score,
        STDDEV(avg_score) as stddev_score
      FROM (
        SELECT 
          s.id,
          AVG(ar.score / NULLIF(ar.max_score, 0)) as avg_score
        FROM students s
        LEFT JOIN academic_records ar ON s.id = ar.student_id
        WHERE ar.score IS NOT NULL AND ar.max_score > 0
        GROUP BY s.id
        HAVING COUNT(ar.id) >= 2
      ) student_scores
    `);

    // 2. Calculate Attendance Thresholds
    const attendanceStats = await db.query(`
      SELECT 
        PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY attendance_rate) as p25_attendance,
        PERCENTILE_CONT(0.40) WITHIN GROUP (ORDER BY attendance_rate) as p40_attendance,
        PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY attendance_rate) as median_attendance,
        AVG(attendance_rate) as mean_attendance,
        STDDEV(attendance_rate) as stddev_attendance
      FROM (
        SELECT 
          student_id,
          CAST(COUNT(*) FILTER (WHERE status = 'present') AS FLOAT) / 
          NULLIF(COUNT(*), 0) as attendance_rate
        FROM attendance_records
        GROUP BY student_id
        HAVING COUNT(*) >= 5
      ) student_attendance
    `);

    // 3. Calculate Behavioral Risk Thresholds
    const behavioralStats = await db.query(`
      SELECT 
        PERCENTILE_CONT(0.60) WITHIN GROUP (ORDER BY negative_ratio) as p60_negative_ratio,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY negative_ratio) as p75_negative_ratio,
        AVG(negative_count) as avg_negative_count,
        PERCENTILE_CONT(0.67) WITHIN GROUP (ORDER BY high_severity_count) as p67_high_severity,
        PERCENTILE_CONT(0.85) WITHIN GROUP (ORDER BY high_severity_count) as p85_high_severity
      FROM (
        SELECT 
          student_id,
          COUNT(*) FILTER (WHERE behavior_type = 'negative') as negative_count,
          COUNT(*) FILTER (WHERE behavior_type = 'negative' AND severity = 'high') as high_severity_count,
          CAST(COUNT(*) FILTER (WHERE behavior_type = 'negative') AS FLOAT) / 
          NULLIF(COUNT(*), 0) as negative_ratio
        FROM behavioral_records
        GROUP BY student_id
        HAVING COUNT(*) >= 2
      ) student_behavior
    `);

    // 4. Calculate absence rate thresholds
    const absenceStats = await db.query(`
      SELECT 
        PERCENTILE_CONT(0.60) WITHIN GROUP (ORDER BY absence_rate) as p60_absence,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY absence_rate) as p75_absence
      FROM (
        SELECT 
          student_id,
          CAST(COUNT(*) FILTER (WHERE status = 'absent') AS FLOAT) / 
          NULLIF(COUNT(*), 0) as absence_rate
        FROM attendance_records
        GROUP BY student_id
        HAVING COUNT(*) >= 5
      ) student_absences
    `);

    // Parse results with defaults if no data exists
    const academic = academicStats.rows[0] || {};
    const attendance = attendanceStats.rows[0] || {};
    const behavioral = behavioralStats.rows[0] || {};
    const absence = absenceStats.rows[0] || {};

    // Build threshold object with fallback to sensible defaults
    const thresholds = {
      academic: {
        // Use 40th percentile for medium risk, 25th percentile for high risk
        lowScoreThreshold: parseFloat(academic.p40_score) || 0.50,
        criticalScoreThreshold: parseFloat(academic.p25_score) || 0.40,
        medianScore: parseFloat(academic.median_score) || 0.65,
        meanScore: parseFloat(academic.mean_score) || 0.65,
        stddevScore: parseFloat(academic.stddev_score) || 0.15
      },
      attendance: {
        // Use 40th percentile for medium risk, 25th percentile for high risk
        mediumRiskThreshold: parseFloat(attendance.p40_attendance) || 0.75,
        highRiskThreshold: parseFloat(attendance.p25_attendance) || 0.60,
        medianAttendance: parseFloat(attendance.median_attendance) || 0.85,
        meanAttendance: parseFloat(attendance.mean_attendance) || 0.85
      },
      behavioral: {
        // Medium risk: top 40% of negative ratios, High risk: top 25%
        mediumNegativeRatio: parseFloat(behavioral.p60_negative_ratio) || 0.50,
        highNegativeRatio: parseFloat(behavioral.p75_negative_ratio) || 0.70,
        avgNegativeCount: parseFloat(behavioral.avg_negative_count) || 2,
        mediumHighSeverityCount: Math.ceil(parseFloat(behavioral.p67_high_severity) || 2),
        highHighSeverityCount: Math.ceil(parseFloat(behavioral.p85_high_severity) || 3)
      },
      absence: {
        // Absence rate thresholds (inverse of attendance)
        mediumRiskThreshold: parseFloat(absence.p60_absence) || 0.25,
        highRiskThreshold: parseFloat(absence.p75_absence) || 0.40
      },
      metadata: {
        calculatedAt: new Date().toISOString(),
        source: forceRecalculate ? 'fresh_calculation' : 'cache_refresh'
      }
    };

    // Cache the thresholds
    cachedThresholds = thresholds;
    lastCalculated = Date.now();

    console.log('✓ Dynamic thresholds calculated successfully:');
    console.log('  - Academic low threshold:', (thresholds.academic.lowScoreThreshold * 100).toFixed(1) + '%');
    console.log('  - Attendance medium threshold:', (thresholds.attendance.mediumRiskThreshold * 100).toFixed(1) + '%');
    console.log('  - Behavioral high severity count:', thresholds.behavioral.highHighSeverityCount);

    return thresholds;
  } catch (error) {
    console.error('Error calculating thresholds:', error);
    
    // Return sensible defaults if calculation fails
    return {
      academic: {
        lowScoreThreshold: 0.50,
        criticalScoreThreshold: 0.40,
        medianScore: 0.65,
        meanScore: 0.65,
        stddevScore: 0.15
      },
      attendance: {
        mediumRiskThreshold: 0.75,
        highRiskThreshold: 0.60,
        medianAttendance: 0.85,
        meanAttendance: 0.85
      },
      behavioral: {
        mediumNegativeRatio: 0.50,
        highNegativeRatio: 0.70,
        avgNegativeCount: 2,
        mediumHighSeverityCount: 2,
        highHighSeverityCount: 3
      },
      absence: {
        mediumRiskThreshold: 0.25,
        highRiskThreshold: 0.40
      },
      metadata: {
        calculatedAt: new Date().toISOString(),
        source: 'default_fallback',
        error: error.message
      }
    };
  }
};

// Force recalculation of thresholds (called from early warning system)
const recalculateThresholds = async () => {
  console.log('🔄 Forcing fresh threshold calculation...');
  return await calculateThresholds(true);
};

// Get current thresholds (from cache or calculate)
const getThresholds = async () => {
  return await calculateThresholds(false);
};

// Get fresh thresholds (always recalculate - use this in early warning)
const getFreshThresholds = async () => {
  return await calculateThresholds(true);
};

module.exports = {
  calculateThresholds,
  recalculateThresholds,
  getThresholds,
  getFreshThresholds  // New export for fresh calculation
};