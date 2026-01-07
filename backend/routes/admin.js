const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const db = require('../config/database');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const { sendCredentialsEmail } = require('../services/emailService');

// All routes require admin authentication
router.use(authenticate);
router.use(requireAdmin);

// Get admin dashboard data
router.get('/dashboard', async (req, res) => {
  try {
    const schoolId = req.schoolId;

    // Get statistics
    const teachersCount = await db.query(
      'SELECT COUNT(*) as count FROM teachers WHERE school_id = $1',
      [schoolId]
    );

    const studentsCount = await db.query(
      `SELECT COUNT(*) as count FROM students s
       JOIN classes c ON s.class_id = c.id
       JOIN teachers t ON c.teacher_id = t.id
       WHERE t.school_id = $1`,
      [schoolId]
    );

    const classesCount = await db.query(
      `SELECT COUNT(*) as count FROM classes c
       JOIN teachers t ON c.teacher_id = t.id
       WHERE t.school_id = $1`,
      [schoolId]
    );

    // Get recent teachers
    const recentTeachers = await db.query(
      `SELECT t.id, t.name, t.email, t.credentials_sent, c.name as class_name, c.grade
       FROM teachers t
       LEFT JOIN classes c ON c.teacher_id = t.id
       WHERE t.school_id = $1
       ORDER BY t.created_at DESC
       LIMIT 10`,
      [schoolId]
    );

    res.json({
      statistics: {
        teachers: parseInt(teachersCount.rows[0].count),
        students: parseInt(studentsCount.rows[0].count),
        classes: parseInt(classesCount.rows[0].count)
      },
      recentTeachers: recentTeachers.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get school profile
router.get('/school-profile', async (req, res) => {
  try {
    const schoolId = req.schoolId;

    const result = await db.query(
      'SELECT * FROM schools WHERE id = $1',
      [schoolId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'School not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update school profile
router.put('/school-profile', async (req, res) => {
  try {
    const schoolId = req.schoolId;
    const { name, address, phone, email, principal_name } = req.body;

    const result = await db.query(
      `UPDATE schools 
       SET name = COALESCE($1, name),
           address = COALESCE($2, address),
           phone = COALESCE($3, phone),
           email = COALESCE($4, email),
           principal_name = COALESCE($5, principal_name)
       WHERE id = $6
       RETURNING *`,
      [name, address, phone, email, principal_name, schoolId]
    );

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all teachers
router.get('/teachers', async (req, res) => {
  try {
    const schoolId = req.schoolId;

    const result = await db.query(
      `SELECT t.*, c.name as class_name, c.grade, c.id as class_id,
              CASE 
                WHEN t.email_verified = true THEN 'verified'
                WHEN t.credentials_sent = true AND t.credentials_sent_at IS NOT NULL THEN 'sent'
                WHEN t.credentials_sent = true THEN 'sent'
                ELSE 'pending'
              END as status
       FROM teachers t
       LEFT JOIN classes c ON c.teacher_id = t.id
       WHERE t.school_id = $1
       ORDER BY t.created_at DESC`,
      [schoolId]
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create teacher with auto-generated credentials
router.post('/teachers', async (req, res) => {
  try {
    const schoolId = req.schoolId;
    const { name, email, class_id, grade } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    // Check if email exists
    const existing = await db.query(
      'SELECT id FROM teachers WHERE email = $1',
      [email]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Teacher email already exists' });
    }

    // Generate temporary password
    const tempPassword = crypto.randomBytes(8).toString('base64').slice(0, 12);
    const hashedPassword = await bcrypt.hash(tempPassword, 10);
    
    // Generate email verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // Create teacher
    const teacherResult = await db.query(
      `INSERT INTO teachers (school_id, name, email, password_hash, temp_password, credentials_sent, 
        email_verification_token, email_verified, credentials_sent_at)
       VALUES ($1, $2, $3, $4, $5, false, $6, false, NULL)
       RETURNING id, name, email, created_at`,
      [schoolId, name, email, hashedPassword, tempPassword, verificationToken]
    );

    const teacher = teacherResult.rows[0];

    // Assign to class if provided
    if (class_id) {
      await db.query(
        'UPDATE classes SET teacher_id = $1 WHERE id = $2',
        [teacher.id, class_id]
      );
    } else if (grade) {
      // Create new class for this teacher
      const classResult = await db.query(
        'INSERT INTO classes (name, grade, teacher_id) VALUES ($1, $2, $3) RETURNING id',
        [`Grade ${grade}`, grade, teacher.id]
      );
    }

    // Send credentials email with verification link
    const school = await db.query('SELECT name FROM schools WHERE id = $1', [schoolId]);
    const schoolName = school.rows[0]?.name || 'School';
    
    const emailResult = await sendCredentialsEmail(email, name, tempPassword, schoolName, verificationToken);

    // Update credentials_sent flag and timestamp
    await db.query(
      `UPDATE teachers 
       SET credentials_sent = $1, 
           credentials_sent_at = CASE WHEN $1 THEN CURRENT_TIMESTAMP ELSE NULL END
       WHERE id = $2`,
      [emailResult.success && !emailResult.skipped, teacher.id]
    );

    res.status(201).json({
      message: 'Teacher created successfully',
      teacher: {
        ...teacher,
        temp_password: tempPassword // Only returned on creation
      }
    });
  } catch (error) {
    if (error.code === '23505') {
      res.status(400).json({ error: 'Email already exists' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Update teacher
router.put('/teachers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const schoolId = req.schoolId;
    const { name, email, class_id, grade } = req.body;

    // Verify teacher belongs to school
    const teacherCheck = await db.query(
      'SELECT id FROM teachers WHERE id = $1 AND school_id = $2',
      [id, schoolId]
    );

    if (teacherCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Teacher not found' });
    }

    // Update teacher
    const result = await db.query(
      `UPDATE teachers 
       SET name = COALESCE($1, name),
           email = COALESCE($2, email)
       WHERE id = $3 AND school_id = $4
       RETURNING id, name, email`,
      [name, email, id, schoolId]
    );

    // Handle class assignment or grade creation
    if (class_id !== undefined || grade !== undefined) {
      // Remove from old class first
      await db.query(
        'UPDATE classes SET teacher_id = NULL WHERE teacher_id = $1',
        [id]
      );

      // If class_id is provided, assign to that existing class
      if (class_id) {
        // Verify class exists and belongs to school
        const classCheck = await db.query(
          `SELECT c.id FROM classes c
           LEFT JOIN teachers t ON c.teacher_id = t.id
           WHERE c.id = $1 AND (t.school_id = $2 OR c.teacher_id IS NULL)`,
          [class_id, schoolId]
        );

        if (classCheck.rows.length === 0) {
          return res.status(404).json({ error: 'Class not found' });
        }

        await db.query(
          'UPDATE classes SET teacher_id = $1 WHERE id = $2',
          [id, class_id]
        );
      } 
      // If grade is provided (and no class_id), create a new class
      else if (grade) {
        // Check if teacher already has a class with this grade
        const existingClass = await db.query(
          'SELECT id FROM classes WHERE teacher_id = $1 AND grade = $2',
          [id, grade]
        );

        if (existingClass.rows.length > 0) {
          // Use existing class
          await db.query(
            'UPDATE classes SET teacher_id = $1 WHERE id = $2',
            [id, existingClass.rows[0].id]
          );
        } else {
          // Create new class
          await db.query(
            'INSERT INTO classes (name, grade, teacher_id) VALUES ($1, $2, $3) RETURNING id',
            [`Grade ${grade}`, grade, id]
          );
        }
      }
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Resend credentials email
router.post('/teachers/:id/resend-credentials', async (req, res) => {
  try {
    const { id } = req.params;
    const schoolId = req.schoolId;

    // Verify teacher belongs to school
    const teacherCheck = await db.query(
      'SELECT id, name, email, temp_password, email_verification_token FROM teachers WHERE id = $1 AND school_id = $2',
      [id, schoolId]
    );

    if (teacherCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Teacher not found' });
    }

    const teacher = teacherCheck.rows[0];

    // Generate new verification token if needed
    let verificationToken = teacher.email_verification_token;
    if (!verificationToken) {
      verificationToken = crypto.randomBytes(32).toString('hex');
      await db.query(
        'UPDATE teachers SET email_verification_token = $1 WHERE id = $2',
        [verificationToken, id]
      );
    }

    // Get school name
    const school = await db.query('SELECT name FROM schools WHERE id = $1', [schoolId]);
    const schoolName = school.rows[0]?.name || 'School';

    // Send credentials email
    const emailResult = await sendCredentialsEmail(
      teacher.email, 
      teacher.name, 
      teacher.temp_password || 'Please contact administrator for password',
      schoolName,
      verificationToken
    );

    if (emailResult.success && !emailResult.skipped) {
      // Update credentials_sent flag and timestamp
      await db.query(
        `UPDATE teachers 
         SET credentials_sent = true, 
             credentials_sent_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [id]
      );

      res.json({ 
        message: 'Credentials email sent successfully',
        email_sent: true
      });
    } else if (emailResult.skipped) {
      res.json({ 
        message: 'Email service not configured. Credentials logged to console.',
        email_sent: false,
        credentials: {
          email: teacher.email,
          password: teacher.temp_password
        }
      });
    } else {
      res.status(500).json({ 
        error: 'Failed to send email',
        details: emailResult.error
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Verify teacher email
router.post('/teachers/verify-email', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Verification token is required' });
    }

    const result = await db.query(
      'SELECT id, name, email FROM teachers WHERE email_verification_token = $1',
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired verification token' });
    }

    const teacher = result.rows[0];

    // Mark email as verified
    await db.query(
      'UPDATE teachers SET email_verified = true, email_verification_token = NULL WHERE id = $1',
      [teacher.id]
    );

    res.json({ 
      message: 'Email verified successfully',
      teacher: {
        id: teacher.id,
        name: teacher.name,
        email: teacher.email
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete teacher
router.delete('/teachers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const schoolId = req.schoolId;

    // Verify teacher belongs to school
    const teacherCheck = await db.query(
      'SELECT id FROM teachers WHERE id = $1 AND school_id = $2',
      [id, schoolId]
    );

    if (teacherCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Teacher not found' });
    }

    await db.query('DELETE FROM teachers WHERE id = $1', [id]);

    res.json({ message: 'Teacher deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all students (including unassigned)
router.get('/students', async (req, res) => {
  try {
    const schoolId = req.schoolId;

    // Get students from classes assigned to teachers in this school, plus unassigned students
    const result = await db.query(
      `SELECT s.*, c.name as class_name, c.grade, c.id as class_id, t.name as teacher_name, t.id as teacher_id
       FROM students s
       LEFT JOIN classes c ON s.class_id = c.id
       LEFT JOIN teachers t ON c.teacher_id = t.id
       WHERE t.school_id = $1 OR s.class_id IS NULL OR (s.class_id IS NOT NULL AND t.id IS NULL)
       ORDER BY s.created_at DESC`,
      [schoolId]
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bulk assign students to a class
router.post('/students/assign', async (req, res) => {
  try {
    const schoolId = req.schoolId;
    const { student_ids, class_id } = req.body;

    if (!student_ids || !Array.isArray(student_ids) || student_ids.length === 0) {
      return res.status(400).json({ error: 'Student IDs array is required' });
    }

    if (!class_id) {
      return res.status(400).json({ error: 'Class ID is required' });
    }

    // Verify class belongs to a teacher from this school
    const classCheck = await db.query(
      `SELECT c.id FROM classes c
       LEFT JOIN teachers t ON c.teacher_id = t.id
       WHERE c.id = $1 AND (t.school_id = $2 OR c.teacher_id IS NULL)`,
      [class_id, schoolId]
    );

    if (classCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Class not found or does not belong to your school' });
    }

    // Update students
    const result = await db.query(
      `UPDATE students 
       SET class_id = $1 
       WHERE id = ANY($2::int[])
       RETURNING id, name, student_id`,
      [class_id, student_ids]
    );

    res.json({
      message: `Successfully assigned ${result.rows.length} student(s) to class`,
      assigned: result.rows.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload students from Excel file
// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const upload = multer({ 
  dest: uploadsDir,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.xlsx' || ext === '.xls' || ext === '.csv') {
      cb(null, true);
    } else {
      cb(new Error('Only Excel (.xlsx, .xls) and CSV files are allowed'));
    }
  }
});

router.post('/students/upload', (req, res, next) => {
  // Handle multer errors
  upload.single('file')(req, res, (err) => {
    if (err) {
      console.error('Multer error:', err);
      return res.status(400).json({ error: err.message || 'File upload error' });
    }
    next();
  });
}, async (req, res) => {
  try {
    const schoolId = req.schoolId;
    
    if (!schoolId) {
      return res.status(401).json({ error: 'Unauthorized: School ID not found' });
    }

    const { class_id } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Please select a file.' });
    }

    console.log('File uploaded:', req.file.originalname, 'Size:', req.file.size);

    // Helper function to find or create class by grade
    const findOrCreateClassByGrade = async (gradeNum) => {
      if (!gradeNum || isNaN(gradeNum)) return null;
      
      const grade = parseInt(gradeNum);
      if (grade < 1 || grade > 13) return null;

      // First, try to find existing class with this grade (prefer unassigned or from this school)
      let classResult = await db.query(
        `SELECT c.id FROM classes c
         LEFT JOIN teachers t ON c.teacher_id = t.id
         WHERE c.grade = $1 AND (t.school_id = $2 OR c.teacher_id IS NULL)
         ORDER BY c.teacher_id NULLS FIRST
         LIMIT 1`,
        [grade, schoolId]
      );

      if (classResult.rows.length > 0) {
        return classResult.rows[0].id;
      }

      // If no class exists, create one
      const newClass = await db.query(
        'INSERT INTO classes (name, grade, teacher_id) VALUES ($1, $2, NULL) RETURNING id',
        [`Grade ${grade}`, grade]
      );

      return newClass.rows[0].id;
    };

    // If class_id is provided, use it (manual override)
    let targetClassId = class_id ? parseInt(class_id) : null;
    if (targetClassId) {
      const classCheck = await db.query(
        `SELECT c.id FROM classes c
         LEFT JOIN teachers t ON c.teacher_id = t.id
         WHERE c.id = $1 AND (t.school_id = $2 OR c.teacher_id IS NULL)`,
        [targetClassId, schoolId]
      );

      if (classCheck.rows.length === 0) {
        // Clean up uploaded file
        fs.unlinkSync(req.file.path);
        return res.status(404).json({ error: 'Class not found' });
      }
    }
    // If no class_id provided, we'll use grade from Excel to assign students

    // Read Excel file
    if (!fs.existsSync(req.file.path)) {
      return res.status(400).json({ error: 'Uploaded file not found' });
    }

    let workbook;
    try {
      workbook = XLSX.readFile(req.file.path);
    } catch (xlsxError) {
      console.error('XLSX read error:', xlsxError);
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ error: 'Invalid Excel file. Please check the file format.' });
    }

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ error: 'Excel file has no sheets' });
    }

    // Try to find the best sheet (prefer 'DataSet', 'Data', or 'Sheet1')
    let sheetName = workbook.SheetNames.find(s => 
      s.toLowerCase() === 'dataset' || 
      s.toLowerCase() === 'data set' ||
      s.toLowerCase().includes('data')
    ) || workbook.SheetNames.find(s => 
      s.toLowerCase().includes('sheet')
    ) || workbook.SheetNames[0];
    
    console.log(`Using sheet: "${sheetName}" (Available: ${workbook.SheetNames.join(', ')})`);
    
    const worksheet = workbook.Sheets[sheetName];
    
    // Try with header row detection (skip empty rows)
    let data = XLSX.utils.sheet_to_json(worksheet, { 
      defval: null,
      raw: false,
      header: 1 // Get raw data first to find header row
    });

    // Find the actual header row (first row with meaningful data)
    let headerRowIndex = 0;
    for (let i = 0; i < Math.min(10, data.length); i++) {
      const row = data[i];
      if (row && Array.isArray(row)) {
        const hasText = row.some(cell => cell && String(cell).trim().length > 0);
        if (hasText) {
          headerRowIndex = i;
          break;
        }
      }
    }

    // Now parse with the correct header row
    data = XLSX.utils.sheet_to_json(worksheet, { 
      defval: null,
      range: headerRowIndex,
      raw: false
    });

    // Clean up empty rows and rows with only empty values
    data = data.filter(row => {
      const values = Object.values(row);
      return values.some(val => val !== null && val !== undefined && String(val).trim().length > 0);
    });

    if (!data || data.length === 0) {
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ error: 'Excel file is empty or has no data rows' });
    }

    console.log(`Processing ${data.length} rows from sheet "${sheetName}"`);
    console.log('Sample columns:', Object.keys(data[0] || {}).slice(0, 10));

    // Helper function to find column (more flexible)
    const findColumn = (row, possibleNames) => {
      const keys = Object.keys(row);
      for (const name of possibleNames) {
        // Exact match
        if (keys.includes(name)) return name;
        // Case insensitive exact match
        const exactMatch = keys.find(k => k.toLowerCase() === name.toLowerCase());
        if (exactMatch) return exactMatch;
        // Partial match (contains)
        const partialMatch = keys.find(k => 
          k.toLowerCase().includes(name.toLowerCase()) || 
          name.toLowerCase().includes(k.toLowerCase())
        );
        if (partialMatch) return partialMatch;
        // Match after trimming and cleaning
        const cleanedMatch = keys.find(k => 
          k.trim().toLowerCase() === name.trim().toLowerCase() ||
          k.trim().toLowerCase().replace(/\s+/g, ' ') === name.trim().toLowerCase().replace(/\s+/g, ' ')
        );
        if (cleanedMatch) return cleanedMatch;
      }
      return null;
    };

    let imported = 0;
    let skipped = 0;
    const errors = [];

    for (const row of data) {
      try {
        const studentIdCol = findColumn(row, [
          'Student ID', 'student_id', 'StudentID', 'ID', 'id', 'No.', 'No', 'Number',
          'Student Number', 'student_number', 'StudentNo', 'Roll No', 'RollNo', 'Roll Number'
        ]);
        
        const nameCol = findColumn(row, [
          'Name', 'name', 'Student Name', 'student_name', 'StudentName',
          'Full Name', 'full_name', 'FullName', 'Personal'
        ]);

        const gradeCol = findColumn(row, [
          'Grade', 'grade', 'Class Grade', 'class_grade', 'Level', 'level'
        ]);

        // Try to get student ID - could be in "No." column or similar
        let studentId = null;
        if (studentIdCol) {
          const value = row[studentIdCol];
          if (value !== null && value !== undefined) {
            studentId = String(value).trim();
            // If it's a number, convert to string
            if (!isNaN(value) && isFinite(value)) {
              studentId = String(parseInt(value));
            }
          }
        }
        
        // If no student ID found, try using row index as ID (last resort)
        if (!studentId || studentId === '' || studentId === 'null' || studentId === 'undefined') {
          // Try to use name as identifier if available
          if (nameCol && row[nameCol]) {
            const nameValue = String(row[nameCol] || '').trim();
            if (nameValue) {
              // Use a hash of name or row number
              studentId = `STU${imported + skipped + 1}`;
            } else {
              skipped++;
              continue;
            }
          } else {
            skipped++;
            continue;
          }
        }
        
        const name = nameCol ? String(row[nameCol] || '').trim() : null;

        // Get grade from Excel row
        let studentGrade = null;
        if (gradeCol) {
          const gradeValue = row[gradeCol];
          if (gradeValue !== null && gradeValue !== undefined) {
            const gradeStr = String(gradeValue).trim();
            // Try to extract number from grade (e.g., "Grade 1" -> 1, "1" -> 1)
            const gradeMatch = gradeStr.match(/\d+/);
            if (gradeMatch) {
              studentGrade = parseInt(gradeMatch[0]);
            } else if (!isNaN(gradeStr) && isFinite(gradeStr)) {
              studentGrade = parseInt(gradeStr);
            }
          }
        }

        // Determine which class to assign student to
        let assignedClassId = targetClassId; // Use manually selected class if provided
        
        // If no manual class selected, use grade from Excel
        if (!assignedClassId && studentGrade) {
          assignedClassId = await findOrCreateClassByGrade(studentGrade);
        }

        // If still no class, try to get default class
        if (!assignedClassId) {
          const defaultClass = await db.query(
            `SELECT c.id FROM classes c
             LEFT JOIN teachers t ON c.teacher_id = t.id
             WHERE t.school_id = $1 OR c.teacher_id IS NULL
             LIMIT 1`,
            [schoolId]
          );
          if (defaultClass.rows.length > 0) {
            assignedClassId = defaultClass.rows[0].id;
          }
        }

        // Check if student already exists
        const existing = await db.query(
          'SELECT id FROM students WHERE student_id = $1',
          [studentId]
        );

        if (existing.rows.length > 0) {
          // Update class assignment
          if (assignedClassId) {
            await db.query(
              'UPDATE students SET class_id = $1 WHERE id = $2',
              [assignedClassId, existing.rows[0].id]
            );
            imported++;
          } else {
            skipped++;
          }
          continue;
        }

        // Create new student
        if (!assignedClassId) {
          errors.push(`Student ${studentId}: No class available for assignment (Grade: ${studentGrade || 'N/A'})`);
          skipped++;
          continue;
        }

        await db.query(
          'INSERT INTO students (name, student_id, class_id) VALUES ($1, $2, $3)',
          [name || `Student ${studentId}`, studentId, assignedClassId]
        );
        imported++;
      } catch (error) {
        errors.push(`Row error: ${error.message}`);
        skipped++;
      }
    }

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json({
      message: `Import complete: ${imported} imported, ${skipped} skipped`,
      imported,
      skipped,
      errors: errors.slice(0, 10) // Limit error messages
    });
  } catch (error) {
    console.error('Error uploading students:', error);
    // Clean up uploaded file on error
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Error cleaning up file:', unlinkError);
      }
    }
    res.status(500).json({ 
      error: error.message || 'Failed to upload students',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get all classes
router.get('/classes', async (req, res) => {
  try {
    const schoolId = req.schoolId;

    // Get all classes where:
    // 1. The class has a teacher assigned AND that teacher belongs to this school
    // 2. OR the class has no teacher assigned (unassigned classes)
    const result = await db.query(
      `SELECT c.*, t.name as teacher_name, t.email as teacher_email, t.id as teacher_id,
              (SELECT COUNT(*) FROM students WHERE class_id = c.id) as student_count
       FROM classes c
       LEFT JOIN teachers t ON c.teacher_id = t.id
       WHERE (t.school_id = $1) OR (c.teacher_id IS NULL)
       ORDER BY c.grade, c.name`,
      [schoolId]
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create class
router.post('/classes', async (req, res) => {
  try {
    const schoolId = req.schoolId;
    
    if (!schoolId) {
      return res.status(401).json({ error: 'Unauthorized: School ID not found' });
    }

    const { name, grade, teacher_id } = req.body;

    if (!name || !grade) {
      return res.status(400).json({ error: 'Name and grade are required' });
    }

    // If teacher_id is provided, verify teacher belongs to school
    if (teacher_id) {
      const teacherCheck = await db.query(
        'SELECT id FROM teachers WHERE id = $1 AND school_id = $2',
        [teacher_id, schoolId]
      );

      if (teacherCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Teacher not found or does not belong to your school' });
      }
    }

    const result = await db.query(
      'INSERT INTO classes (name, grade, teacher_id) VALUES ($1, $2, $3) RETURNING *',
      [name, parseInt(grade), teacher_id || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating class:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update class (assign teacher, change name/grade)
router.put('/classes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const schoolId = req.schoolId;
    const { name, grade, teacher_id } = req.body;

    // Verify class belongs to a teacher from this school
    const classCheck = await db.query(
      `SELECT c.id FROM classes c
       LEFT JOIN teachers t ON c.teacher_id = t.id
       WHERE c.id = $1 AND (t.school_id = $2 OR c.teacher_id IS NULL)`,
      [id, schoolId]
    );

    if (classCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Class not found' });
    }

    // If teacher_id is provided, verify teacher belongs to school
    if (teacher_id !== undefined) {
      if (teacher_id) {
        const teacherCheck = await db.query(
          'SELECT id FROM teachers WHERE id = $1 AND school_id = $2',
          [teacher_id, schoolId]
        );

        if (teacherCheck.rows.length === 0) {
          return res.status(400).json({ error: 'Teacher not found or does not belong to your school' });
        }
      }
    }

    const result = await db.query(
      `UPDATE classes 
       SET name = COALESCE($1, name),
           grade = COALESCE($2, grade),
           teacher_id = $3
       WHERE id = $4
       RETURNING *`,
      [name, grade, teacher_id !== undefined ? teacher_id : null, id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete class
router.delete('/classes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const schoolId = req.schoolId;

    // Verify class belongs to a teacher from this school
    const classCheck = await db.query(
      `SELECT c.id FROM classes c
       LEFT JOIN teachers t ON c.teacher_id = t.id
       WHERE c.id = $1 AND (t.school_id = $2 OR c.teacher_id IS NULL)`,
      [id, schoolId]
    );

    if (classCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Class not found' });
    }

    await db.query('DELETE FROM classes WHERE id = $1', [id]);

    res.json({ message: 'Class deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get statistics
router.get('/statistics', async (req, res) => {
  try {
    const schoolId = req.schoolId;

    const stats = await db.query(
      `SELECT 
        (SELECT COUNT(*) FROM teachers WHERE school_id = $1) as total_teachers,
        (SELECT COUNT(*) FROM classes c JOIN teachers t ON c.teacher_id = t.id WHERE t.school_id = $1) as total_classes,
        (SELECT COUNT(*) FROM students s JOIN classes c ON s.class_id = c.id JOIN teachers t ON c.teacher_id = t.id WHERE t.school_id = $1) as total_students,
        (SELECT COUNT(*) FROM at_risk_students ars JOIN students s ON ars.student_id = s.id JOIN classes c ON s.class_id = c.id JOIN teachers t ON c.teacher_id = t.id WHERE t.school_id = $1) as at_risk_students`,
      [schoolId]
    );

    res.json(stats.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

