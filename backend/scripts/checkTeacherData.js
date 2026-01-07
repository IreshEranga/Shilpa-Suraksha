const db = require('../config/database');

const checkTeacherData = async () => {
  try {
    console.log('🔍 Checking teacher data and student assignments...\n');

    // 1. Check teachers
    const teachers = await db.query('SELECT id, name, email, school_id FROM teachers');
    console.log(`📋 Found ${teachers.rows.length} teacher(s):`);
    teachers.rows.forEach(t => {
      console.log(`   - ${t.name} (${t.email}) - ID: ${t.id}`);
    });
    console.log('');

    // 2. Check classes
    const classes = await db.query('SELECT id, name, grade, teacher_id FROM classes');
    console.log(`📚 Found ${classes.rows.length} class(es):`);
    classes.rows.forEach(c => {
      const teacher = teachers.rows.find(t => t.id === c.teacher_id);
      console.log(`   - ${c.name} (Grade ${c.grade}) - ID: ${c.id} - Teacher: ${teacher ? teacher.name : 'NONE'}`);
    });
    console.log('');

    // 3. Check students
    const students = await db.query('SELECT id, name, student_id, class_id FROM students');
    console.log(`👥 Found ${students.rows.length} student(s):`);
    
    const studentsByClass = {};
    const unassignedStudents = [];
    
    students.rows.forEach(s => {
      if (s.class_id) {
        if (!studentsByClass[s.class_id]) {
          studentsByClass[s.class_id] = [];
        }
        studentsByClass[s.class_id].push(s);
      } else {
        unassignedStudents.push(s);
      }
    });

    classes.rows.forEach(c => {
      const classStudents = studentsByClass[c.id] || [];
      console.log(`   ${c.name}: ${classStudents.length} students`);
      if (classStudents.length > 0) {
        classStudents.slice(0, 5).forEach(s => {
          console.log(`      - ${s.name} (${s.student_id})`);
        });
        if (classStudents.length > 5) {
          console.log(`      ... and ${classStudents.length - 5} more`);
        }
      }
    });

    if (unassignedStudents.length > 0) {
      console.log(`\n   ⚠ Unassigned students: ${unassignedStudents.length}`);
      unassignedStudents.slice(0, 5).forEach(s => {
        console.log(`      - ${s.name} (${s.student_id})`);
      });
    }
    console.log('');

    // 4. Check specific teacher (test@teacher.com)
    const testTeacher = teachers.rows.find(t => t.email === 'test@teacher.com');
    if (testTeacher) {
      console.log(`🎯 Checking teacher: ${testTeacher.name} (${testTeacher.email})`);
      
      const teacherClass = classes.rows.find(c => c.teacher_id === testTeacher.id);
      if (teacherClass) {
        console.log(`   ✓ Has class: ${teacherClass.name} (ID: ${teacherClass.id})`);
        
        const teacherStudents = studentsByClass[teacherClass.id] || [];
        console.log(`   📊 Students in class: ${teacherStudents.length}`);
        
        if (teacherStudents.length === 0) {
          console.log(`   ⚠ No students in this class!`);
          console.log(`   💡 Fix: Run "npm run assign-students" to assign students`);
        } else {
          console.log(`   ✓ Students visible to teacher:`);
          teacherStudents.slice(0, 10).forEach(s => {
            console.log(`      - ${s.name} (${s.student_id})`);
          });
        }
      } else {
        console.log(`   ✗ No class assigned!`);
        console.log(`   💡 Fix: Run "npm run add-users" to create a class`);
      }
    } else {
      console.log(`   ✗ Teacher test@teacher.com not found!`);
      console.log(`   💡 Fix: Run "npm run add-users" to create the teacher`);
    }
    console.log('');

    // 5. Check academic records
    const academicRecords = await db.query('SELECT COUNT(*) as count FROM academic_records');
    console.log(`📝 Academic records: ${academicRecords.rows[0].count}`);
    console.log('');

    // 6. Auto-fix suggestions
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔧 Auto-Fix Options:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (testTeacher) {
      const teacherClass = classes.rows.find(c => c.teacher_id === testTeacher.id);
      
      if (!teacherClass) {
        console.log('1. Creating class for teacher...');
        const newClass = await db.query(
          'INSERT INTO classes (name, grade, teacher_id) VALUES ($1, $2, $3) RETURNING id, name',
          ['Grade 1', 1, testTeacher.id]
        );
        console.log(`   ✓ Created class: ${newClass.rows[0].name} (ID: ${newClass.rows[0].id})\n`);
        
        // Now assign students
        const unassigned = await db.query(
          'SELECT id FROM students WHERE class_id IS NULL LIMIT 50'
        );
        
        if (unassigned.rows.length > 0) {
          for (const student of unassigned.rows) {
            await db.query(
              'UPDATE students SET class_id = $1 WHERE id = $2',
              [newClass.rows[0].id, student.id]
            );
          }
          console.log(`   ✓ Assigned ${unassigned.rows.length} students to the class\n`);
        } else {
          // Move some students from other classes
          const otherStudents = await db.query(
            'SELECT id FROM students WHERE class_id IS NOT NULL LIMIT 20'
          );
          
          if (otherStudents.rows.length > 0) {
            for (const student of otherStudents.rows) {
              await db.query(
                'UPDATE students SET class_id = $1 WHERE id = $2',
                [newClass.rows[0].id, student.id]
              );
            }
            console.log(`   ✓ Moved ${otherStudents.rows.length} students to the class\n`);
          }
        }
      } else {
        const teacherStudents = studentsByClass[teacherClass.id] || [];
        
        if (teacherStudents.length === 0) {
          console.log('2. Assigning students to teacher\'s class...');
          
          // Assign unassigned students first
          const unassigned = await db.query(
            'SELECT id FROM students WHERE class_id IS NULL LIMIT 50'
          );
          
          if (unassigned.rows.length > 0) {
            for (const student of unassigned.rows) {
              await db.query(
                'UPDATE students SET class_id = $1 WHERE id = $2',
                [teacherClass.id, student.id]
              );
            }
            console.log(`   ✓ Assigned ${unassigned.rows.length} unassigned students\n`);
          } else {
            // Move students from other classes
            const otherStudents = await db.query(
              'SELECT id FROM students WHERE class_id != $1 LIMIT 20',
              [teacherClass.id]
            );
            
            if (otherStudents.rows.length > 0) {
              for (const student of otherStudents.rows) {
                await db.query(
                  'UPDATE students SET class_id = $1 WHERE id = $2',
                  [teacherClass.id, student.id]
                );
              }
              console.log(`   ✓ Moved ${otherStudents.rows.length} students to teacher's class\n`);
            } else {
              console.log('   ⚠ No students available to assign\n');
            }
          }
        }
      }
    }

    // Final check
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Final Status:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (testTeacher) {
      const finalClass = await db.query(
        'SELECT id FROM classes WHERE teacher_id = $1 LIMIT 1',
        [testTeacher.id]
      );
      
      if (finalClass.rows.length > 0) {
        const finalStudents = await db.query(
          'SELECT COUNT(*) as count FROM students WHERE class_id = $1',
          [finalClass.rows[0].id]
        );
        console.log(`Teacher: ${testTeacher.name}`);
        console.log(`Class: ${classes.rows.find(c => c.id === finalClass.rows[0].id)?.name || 'N/A'}`);
        console.log(`Students: ${finalStudents.rows[0].count}`);
        console.log(`\n✅ Teacher should now see ${finalStudents.rows[0].count} student(s) after login!\n`);
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('\n✗ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
};

checkTeacherData();

