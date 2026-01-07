const db = require('../config/database');

const clearDatabase = async () => {
  try {
    console.log('⚠️  WARNING: This will delete ALL data from the database!');
    console.log('   Press Ctrl+C within 5 seconds to cancel...\n');
    
    // Wait 5 seconds
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log('🗑️  Clearing database...\n');

    // Get all table names
    const tablesResult = await db.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);

    const tables = tablesResult.rows.map(row => row.tablename);

    console.log(`Found ${tables.length} tables to clear:\n`);

    // Disable foreign key checks temporarily by dropping and recreating
    // Instead, delete in correct order to respect foreign keys
    
    // Delete in reverse dependency order
    const deleteOrder = [
      'progress_tracking',
      'intervention_history',
      'student_cluster_assignments',
      'at_risk_students',
      'student_clusters',
      'behavioral_records',
      'learning_paths',
      'weak_students',
      'handwriting_analysis',
      'academic_records',
      'attendance_records',
      'students',
      'classes',
      'teachers',
      'school_administrators',
      'schools',
      'sinhala_resources'
    ];

    // Delete data from tables (in order)
    for (const tableName of deleteOrder) {
      if (tables.includes(tableName)) {
        try {
          await db.query(`TRUNCATE TABLE ${tableName} CASCADE`);
          console.log(`  ✓ Cleared ${tableName}`);
        } catch (error) {
          // If truncate fails, try delete
          try {
            await db.query(`DELETE FROM ${tableName}`);
            console.log(`  ✓ Cleared ${tableName}`);
          } catch (err) {
            console.log(`  ⚠ Could not clear ${tableName}: ${err.message}`);
          }
        }
      }
    }

    // Also clear any remaining tables
    for (const table of tables) {
      if (!deleteOrder.includes(table)) {
        try {
          await db.query(`TRUNCATE TABLE ${table} CASCADE`);
          console.log(`  ✓ Cleared ${table}`);
        } catch (error) {
          console.log(`  ⚠ Could not clear ${table}: ${error.message}`);
        }
      }
    }

    console.log('\n✅ Database cleared successfully!\n');
    console.log('💡 Next steps:');
    console.log('   1. Run "npm run create-schema" to recreate tables');
    console.log('   2. Run "npm run add-users" to create default login accounts');
    console.log('   3. Run "npm run import-dataset" to import student data (optional)');
    console.log('   4. Run "npm run assign-students" to assign students to teachers (optional)\n');

    process.exit(0);
  } catch (error) {
    console.error('\n✗ Failed to clear database:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
};

clearDatabase();

