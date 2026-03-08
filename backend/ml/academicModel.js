// let tf;
// try {
//   tf = require('@tensorflow/tfjs-node');
// } catch (error) {
//   console.warn('TensorFlow.js Node.js bindings not available, using CPU backend');
//   tf = require('@tensorflow/tfjs');
// }

// const db = require('../config/database');

// let model = null;

// // Initialize and train the academic model
// const initializeModel = async () => {
//   try {
//     // Load or create model
//     model = tf.sequential({
//       layers: [
//         tf.layers.dense({ inputShape: [5], units: 64, activation: 'relu' }),
//         tf.layers.dropout({ rate: 0.2 }),
//         tf.layers.dense({ units: 32, activation: 'relu' }),
//         tf.layers.dropout({ rate: 0.2 }),
//         tf.layers.dense({ units: 16, activation: 'relu' }),
//         tf.layers.dense({ units: 1, activation: 'sigmoid' })
//       ]
//     });

//     model.compile({
//       optimizer: 'adam',
//       loss: 'binaryCrossentropy',
//       metrics: ['accuracy']
//     });

//     console.log('Academic model initialized');
//   } catch (error) {
//     console.error('Error initializing academic model:', error);
//   }
// };

// // Train the model from database data
// const trainModel = async () => {
//   try {
//     // Get all academic and attendance data
//     const academicData = await db.query(`
//       SELECT 
//         s.id as student_id,
//         AVG(ar.score / NULLIF(ar.max_score, 0)) as avg_score,
//         COUNT(ar.id) as exam_count,
//         COUNT(DISTINCT ar.subject) as subject_count
//       FROM students s
//       LEFT JOIN academic_records ar ON s.id = ar.student_id
//       GROUP BY s.id
//     `);

//     const attendanceData = await db.query(`
//       SELECT 
//         student_id,
//         COUNT(*) FILTER (WHERE status = 'present') as present_count,
//         COUNT(*) FILTER (WHERE status = 'absent') as absent_count,
//         COUNT(*) FILTER (WHERE status = 'late') as late_count,
//         COUNT(*) as total_days
//       FROM attendance_records
//       GROUP BY student_id
//     `);

//     // Get weak students (labeled data)
//     const weakStudents = await db.query(`
//       SELECT DISTINCT student_id 
//       FROM weak_students
//     `);

//     const weakStudentIds = new Set(weakStudents.rows.map(r => r.student_id));

//     // If no labeled weak students, use rule-based labeling for training
//     // (students with avg_score < 0.5 or attendance < 0.7 are considered weak)
//     const useRuleBasedLabeling = weakStudentIds.size === 0;
//     if (useRuleBasedLabeling) {
//       console.log('No labeled weak students found. Using rule-based labeling for training...');
//     }

//     // Prepare training data
//     const features = [];
//     const labels = [];

//     for (const academic of academicData.rows) {
//       const attendance = attendanceData.rows.find(a => a.student_id === academic.student_id);
      
//       if (!attendance) continue;

//       // Ensure all values are numbers (PostgreSQL may return strings)
//       const avgScore = parseFloat(academic.avg_score) || 0;
//       const presentCount = parseFloat(attendance.present_count) || 0;
//       const totalDays = parseFloat(attendance.total_days) || 0;
//       const lateCount = parseFloat(attendance.late_count) || 0;
//       const examCount = parseFloat(academic.exam_count) || 0;
//       const subjectCount = parseFloat(academic.subject_count) || 0;

//       const attendanceRate = totalDays > 0 ? presentCount / totalDays : 0;
//       const lateRate = totalDays > 0 ? lateCount / totalDays : 0;

//       // Ensure all feature values are numbers
//       const featureArray = [
//         Number(avgScore) || 0,
//         Number(attendanceRate) || 0,
//         Number(examCount) / 10, // Normalize
//         Number(subjectCount) / 5, // Normalize
//         Number(lateRate) || 0
//       ];

