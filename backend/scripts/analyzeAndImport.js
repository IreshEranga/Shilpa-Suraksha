const XLSX = require('xlsx');
const db = require('../config/database');
const path = require('path');
const fs = require('fs');

// Analyze Excel file structure
const analyzeFile = (filePath) => {
  try {
    const workbook = XLSX.readFile(filePath);
    console.log(`\n📊 Analyzing: ${path.basename(filePath)}`);
    console.log(`   Sheets: ${workbook.SheetNames.join(', ')}`);
    
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { defval: null });
    
    if (data.length > 0) {
      console.log(`   Rows: ${data.length}`);
      console.log(`   Columns: ${Object.keys(data[0]).join(', ')}`);
      console.log(`   Sample row:`, JSON.stringify(data[0], null, 2).substring(0, 200));
    }
    
    return { workbook, sheetName, worksheet, data };
  } catch (error) {
    console.error(`Error analyzing ${filePath}:`, error.message);
    return null;
  }
};

// Find column name variations
const findColumn = (row, possibleNames) => {
  const keys = Object.keys(row);
  for (const name of possibleNames) {
    // Exact match
    if (keys.includes(name)) return name;
    // Case insensitive
    const found = keys.find(k => k.toLowerCase() === name.toLowerCase());
    if (found) return found;
    // Partial match
    const partial = keys.find(k => k.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(k.toLowerCase()));
    if (partial) return partial;
  }
  return null;
};

// Import Dataset.xlsx
const importDataset = async (filePath) => {
  try {
    const analysis = analyzeFile(filePath);
    if (!analysis) return;

    const { data } = analysis;
    console.log(`\n📥 Importing from Dataset.xlsx...`);

    let imported = 0;
    let skipped = 0;
    const studentsMap = new Map(); // Track students we've seen

    for (const row of data) {
      // Try to find student ID column
      const studentIdCol = findColumn(row, [
        'Student ID', 'student_id', 'StudentID', 'ID', 'id', 
        'Student Number', 'student_number', 'StudentNo', 'Roll No', 'RollNo'
      ]);
      
      // Try to find name column
      const nameCol = findColumn(row, [
        'Name', 'name', 'Student Name', 'student_name', 'StudentName',
        'Full Name', 'full_name', 'FullName'
      ]);

      // Try to find subject column
      const subjectCol = findColumn(row, [
        'Subject', 'subject', 'Subject Name', 'subject_name'
      ]);

      // Try to find score columns
      const scoreCol = findColumn(row, [
        'Score', 'score', 'Marks', 'marks', 'Grade', 'grade', 'Points', 'points'
      ]);
      
      const maxScoreCol = findColumn(row, [
        'Max Score', 'max_score', 'MaxScore', 'Total', 'total', 'Max Marks', 'max_marks'
      ]);

      const examTypeCol = findColumn(row, [
        'Exam Type', 'exam_type', 'ExamType', 'Type', 'type', 'Test Type', 'test_type'
      ]);

      const examDateCol = findColumn(row, [
        'Exam Date', 'exam_date', 'ExamDate', 'Date', 'date', 'Test Date', 'test_date'
      ]);

      // Get values
      const studentId = studentIdCol ? String(row[studentIdCol] || '').trim() : null;
      const name = nameCol ? String(row[nameCol] || '').trim() : null;
      const subject = subjectCol ? String(row[subjectCol] || '').trim() : null;
      const score = scoreCol ? parseFloat(row[scoreCol]) || 0 : null;
      const maxScore = maxScoreCol ? parseFloat(row[maxScoreCol]) || 100 : 100;
      const examType = examTypeCol ? String(row[examTypeCol] || '').trim() : 'General';
      const examDate = examDateCol ? String(row[examDateCol] || '').trim() : new Date().toISOString().split('T')[0];

      if (!studentId) {
        skipped++;
        continue;
      }

      // Create or get student
      let studentDbId;
      if (!studentsMap.has(studentId)) {
        // Check if student exists
        let studentResult = await db.query(
          'SELECT id FROM students WHERE student_id = $1',
          [studentId]
        );

        if (studentResult.rows.length === 0) {
          // Create student (assign to first available class)
          const defaultClass = await db.query('SELECT id FROM classes LIMIT 1');
          const classId = defaultClass.rows.length > 0 ? defaultClass.rows[0].id : null;

          if (!classId) {
            console.error(`  ✗ Cannot create student ${studentId}: No classes available`);
            skipped++;
            continue;
          }

          const newStudent = await db.query(
            'INSERT INTO students (name, student_id, class_id) VALUES ($1, $2, $3) RETURNING id',
            [name || `Student ${studentId}`, studentId, classId]
          );
          studentDbId = newStudent.rows[0].id;
          console.log(`  ✓ Created student: ${name || studentId} (${studentId})`);
        } else {
          studentDbId = studentResult.rows[0].id;
        }
        studentsMap.set(studentId, studentDbId);
      } else {
        studentDbId = studentsMap.get(studentId);
      }

      // Insert academic record if we have subject and score
      if (subject && score !== null) {
        try {
          await db.query(
            `INSERT INTO academic_records (student_id, subject, score, max_score, exam_type, exam_date)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [studentDbId, subject, score, maxScore, examType, examDate]
          );
          imported++;
        } catch (error) {
          // Check if it's a duplicate (same student, subject, exam_date)
          if (error.message.includes('duplicate') || error.message.includes('unique')) {
            // Skip duplicates silently
            continue;
          } else {
            console.error(`  ✗ Error inserting record for ${studentId}:`, error.message);
          }
        }
      }
    }

    console.log(`✓ Imported ${imported} academic records`);
    console.log(`  Skipped ${skipped} rows (missing student ID)`);
  } catch (error) {
    console.error('Error importing Dataset.xlsx:', error);
  }
};

// Import Student_Score.xlsx
const importStudentScore = async (filePath) => {
  try {
    const analysis = analyzeFile(filePath);
    if (!analysis) return;

    const { data } = analysis;
    console.log(`\n📥 Importing from Student_Score.xlsx...`);

    let imported = 0;
    let skipped = 0;
    const studentsMap = new Map();

    for (const row of data) {
      // Find columns (same logic as Dataset)
      const studentIdCol = findColumn(row, [
        'Student ID', 'student_id', 'StudentID', 'ID', 'id',
        'Student Number', 'student_number', 'StudentNo', 'Roll No', 'RollNo'
      ]);
      
      const nameCol = findColumn(row, [
        'Name', 'name', 'Student Name', 'student_name', 'StudentName'
      ]);

      // This file might have multiple subject columns or a different structure
      // Let's check all columns for potential scores
      const allColumns = Object.keys(row);
      const subjectColumns = allColumns.filter(col => {
        const lower = col.toLowerCase();
        return !['student id', 'id', 'name', 'student name', 'date', 'exam', 'type'].some(exclude => 
          lower.includes(exclude)
        );
      });

      const studentId = studentIdCol ? String(row[studentIdCol] || '').trim() : null;
      const name = nameCol ? String(row[nameCol] || '').trim() : null;

      if (!studentId) {
        skipped++;
        continue;
      }

      // Create or get student
      let studentDbId;
      if (!studentsMap.has(studentId)) {
        let studentResult = await db.query(
          'SELECT id FROM students WHERE student_id = $1',
          [studentId]
        );

        if (studentResult.rows.length === 0) {
          const defaultClass = await db.query('SELECT id FROM classes LIMIT 1');
          const classId = defaultClass.rows.length > 0 ? defaultClass.rows[0].id : null;

          if (!classId) {
            console.error(`  ✗ Cannot create student ${studentId}: No classes available`);
            skipped++;
            continue;
          }

          const newStudent = await db.query(
            'INSERT INTO students (name, student_id, class_id) VALUES ($1, $2, $3) RETURNING id',
            [name || `Student ${studentId}`, studentId, classId]
          );
          studentDbId = newStudent.rows[0].id;
          console.log(`  ✓ Created student: ${name || studentId} (${studentId})`);
        } else {
          studentDbId = studentResult.rows[0].id;
        }
        studentsMap.set(studentId, studentDbId);
      } else {
        studentDbId = studentsMap.get(studentId);
      }

      // Import each subject column as a separate academic record
      for (const col of subjectColumns) {
        const value = row[col];
        if (value !== null && value !== undefined && value !== '') {
          const score = parseFloat(value);
          if (!isNaN(score) && score >= 0) {
            try {
              await db.query(
                `INSERT INTO academic_records (student_id, subject, score, max_score, exam_type, exam_date)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [studentDbId, col, score, 100, 'General', new Date().toISOString().split('T')[0]]
              );
              imported++;
            } catch (error) {
              // Skip duplicates silently
              if (error.message.includes('duplicate') || error.message.includes('unique')) {
                continue;
              } else {
                console.error(`  ✗ Error inserting record for ${studentId} in ${col}:`, error.message);
              }
            }
          }
        }
      }
    }

    console.log(`✓ Imported ${imported} academic records from Student_Score.xlsx`);
    console.log(`  Skipped ${skipped} rows (missing student ID)`);
  } catch (error) {
    console.error('Error importing Student_Score.xlsx:', error);
  }
};

