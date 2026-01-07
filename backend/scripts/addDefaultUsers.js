const db = require('../config/database');
const bcrypt = require('bcryptjs');

const addDefaultUsers = async () => {
  try {
    console.log('🔐 Adding default login credentials...\n');

    // Default credentials
    const adminEmail = 'admin@school.local';
    const adminPassword = 'admin123';
    const adminName = 'School Administrator';
    
    const teacherEmail = 'test@teacher.com';
    const teacherPassword = 'password123';
    const teacherName = 'Test Teacher';

    // 1. Create or get a default school
    let schoolResult = await db.query(
      'SELECT id FROM schools WHERE registration_number = $1',
      ['DEFAULT001']
    );
    
    let schoolId;
    if (schoolResult.rows.length === 0) {
      const newSchool = await db.query(
        `INSERT INTO schools (name, registration_number, address, email, principal_name)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        ['Default Primary School', 'DEFAULT001', '123 School Street', 'info@school.com', 'Principal Name']
      );
      schoolId = newSchool.rows[0].id;
      console.log('✓ Created default school');
    } else {
      schoolId = schoolResult.rows[0].id;
      console.log('✓ Using existing default school');
    }

    // 2. Create or update admin account
    const adminPasswordHash = await bcrypt.hash(adminPassword, 10);
    let adminResult = await db.query(
      'SELECT id FROM school_administrators WHERE email = $1',
      [adminEmail]
    );

    if (adminResult.rows.length === 0) {
      await db.query(
        `INSERT INTO school_administrators (school_id, name, email, password_hash)
         VALUES ($1, $2, $3, $4)`,
        [schoolId, adminName, adminEmail, adminPasswordHash]
      );
      console.log('✓ Created admin account');
    } else {
      // Update password if admin exists
      await db.query(
        'UPDATE school_administrators SET password_hash = $1 WHERE email = $2',
        [adminPasswordHash, adminEmail]
      );
      console.log('✓ Updated admin password');
    }

    // 3. Create or update teacher account
    const teacherPasswordHash = await bcrypt.hash(teacherPassword, 10);
    let teacherResult = await db.query(
      'SELECT id FROM teachers WHERE email = $1',
      [teacherEmail]
    );

    if (teacherResult.rows.length === 0) {
      await db.query(
        `INSERT INTO teachers (school_id, name, email, password_hash, role)
         VALUES ($1, $2, $3, $4, $5)`,
        [schoolId, teacherName, teacherEmail, teacherPasswordHash, 'teacher']
      );
      console.log('✓ Created teacher account');
    } else {
      // Update password if teacher exists
      await db.query(
        'UPDATE teachers SET password_hash = $1, school_id = $2 WHERE email = $3',
        [teacherPasswordHash, schoolId, teacherEmail]
      );
      console.log('✓ Updated teacher password');
    }

    // 4. Create a class for the teacher (so they can see students)
    teacherResult = await db.query('SELECT id FROM teachers WHERE email = $1', [teacherEmail]);
    const teacherId = teacherResult.rows[0].id;

    const classResult = await db.query(
      'SELECT id FROM classes WHERE teacher_id = $1 LIMIT 1',
      [teacherId]
    );

    if (classResult.rows.length === 0) {
      await db.query(
        'INSERT INTO classes (name, grade, teacher_id) VALUES ($1, $2, $3)',
        ['Grade 1', 1, teacherId]
      );
      console.log('✓ Created default class (Grade 1) for teacher');
    } else {
      console.log('✓ Teacher already has a class assigned');
    }

    console.log('\n✅ Default login credentials created successfully!\n');
    console.log('📋 Login Credentials:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('👨‍💼 School Administrator:');
    console.log(`   Email: ${adminEmail}`);
    console.log(`   Password: ${adminPassword}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('👨‍🏫 Teacher:');
    console.log(`   Email: ${teacherEmail}`);
    console.log(`   Password: ${teacherPassword}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    process.exit(0);
  } catch (error) {
    console.error('\n✗ Failed to add default users:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
};

addDefaultUsers();

