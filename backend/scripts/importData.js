const XLSX = require('xlsx');
const db = require('../config/database');
const path = require('path');
const fs = require('fs');

// Import academic data from Excel
const importAcademicData = async (filePath) => {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    console.log(`Importing ${data.length} records from ${filePath}...`);

    for (const row of data) {
      // Adjust column names based on your Excel structure
      const studentId = row['Student ID'] || row['student_id'] || row['StudentID'];
      const subject = row['Subject'] || row['subject'];
      const score = parseFloat(row['Score'] || row['score'] || 0);
      const maxScore = parseFloat(row['Max Score'] || row['max_score'] || row['MaxScore'] || 100);
      const examType = row['Exam Type'] || row['exam_type'] || row['ExamType'] || 'General';
      const examDate = row['Exam Date'] || row['exam_date'] || row['ExamDate'] || new Date().toISOString().split('T')[0];

      if (!studentId || !subject) {
        console.log('Skipping row with missing data:', row);
        continue;
      }

      // Get student ID from database
      const studentResult = await db.query(
        'SELECT id FROM students WHERE student_id = $1',
        [studentId.toString()]
      );

      if (studentResult.rows.length === 0) {
        console.log(`Student ${studentId} not found, skipping...`);
        continue;
      }

      const dbStudentId = studentResult.rows[0].id;

      // Insert academic record
      await db.query(
        `INSERT INTO academic_records (student_id, subject, score, max_score, exam_type, exam_date)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING`,
        [dbStudentId, subject, score, maxScore, examType, examDate]
      );
    }

    console.log('Academic data imported successfully!');
  } catch (error) {
    console.error('Error importing academic data:', error);
    throw error;
  }
};

// Import attendance data (if available in Excel)
const importAttendanceData = async (filePath) => {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    console.log(`Importing ${data.length} attendance records...`);

    for (const row of data) {
      const studentId = row['Student ID'] || row['student_id'] || row['StudentID'];
      const date = row['Date'] || row['date'] || new Date().toISOString().split('T')[0];
      const status = (row['Status'] || row['status'] || 'present').toLowerCase();

      if (!studentId || !date) {
        continue;
      }

      const studentResult = await db.query(
        'SELECT id FROM students WHERE student_id = $1',
        [studentId.toString()]
      );

      if (studentResult.rows.length === 0) {
        continue;
      }

      const dbStudentId = studentResult.rows[0].id;

      await db.query(
        `INSERT INTO attendance_records (student_id, date, status)
         VALUES ($1, $2, $3)
         ON CONFLICT (student_id, date) DO UPDATE SET status = $3`,
        [dbStudentId, date, status]
      );
    }

    console.log('Attendance data imported successfully!');
  } catch (error) {
    console.error('Error importing attendance data:', error);
    throw error;
  }
};

// Main import function
const main = async () => {
  try {
    const academicFilePath = path.join(__dirname, '../../Academic Dataset/Dataset.xlsx');
    const scoreFilePath = path.join(__dirname, '../../Academic Dataset/Student_Score.xlsx');

    if (fs.existsSync(academicFilePath)) {
      await importAcademicData(academicFilePath);
    } else {
      console.log('Academic dataset file not found at:', academicFilePath);
    }

    if (fs.existsSync(scoreFilePath)) {
      await importAcademicData(scoreFilePath);
    } else {
      console.log('Student score file not found at:', scoreFilePath);
    }

    console.log('Data import complete!');
    process.exit(0);
  } catch (error) {
    console.error('Import failed:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  main();
}

module.exports = { importAcademicData, importAttendanceData };

