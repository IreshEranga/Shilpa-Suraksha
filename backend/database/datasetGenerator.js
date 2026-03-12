const db = require('../config/database');

/**
 * Generate meaningful datasets that achieve all risk types:
 * - Low risk students (performing well)
 * - Academic risk (poor grades)
 * - Attendance risk (poor attendance)
 * - Behavioral risk (negative behaviors)
 * - Combined risk (multiple factors)
 * - Critical risk (all factors severe)
 */

// Helper to generate random date in past N days
const randomDate = (daysBack) => {
  const date = new Date();
  date.setDate(date.getDate() - Math.floor(Math.random() * daysBack));
  return date.toISOString().split('T')[0];
};

// Helper to generate random element from array
const randomChoice = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Generate student profiles for different risk types
const generateStudentProfiles = (classId) => {
  return [
    // 1. LOW RISK STUDENTS (10 students) - Performing well in all areas
    ...Array(10).fill(null).map((_, i) => ({
      name: `Excellence Student ${i + 1}`,
      student_id: `EXC${String(i + 1).padStart(3, '0')}`,
      class_id: classId,
      grade: 10,
      date_of_birth: '2009-06-15',
      gender: i % 2 === 0 ? 'Male' : 'Female',
      riskType: 'low',
      academicPattern: 'excellent', // 80-95%
      attendancePattern: 'excellent', // 95-100%
      behaviorPattern: 'positive' // mostly positive behaviors
    })),

    // 2. ACADEMIC RISK ONLY (8 students) - Poor grades but good attendance/behavior
    ...Array(8).fill(null).map((_, i) => ({
      name: `Academic Struggle ${i + 1}`,
      student_id: `ACD${String(i + 1).padStart(3, '0')}`,
      class_id: classId,
      grade: 10,
      date_of_birth: '2009-07-20',
      gender: i % 2 === 0 ? 'Male' : 'Female',
      riskType: 'academic',
      academicPattern: 'poor', // 30-45%
      attendancePattern: 'good', // 85-95%
      behaviorPattern: 'neutral' // neutral behaviors
    })),

    // 3. ATTENDANCE RISK ONLY (8 students) - Poor attendance but decent grades/behavior
    ...Array(8).fill(null).map((_, i) => ({
      name: `Attendance Issue ${i + 1}`,
      student_id: `ATT${String(i + 1).padStart(3, '0')}`,
      class_id: classId,
      grade: 10,
      date_of_birth: '2009-08-10',
      gender: i % 2 === 0 ? 'Male' : 'Female',
      riskType: 'attendance',
      academicPattern: 'average', // 60-70%
      attendancePattern: 'poor', // 50-65%
      behaviorPattern: 'neutral'
    })),

    // 4. BEHAVIORAL RISK ONLY (8 students) - Behavioral issues but ok grades/attendance
    ...Array(8).fill(null).map((_, i) => ({
      name: `Behavior Challenge ${i + 1}`,
      student_id: `BEH${String(i + 1).padStart(3, '0')}`,
      class_id: classId,
      grade: 10,
      date_of_birth: '2009-09-05',
      gender: i % 2 === 0 ? 'Male' : 'Female',
      riskType: 'behavioral',
      academicPattern: 'average', // 60-75%
      attendancePattern: 'good', // 80-90%
      behaviorPattern: 'negative' // frequent negative behaviors
    })),

    // 5. ACADEMIC + ATTENDANCE (6 students) - Combined risk
    ...Array(6).fill(null).map((_, i) => ({
      name: `Academic-Attendance Risk ${i + 1}`,
      student_id: `AAR${String(i + 1).padStart(3, '0')}`,
      class_id: classId,
      grade: 10,
      date_of_birth: '2009-10-12',
      gender: i % 2 === 0 ? 'Male' : 'Female',
      riskType: 'combined',
      academicPattern: 'poor', // 35-50%
      attendancePattern: 'poor', // 55-70%
      behaviorPattern: 'neutral'
    })),

    // 6. ACADEMIC + BEHAVIORAL (6 students) - Combined risk
    ...Array(6).fill(null).map((_, i) => ({
      name: `Academic-Behavior Risk ${i + 1}`,
      student_id: `ABR${String(i + 1).padStart(3, '0')}`,
      class_id: classId,
      grade: 10,
      date_of_birth: '2009-11-18',
      gender: i % 2 === 0 ? 'Male' : 'Female',
      riskType: 'combined',
      academicPattern: 'poor', // 30-45%
      attendancePattern: 'good', // 80-90%
      behaviorPattern: 'negative'
    })),

    // 7. ATTENDANCE + BEHAVIORAL (6 students) - Combined risk
    ...Array(6).fill(null).map((_, i) => ({
      name: `Attendance-Behavior Risk ${i + 1}`,
      student_id: `ATB${String(i + 1).padStart(3, '0')}`,
      class_id: classId,
      grade: 10,
      date_of_birth: '2009-12-25',
      gender: i % 2 === 0 ? 'Male' : 'Female',
      riskType: 'combined',
      academicPattern: 'average', // 60-70%
      attendancePattern: 'poor', // 50-65%
      behaviorPattern: 'negative'
    })),

    // 8. CRITICAL RISK (4 students) - All factors severely at risk
    ...Array(4).fill(null).map((_, i) => ({
      name: `Critical Risk ${i + 1}`,
      student_id: `CRT${String(i + 1).padStart(3, '0')}`,
      class_id: classId,
      grade: 10,
      date_of_birth: '2010-01-30',
      gender: i % 2 === 0 ? 'Male' : 'Female',
      riskType: 'critical',
      academicPattern: 'failing', // 15-35%
      attendancePattern: 'critical', // 30-50%
      behaviorPattern: 'severe' // severe behavioral issues
    })),

    // 9. BORDERLINE CASES (4 students) - Just below thresholds
    ...Array(4).fill(null).map((_, i) => ({
      name: `Borderline Student ${i + 1}`,
      student_id: `BRD${String(i + 1).padStart(3, '0')}`,
      class_id: classId,
      grade: 10,
      date_of_birth: '2010-02-14',
      gender: i % 2 === 0 ? 'Male' : 'Female',
      riskType: 'borderline',
      academicPattern: 'borderline', // 48-52%
      attendancePattern: 'borderline', // 72-78%
      behaviorPattern: 'mixed' // mix of positive and negative
    }))
  ];
};