// Main import function
const main = async () => {
  try {
    console.log('🔍 Analyzing Academic Dataset files...\n');

    const datasetPath = path.join(__dirname, '../../Academic Dataset/Dataset.xlsx');
    const scorePath = path.join(__dirname, '../../Academic Dataset/Student_Score.xlsx');

    // Check if we have at least one class (required for student import)
    const classes = await db.query('SELECT id FROM classes LIMIT 1');
    if (classes.rows.length === 0) {
      console.error('\n✗ Error: No classes found in database!');
      console.error('   Please create at least one class before importing data.');
      console.error('   You can do this by:');
      console.error('   1. Logging in as a teacher/admin');
      console.error('   2. Creating a class through the UI');
      console.error('   3. Or manually creating a class in the database');
      process.exit(1);
    }

    // Import Dataset.xlsx
    if (fs.existsSync(datasetPath)) {
      await importDataset(datasetPath);
    } else {
      console.log(`⚠ File not found: ${datasetPath}`);
    }

    // Import Student_Score.xlsx
    if (fs.existsSync(scorePath)) {
      await importStudentScore(scorePath);
    } else {
      console.log(`⚠ File not found: ${scorePath}`);
    }

    // Summary
    const studentCount = await db.query('SELECT COUNT(*) FROM students');
    const recordCount = await db.query('SELECT COUNT(*) FROM academic_records');
    
    console.log('\n✅ Import Complete!');
    console.log(`   Students: ${studentCount.rows[0].count}`);
    console.log(`   Academic Records: ${recordCount.rows[0].count}`);

    process.exit(0);
  } catch (error) {
    console.error('\n✗ Import failed:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  main();
}

module.exports = { importDataset, importStudentScore, analyzeFile };