//       // Validate all values are finite numbers
//       if (featureArray.every(val => typeof val === 'number' && isFinite(val))) {
//         features.push(featureArray);
        
//         // Determine label: use existing labels or rule-based
//         let label = 0;
//         if (useRuleBasedLabeling) {
//           // Rule-based: weak if avg_score < 0.5 OR attendance < 0.7
//           label = (avgScore < 0.5 || attendanceRate < 0.7) ? 1 : 0;
//         } else {
//           label = weakStudentIds.has(academic.student_id) ? 1 : 0;
//         }
        
//         labels.push(label);
//       } else {
//         console.warn('Skipping invalid feature values:', featureArray);
//       }
//     }

//     if (features.length === 0) {
//       console.log('No training data available');
//       return;
//     }

//     console.log(`Preparing to train with ${features.length} samples...`);
//     console.log('Sample features:', features[0]);
//     console.log('Sample labels:', labels.slice(0, 5));

//     // Ensure all values are numbers and create tensors
//     const numericFeatures = features.map(f => f.map(v => Number(v) || 0));
//     const numericLabels = labels.map(l => Number(l) || 0);

//     const xs = tf.tensor2d(numericFeatures);
//     const ys = tf.tensor2d(numericLabels, [numericLabels.length, 1]);

//     // Train the model
//     await model.fit(xs, ys, {
//       epochs: 50,
//       batchSize: 32,
//       validationSplit: 0.2,
//       callbacks: {
//         onEpochEnd: (epoch, logs) => {
//           const loss = logs.loss ? logs.loss.toFixed(4) : 'N/A';
//           const acc = (logs.acc || logs.accuracy) ? (logs.acc || logs.accuracy).toFixed(4) : 'N/A';
//           const valLoss = logs.val_loss ? logs.val_loss.toFixed(4) : 'N/A';
//           const valAcc = (logs.val_acc || logs.val_accuracy) ? (logs.val_acc || logs.val_accuracy).toFixed(4) : 'N/A';
//           console.log(`Epoch ${epoch + 1}: loss = ${loss}, acc = ${acc}, val_loss = ${valLoss}, val_acc = ${valAcc}`);
//         }
//       }
//     });

//     xs.dispose();
//     ys.dispose();

//     console.log('Academic model trained successfully');
//   } catch (error) {
//     console.error('Error training academic model:', error);
//   }
// };

// // Identify weak students using the model
// const identifyWeakStudents = async (data) => {
//   try {
//     if (!model) {
//       await initializeModel();
//     }

//     const { academicRecords, attendanceRecords } = data;

//     // Calculate features
//     const scores = academicRecords.map(r => (r.score || 0) / (r.max_score || 100));
//     const avgScore = scores.length > 0 
//       ? scores.reduce((a, b) => a + b, 0) / scores.length 
//       : 0;

//     const presentCount = attendanceRecords.filter(r => r.status === 'present').length;
//     const totalDays = attendanceRecords.length;
//     const attendanceRate = totalDays > 0 ? presentCount / totalDays : 0;

//     const examCount = academicRecords.length;
//     const subjectCount = new Set(academicRecords.map(r => r.subject)).size;
//     const lateCount = attendanceRecords.filter(r => r.status === 'late').length;
//     const lateRate = totalDays > 0 ? lateCount / totalDays : 0;

//     // Prepare input
//     const input = tf.tensor2d([[
//       avgScore,
//       attendanceRate,
//       examCount / 10,
//       subjectCount / 5,
//       lateRate
//     ]]);

//     // Predict
//     const prediction = model.predict(input);
//     const probability = (await prediction.data())[0];
    
//     input.dispose();
//     prediction.dispose();

//     const isWeak = probability > 0.5;
//     const confidence = Math.abs(probability - 0.5) * 2; // Convert to 0-1 scale