// Generate academic records based on pattern
const generateAcademicRecords = (studentId, pattern) => {
  const subjects = ['Mathematics', 'Science', 'English', 'History', 'Geography'];
  const records = [];

  const scoreRanges = {
    excellent: { min: 80, max: 95 },
    good: { min: 70, max: 85 },
    average: { min: 60, max: 75 },
    borderline: { min: 48, max: 55 },
    poor: { min: 30, max: 48 },
    failing: { min: 15, max: 35 }
  };

  const range = scoreRanges[pattern] || scoreRanges.average;

  subjects.forEach(subject => {
    // Generate 3-5 exam records per subject
    const examCount = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < examCount; i++) {
      const score = range.min + Math.random() * (range.max - range.min);
      const maxScore = 100;
      const examType = randomChoice(['Midterm', 'Final', 'Quiz', 'Assignment']);
      
      records.push({
        student_id: studentId,
        subject,
        exam_type: examType,
        score: Math.round(score),
        max_score: maxScore,
        exam_date: randomDate(90)
      });
    }
  });

  return records;
};

// Generate attendance records based on pattern
const generateAttendanceRecords = (studentId, pattern, days = 60) => {
  const records = [];
  
  const attendanceRates = {
    excellent: 0.97,
    good: 0.87,
    average: 0.77,
    borderline: 0.73,
    poor: 0.58,
    critical: 0.40
  };

  const rate = attendanceRates[pattern] || 0.85;
  
  for (let i = 0; i < days; i++) {
    const rand = Math.random();
    let status;
    
    if (rand < rate) {
      status = 'present';
    } else if (rand < rate + (1 - rate) * 0.3) {
      status = 'late';
    } else {
      status = 'absent';
    }

    records.push({
      student_id: studentId,
      date: randomDate(days),
      status
    });
  }

  return records;
};

