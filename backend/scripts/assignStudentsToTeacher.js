const db = require('../config/database');

const assignStudentsToTeacher = async () => {
  try {
    console.log('🔗 Assigning students to teacher classes...\n');

    // Get all teachers
    const teachers = await db.query('SELECT id, name, email FROM teachers');
    
    if (teachers.rows.length === 0) {
      console.log('⚠ No teachers found. Please create a teacher account first.');
      process.exit(1);
    }

    console.log(`Found ${teachers.rows.length} teacher(s)\n`);

    for (const teacher of teachers.rows) {
      console.log(`Processing teacher: ${teacher.name} (${teacher.email})`);

      // Get teacher's class
      const classResult = await db.query(
        'SELECT id, name FROM classes WHERE teacher_id = $1 LIMIT 1',
        [teacher.id]
      );

      if (classResult.rows.length === 0) {
        console.log(`  ⚠ No class assigned. Creating a default class...`);
        
        // Create a default class for this teacher
        const newClass = await db.query(
          'INSERT INTO classes (name, grade, teacher_id) VALUES ($1, $2, $3) RETURNING id, name',
          ['Grade 1', 1, teacher.id]
        );
        
        const classId = newClass.rows[0].id;
        console.log(`  ✓ Created class: ${newClass.rows[0].name} (ID: ${classId})`);
        
        // Assign all unassigned students to this class
        const unassignedStudents = await db.query(
          'SELECT id, name, student_id FROM students WHERE class_id IS NULL LIMIT 50'
        );

        if (unassignedStudents.rows.length > 0) {
          for (const student of unassignedStudents.rows) {
            await db.query(
              'UPDATE students SET class_id = $1 WHERE id = $2',
              [classId, student.id]
            );
          }
          console.log(`  ✓ Assigned ${unassignedStudents.rows.length} unassigned students to this class`);
        }

        // Also assign students from other classes if this teacher has no students
        const studentsInClass = await db.query(
          'SELECT COUNT(*) as count FROM students WHERE class_id = $1',
          [classId]
        );

        if (parseInt(studentsInClass.rows[0].count) === 0) {
          // Move some students from other classes
          const studentsToMove = await db.query(
            'SELECT id, name, student_id FROM students WHERE class_id IS NOT NULL LIMIT 20'
          );

          if (studentsToMove.rows.length > 0) {
            for (const student of studentsToMove.rows) {
              await db.query(
                'UPDATE students SET class_id = $1 WHERE id = $2',
                [classId, student.id]
              );
            }
            console.log(`  ✓ Moved ${studentsToMove.rows.length} students to this class`);
          }
        }
      } else {
        const classId = classResult.rows[0].id;
        const className = classResult.rows[0].name;
        console.log(`  ✓ Found class: ${className} (ID: ${classId})`);

        // Count students in this class
        const studentCount = await db.query(
          'SELECT COUNT(*) as count FROM students WHERE class_id = $1',
          [classId]
        );
        console.log(`  📊 Current students in class: ${studentCount.rows[0].count}`);

        // Assign unassigned students to this class
        const unassignedStudents = await db.query(
          'SELECT id, name, student_id FROM students WHERE class_id IS NULL LIMIT 50'
        );

        if (unassignedStudents.rows.length > 0) {
          for (const student of unassignedStudents.rows) {
            await db.query(
              'UPDATE students SET class_id = $1 WHERE id = $2',
              [classId, student.id]
            );
          }
          console.log(`  ✓ Assigned ${unassignedStudents.rows.length} unassigned students to this class`);
        }
      }

      console.log('');
    }

    // Final summary
    const totalStudents = await db.query('SELECT COUNT(*) as count FROM students');
    const assignedStudents = await db.query('SELECT COUNT(*) as count FROM students WHERE class_id IS NOT NULL');
    const unassignedStudents = await db.query('SELECT COUNT(*) as count FROM students WHERE class_id IS NULL');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Summary:');
    console.log(`   Total Students: ${totalStudents.rows[0].count}`);
    console.log(`   Assigned to Classes: ${assignedStudents.rows[0].count}`);
    console.log(`   Unassigned: ${unassignedStudents.rows[0].count}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (parseInt(unassignedStudents.rows[0].count) > 0) {
      console.log('⚠ Some students are still unassigned. You may need to:');
      console.log('   1. Create more classes');
      console.log('   2. Manually assign students through the admin interface');
    }

    console.log('✅ Assignment complete!\n');
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Failed to assign students:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
};

assignStudentsToTeacher();