//     const reasons = [];
//     if (avgScore < 0.5) reasons.push('Low average score');
//     if (attendanceRate < 0.7) reasons.push('Poor attendance');
//     if (lateRate > 0.2) reasons.push('Frequent late arrivals');
//     if (examCount < 3) reasons.push('Insufficient exam data');

//     return {
//       isWeak,
//       confidence,
//       probability,
//       reasons
//     };
//   } catch (error) {
//     console.error('Error identifying weak students:', error);
//     // Fallback to rule-based approach
//     return fallbackIdentification(data);
//   }
// };

// // Fallback rule-based identification
// const fallbackIdentification = (data) => {
//   const { academicRecords, attendanceRecords } = data;

//   const scores = academicRecords.map(r => (r.score || 0) / (r.max_score || 100));
//   const avgScore = scores.length > 0 
//     ? scores.reduce((a, b) => a + b, 0) / scores.length 
//     : 0;

//   const presentCount = attendanceRecords.filter(r => r.status === 'present').length;
//   const totalDays = attendanceRecords.length;
//   const attendanceRate = totalDays > 0 ? presentCount / totalDays : 0;

//   const isWeak = avgScore < 0.5 || attendanceRate < 0.7;
//   const confidence = isWeak ? 0.8 : 0.2;

//   const reasons = [];
//   if (avgScore < 0.5) reasons.push('Low average score');
//   if (attendanceRate < 0.7) reasons.push('Poor attendance');

//   return { isWeak, confidence, reasons };
// };

// // Initialize model on module load
// initializeModel();

// module.exports = {
//   initializeModel,
//   trainModel,
//   identifyWeakStudents
// };

let tf;
try {
  tf = require('@tensorflow/tfjs-node');
} catch (error) {
  console.warn('TensorFlow.js Node.js bindings not available, using CPU backend');
  tf = require('@tensorflow/tfjs');
}

const db = require('../config/database');
const { getThresholds } = require('./thresholdCalculator');

let model = null;

// Initialize and train the academic model
const initializeModel = async () => {
  try {
    // Load or create model
    model = tf.sequential({
      layers: [
        tf.layers.dense({ inputShape: [5], units: 64, activation: 'relu' }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ units: 32, activation: 'relu' }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ units: 16, activation: 'relu' }),
        tf.layers.dense({ units: 1, activation: 'sigmoid' })
      ]
    });

    model.compile({
      optimizer: 'adam',
      loss: 'binaryCrossentropy',
      metrics: ['accuracy']
    });

    console.log('Academic model initialized');
  } catch (error) {
    console.error('Error initializing academic model:', error);
  }
};