// Generate behavioral records based on pattern
const generateBehavioralRecords = (studentId, pattern) => {
  const records = [];

  const positiveActivities = [
    { activity: 'Class Participation', type: 'positive', severity: 'low', notes: 'Helped classmate with homework' },
    { activity: 'Volunteering', type: 'positive', severity: 'low', notes: 'Volunteered to clean classroom' },
    { activity: 'Academic Achievement', type: 'positive', severity: 'low', notes: 'Excellent participation in group discussion' },
    { activity: 'Leadership', type: 'positive', severity: 'medium', notes: 'Demonstrated leadership in group work' },
    { activity: 'Competition', type: 'positive', severity: 'high', notes: 'Won academic competition representing class' }
  ];

  const negativeActivities = [
    { activity: 'Disruption', type: 'negative', severity: 'low', notes: 'Talking during class time' },
    { activity: 'Tardiness', type: 'negative', severity: 'low', notes: 'Late to class multiple times this week' },
    { activity: 'Incomplete Work', type: 'negative', severity: 'medium', notes: 'Incomplete homework assignments' },
    { activity: 'Classroom Behavior', type: 'negative', severity: 'medium', notes: 'Disruptive behavior during lesson' },
    { activity: 'Disrespect', type: 'negative', severity: 'high', notes: 'Disrespectful language to teacher' },
    { activity: 'Conflict', type: 'negative', severity: 'high', notes: 'Physical altercation with classmate' },
    { activity: 'Academic Integrity', type: 'negative', severity: 'high', notes: 'Caught cheating on examination' }
  ];

  const patterns = {
    positive: { count: 8, positiveRatio: 0.95 },
    neutral: { count: 5, positiveRatio: 0.50 },
    mixed: { count: 8, positiveRatio: 0.55 },
    negative: { count: 10, positiveRatio: 0.20 },
    severe: { count: 12, positiveRatio: 0.10 }
  };

  const config = patterns[pattern] || patterns.neutral;

  for (let i = 0; i < config.count; i++) {
    const isPositive = Math.random() < config.positiveRatio;
    const activity = isPositive 
      ? randomChoice(positiveActivities)
      : randomChoice(negativeActivities);

    // For severe pattern, increase high severity incidents
    let severity = activity.severity;
    if (pattern === 'severe' && activity.type === 'negative' && Math.random() > 0.5) {
      severity = 'high';
    }

    records.push({
      student_id: studentId,
      behavior_type: activity.type,
      activity: activity.activity,  // This becomes 'category'
      severity: severity,
      observation_date: randomDate(90),
      notes: activity.notes  // This becomes 'description'
    });
  }

  return records;
};

