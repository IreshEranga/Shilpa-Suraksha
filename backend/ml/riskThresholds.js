const db = require('../config/database');

let cachedThresholds = null;

const loadRiskThresholds = async () => {
  if (cachedThresholds) return cachedThresholds;

  // Academic score distribution
  const academicStats = await db.query(`
    SELECT 
      AVG(score / NULLIF(max_score, 0)) AS mean_score,
      PERCENTILE_CONT(0.3) 
        WITHIN GROUP (ORDER BY score / NULLIF(max_score, 0)) AS low_score_threshold
    FROM academic_records
  `);

  // Attendance distribution
  const attendanceStats = await db.query(`
    SELECT 
      AVG(present_count::float / total_days) AS mean_attendance,
      PERCENTILE_CONT(0.25)
        WITHIN GROUP (ORDER BY present_count::float / total_days) AS low_attendance_threshold
    FROM (
      SELECT 
        student_id,
        COUNT(*) FILTER (WHERE status = 'present') AS present_count,
        COUNT(*) AS total_days
      FROM attendance_records
      GROUP BY student_id
    ) t
  `);

  // Behavioral distribution
  const behaviorStats = await db.query(`
    SELECT 
      AVG(negative_ratio) AS avg_negative_ratio,
      AVG(negative_ratio) + STDDEV(negative_ratio) AS high_behavior_threshold
    FROM (
      SELECT 
        student_id,
        COUNT(*) FILTER (WHERE behavior_type = 'negative')::float / COUNT(*) AS negative_ratio
      FROM behavioral_records
      GROUP BY student_id
    ) b
  `);

  cachedThresholds = {
    academic: {
      mean: academicStats.rows[0].mean_score || 0.6,
      low: academicStats.rows[0].low_score_threshold || 0.5
    },
    attendance: {
      mean: attendanceStats.rows[0].mean_attendance || 0.8,
      low: attendanceStats.rows[0].low_attendance_threshold || 0.7
    },
    behavior: {
      high: behaviorStats.rows[0].high_behavior_threshold || 0.6
    }
  };

  console.log('Dynamic risk thresholds loaded:', cachedThresholds);
  return cachedThresholds;
};

module.exports = { loadRiskThresholds };