// Train the model from database data
const trainModel = async () => {
  try {
    // Get dynamic thresholds from historical data
    const thresholds = await getThresholds();
    console.log('Using dynamic thresholds for training:', thresholds);

    // Get all academic and attendance data
    const academicData = await db.query(`
      SELECT 
        s.id as student_id,
        AVG(ar.score / NULLIF(ar.max_score, 0)) as avg_score,
        COUNT(ar.id) as exam_count,
        COUNT(DISTINCT ar.subject) as subject_count
      FROM students s
      LEFT JOIN academic_records ar ON s.id = ar.student_id
      GROUP BY s.id
    `);

    const attendanceData = await db.query(`
      SELECT 
        student_id,
        COUNT(*) FILTER (WHERE status = 'present') as present_count,
        COUNT(*) FILTER (WHERE status = 'absent') as absent_count,
        COUNT(*) FILTER (WHERE status = 'late') as late_count,
        COUNT(*) as total_days
      FROM attendance_records
      GROUP BY student_id
    `);

    // Get weak students (labeled data)
    const weakStudents = await db.query(`
      SELECT DISTINCT student_id 
      FROM weak_students
    `);

    const weakStudentIds = new Set(weakStudents.rows.map(r => r.student_id));

    // If no labeled weak students, use rule-based labeling with dynamic thresholds
    const useRuleBasedLabeling = weakStudentIds.size === 0;
    if (useRuleBasedLabeling) {
      console.log('No labeled weak students found. Using rule-based labeling with dynamic thresholds...');
    }

    // Prepare training data
    const features = [];
    const labels = [];

    for (const academic of academicData.rows) {
      const attendance = attendanceData.rows.find(a => a.student_id === academic.student_id);
      
      if (!attendance) continue;

      // Ensure all values are numbers (PostgreSQL may return strings)
      const avgScore = parseFloat(academic.avg_score) || 0;
      const presentCount = parseFloat(attendance.present_count) || 0;
      const totalDays = parseFloat(attendance.total_days) || 0;
      const lateCount = parseFloat(attendance.late_count) || 0;
      const examCount = parseFloat(academic.exam_count) || 0;
      const subjectCount = parseFloat(academic.subject_count) || 0;

      const attendanceRate = totalDays > 0 ? presentCount / totalDays : 0;
      const lateRate = totalDays > 0 ? lateCount / totalDays : 0;

      // Ensure all feature values are numbers
      const featureArray = [
        Number(avgScore) || 0,
        Number(attendanceRate) || 0,
        Number(examCount) / 10, // Normalize
        Number(subjectCount) / 5, // Normalize
        Number(lateRate) || 0
      ];

      // Validate all values are finite numbers
      if (featureArray.every(val => typeof val === 'number' && isFinite(val))) {
        features.push(featureArray);
        
        // Determine label: use existing labels or rule-based with DYNAMIC THRESHOLDS
        let label = 0;
        if (useRuleBasedLabeling) {
          // Rule-based using dynamic thresholds from historical data
          label = (
            avgScore < thresholds.academic.criticalScoreThreshold || 
            attendanceRate < thresholds.attendance.highRiskThreshold
          ) ? 1 : 0;
        } else {
          label = weakStudentIds.has(academic.student_id) ? 1 : 0;
        }
        
        labels.push(label);
      } else {
        console.warn('Skipping invalid feature values:', featureArray);
      }
    }

    if (features.length === 0) {
      console.log('No training data available');
      return;
    }

    console.log(`Preparing to train with ${features.length} samples...`);
    console.log('Sample features:', features[0]);
    console.log('Sample labels:', labels.slice(0, 5));

    // Ensure all values are numbers and create tensors
    const numericFeatures = features.map(f => f.map(v => Number(v) || 0));
    const numericLabels = labels.map(l => Number(l) || 0);

    const xs = tf.tensor2d(numericFeatures);
    const ys = tf.tensor2d(numericLabels, [numericLabels.length, 1]);

    // Train the model
    await model.fit(xs, ys, {
      epochs: 50,
      batchSize: 32,
      validationSplit: 0.2,
      callbacks: {
        onEpochEnd: (epoch, logs) => {
          const loss = logs.loss ? logs.loss.toFixed(4) : 'N/A';
          const acc = (logs.acc || logs.accuracy) ? (logs.acc || logs.accuracy).toFixed(4) : 'N/A';
          const valLoss = logs.val_loss ? logs.val_loss.toFixed(4) : 'N/A';
          const valAcc = (logs.val_acc || logs.val_accuracy) ? (logs.val_acc || logs.val_accuracy).toFixed(4) : 'N/A';
          console.log(`Epoch ${epoch + 1}: loss = ${loss}, acc = ${acc}, val_loss = ${valLoss}, val_acc = ${valAcc}`);
        }
      }
    });

    xs.dispose();
    ys.dispose();

    console.log('Academic model trained successfully with dynamic thresholds');
  } catch (error) {
    console.error('Error training academic model:', error);
  }
};