// Main function to generate all data
const generateMeaningfulDataset = async () => {
  const client = await db.pool.connect();
  
  try {
    await client.query('BEGIN');

    console.log('🎲 Starting meaningful dataset generation...');

    // 1. Get or create a school
    let schoolResult = await client.query('SELECT id FROM schools LIMIT 1');
    let schoolId;

    if (schoolResult.rows.length === 0) {
      const newSchool = await client.query(
        `INSERT INTO schools (name, registration_number, address, phone, email, principal_name)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        ['Demo Primary School', 'SCH001', '123 Education Street', '0112345678', 'school@demo.com', 'Principal Demo']
      );
      schoolId = newSchool.rows[0].id;
      console.log('✓ Created new school');
    } else {
      schoolId = schoolResult.rows[0].id;
      console.log('✓ Using existing school');
    }

    // 2. Get or create a teacher
    let teacherResult = await client.query('SELECT id FROM teachers LIMIT 1');
    let teacherId;

    if (teacherResult.rows.length === 0) {
      const bcrypt = require('bcrypt');
      const hashedPassword = await bcrypt.hash('teacher123', 10);
      
      const newTeacher = await client.query(
        `INSERT INTO teachers (school_id, name, email, password_hash, role)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [schoolId, 'Dataset Teacher', 'dataset.teacher@demo.com', hashedPassword, 'teacher']
      );
      teacherId = newTeacher.rows[0].id;
      console.log('✓ Created new teacher (email: dataset.teacher@demo.com, password: teacher123)');
    } else {
      teacherId = teacherResult.rows[0].id;
      console.log('✓ Using existing teacher');
    }

    // 3. Get or create a class
    let classResult = await client.query('SELECT id FROM classes WHERE teacher_id = $1 LIMIT 1', [teacherId]);
    let classId;

    if (classResult.rows.length === 0) {
      const newClass = await client.query(
        `INSERT INTO classes (name, grade, teacher_id)
         VALUES ($1, $2, $3)
         RETURNING id`,
        ['Class 10-A', 10, teacherId]
      );
      classId = newClass.rows[0].id;
      console.log('✓ Created new class');
    } else {
      classId = classResult.rows[0].id;
      console.log('✓ Using existing class');
    }

    // 4. Generate student profiles
    const profiles = generateStudentProfiles(classId);
    console.log(`✓ Generated ${profiles.length} student profiles`);

    const riskCounts = {};
    let totalAcademic = 0;
    let totalAttendance = 0;
    let totalBehavioral = 0;

    // 5. Get teacher ID for behavioral records
    const teacherForBehavior = await client.query('SELECT id FROM teachers LIMIT 1');
    const teacherIdForRecords = teacherForBehavior.rows[0]?.id || teacherId;

    // 6. Insert students and generate their records
    for (const profile of profiles) {
      // Insert student (no 'grade' column in students table)
      const studentResult = await client.query(
        `INSERT INTO students (name, student_id, class_id, date_of_birth, gender)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [profile.name, profile.student_id, profile.class_id, profile.date_of_birth, profile.gender]
      );
      const studentDbId = studentResult.rows[0].id;

      // Track risk types
      riskCounts[profile.riskType] = (riskCounts[profile.riskType] || 0) + 1;

      // Generate academic records
      const academicRecords = generateAcademicRecords(studentDbId, profile.academicPattern);
      for (const record of academicRecords) {
        await client.query(
          `INSERT INTO academic_records (student_id, subject, exam_type, score, max_score, exam_date)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [record.student_id, record.subject, record.exam_type, record.score, record.max_score, record.exam_date]
        );
      }
      totalAcademic += academicRecords.length;

      // Generate attendance records
      const attendanceRecords = generateAttendanceRecords(studentDbId, profile.attendancePattern);
      for (const record of attendanceRecords) {
        await client.query(
          `INSERT INTO attendance_records (student_id, date, status)
           VALUES ($1, $2, $3)
           ON CONFLICT (student_id, date) DO NOTHING`,
          [record.student_id, record.date, record.status]
        );
      }
      totalAttendance += attendanceRecords.length;

      // Generate behavioral records
      const behavioralRecords = generateBehavioralRecords(studentDbId, profile.behaviorPattern);
      for (const record of behavioralRecords) {
        await client.query(
          `INSERT INTO behavioral_records (student_id, teacher_id, behavior_type, description, category, severity, observation_date)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [record.student_id, teacherIdForRecords, record.behavior_type, record.notes, record.activity, record.severity, record.observation_date]
        );
      }
      totalBehavioral += behavioralRecords.length;

      // Label weak students for training
      if (['academic', 'combined', 'critical'].includes(profile.riskType)) {
        await client.query(
          `INSERT INTO weak_students (student_id, teacher_id, weak_subject, weak_section, identified_by_model, confidence_score)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (student_id, teacher_id) DO NOTHING`,
          [studentDbId, teacherIdForRecords, 'Mathematics', 'Algebra', 'academic', 0.85]
        );
      }
    }

    await client.query('COMMIT');

    console.log('\n🎉 Dataset generation completed!');
    console.log('\n📊 Summary:');
    console.log(`Total Students: ${profiles.length}`);
    console.log(`Academic Records: ${totalAcademic}`);
    console.log(`Attendance Records: ${totalAttendance}`);
    console.log(`Behavioral Records: ${totalBehavioral}`);
    
    console.log('\n🎯 Risk Type Distribution:');
    Object.entries(riskCounts).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
      console.log(`  ${type.padEnd(15)}: ${count} students`);
    });

    console.log('\n✅ Ready for analysis! You can now:');
    console.log('  1. Run Early Warning Analysis');
    console.log('  2. Train ML models');
    console.log('  3. View at-risk students in Guidance Page');

    return {
      success: true,
      students: profiles.length,
      academicRecords: totalAcademic,
      attendanceRecords: totalAttendance,
      behavioralRecords: totalBehavioral,
      riskDistribution: riskCounts
    };

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error generating dataset:', error);
    throw error;
  } finally {
    client.release();
  }
};

module.exports = { generateMeaningfulDataset };