// Identify weak students using the model
const identifyWeakStudents = async (data) => {
  try {
    if (!model) {
      await initializeModel();
    }

    // Get dynamic thresholds
    const thresholds = await getThresholds();

    const { academicRecords, attendanceRecords } = data;

    // Calculate features
    const scores = academicRecords.map(r => (r.score || 0) / (r.max_score || 100));
    const avgScore = scores.length > 0 
      ? scores.reduce((a, b) => a + b, 0) / scores.length 
      : 0;

    const presentCount = attendanceRecords.filter(r => r.status === 'present').length;
    const totalDays = attendanceRecords.length;
    const attendanceRate = totalDays > 0 ? presentCount / totalDays : 0;

    const examCount = academicRecords.length;
    const subjectCount = new Set(academicRecords.map(r => r.subject)).size;
    const lateCount = attendanceRecords.filter(r => r.status === 'late').length;
    const lateRate = totalDays > 0 ? lateCount / totalDays : 0;

    // Prepare input
    const input = tf.tensor2d([[
      avgScore,
      attendanceRate,
      examCount / 10,
      subjectCount / 5,
      lateRate
    ]]);

    // Predict
    const prediction = model.predict(input);
    const probability = (await prediction.data())[0];
    
    input.dispose();
    prediction.dispose();

    const isWeak = probability > 0.5;
    const confidence = Math.abs(probability - 0.5) * 2; // Convert to 0-1 scale

    // Build reasons based on DYNAMIC THRESHOLDS
    const reasons = [];
    if (avgScore < thresholds.academic.lowScoreThreshold) {
      reasons.push(`Low average score (${(avgScore * 100).toFixed(1)}% vs threshold ${(thresholds.academic.lowScoreThreshold * 100).toFixed(1)}%)`);
    }
    if (attendanceRate < thresholds.attendance.mediumRiskThreshold) {
      reasons.push(`Poor attendance (${(attendanceRate * 100).toFixed(1)}% vs threshold ${(thresholds.attendance.mediumRiskThreshold * 100).toFixed(1)}%)`);
    }
    if (lateRate > 0.2) {
      reasons.push('Frequent late arrivals');
    }
    if (examCount < 3) {
      reasons.push('Insufficient exam data');
    }

    return {
      isWeak,
      confidence,
      probability,
      reasons,
      thresholds: thresholds.academic // Include thresholds used for transparency
    };
  } catch (error) {
    console.error('Error identifying weak students:', error);
    // Fallback to rule-based approach
    return fallbackIdentification(data);
  }
};

// Fallback rule-based identification with dynamic thresholds
const fallbackIdentification = async (data) => {
  const thresholds = await getThresholds();
  const { academicRecords, attendanceRecords } = data;

  const scores = academicRecords.map(r => (r.score || 0) / (r.max_score || 100));
  const avgScore = scores.length > 0 
    ? scores.reduce((a, b) => a + b, 0) / scores.length 
    : 0;

  const presentCount = attendanceRecords.filter(r => r.status === 'present').length;
  const totalDays = attendanceRecords.length;
  const attendanceRate = totalDays > 0 ? presentCount / totalDays : 0;

  // Use dynamic thresholds instead of hardcoded values
  const isWeak = avgScore < thresholds.academic.lowScoreThreshold || 
                 attendanceRate < thresholds.attendance.mediumRiskThreshold;
  const confidence = isWeak ? 0.8 : 0.2;

  const reasons = [];
  if (avgScore < thresholds.academic.lowScoreThreshold) {
    reasons.push(`Low average score (${(avgScore * 100).toFixed(1)}% vs threshold ${(thresholds.academic.lowScoreThreshold * 100).toFixed(1)}%)`);
  }
  if (attendanceRate < thresholds.attendance.mediumRiskThreshold) {
    reasons.push(`Poor attendance (${(attendanceRate * 100).toFixed(1)}% vs threshold ${(thresholds.attendance.mediumRiskThreshold * 100).toFixed(1)}%)`);
  }

  return { 
    isWeak, 
    confidence, 
    reasons,
    thresholds: thresholds.academic
  };
};

// Initialize model on module load
initializeModel();

module.exports = {
  initializeModel,
  trainModel,
  identifyWeakStudents
};