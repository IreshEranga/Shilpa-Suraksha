const db = require('../config/database');
const fs = require('fs');
const path = require('path');

const resetDatabase = async () => {
  try {
    console.log('⚠️  WARNING: This will delete ALL data and recreate the schema!');
    console.log('   Press Ctrl+C within 5 seconds to cancel...\n');
    
    // Wait 5 seconds
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log('🗑️  Step 1: Clearing all data...\n');

    // Get all table names
    const tablesResult = await db.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);

    const tables = tablesResult.rows.map(row => row.tablename);

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

    // Drop all tables (CASCADE will handle dependencies)
    for (const tableName of deleteOrder) {
      if (tables.includes(tableName)) {
        try {
          await db.query(`DROP TABLE IF EXISTS ${tableName} CASCADE`);
          console.log(`  ✓ Dropped ${tableName}`);
        } catch (error) {
          console.log(`  ⚠ Could not drop ${tableName}: ${error.message}`);
        }
      }
    }

    // Drop any remaining tables
    for (const table of tables) {
      if (!deleteOrder.includes(table)) {
        try {
          await db.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
          console.log(`  ✓ Dropped ${table}`);
        } catch (error) {
          console.log(`  ⚠ Could not drop ${table}: ${error.message}`);
        }
      }
    }

    console.log('\n📋 Step 2: Recreating schema...\n');

    // Load and execute schema
    const schemaPath = path.join(__dirname, '../database/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    // Remove comments
    let cleanedSchema = schema.replace(/--.*$/gm, '').trim();
    
    // Parse statements manually, handling DO blocks correctly
    const doBlocks = [];
    const doBlockPattern = /DO\s+\$\$[\s\S]*?END\s+\$\$\s*;/gi;
    let doBlockMatch;
    const doBlockRanges = [];
    
    // Find all DO blocks and their positions
    while ((doBlockMatch = doBlockPattern.exec(cleanedSchema)) !== null) {
      doBlocks.push({
        start: doBlockMatch.index,
        end: doBlockMatch.index + doBlockMatch[0].length,
        content: doBlockMatch[0].trim()
      });
      doBlockRanges.push([doBlockMatch.index, doBlockMatch.index + doBlockMatch[0].length]);
    }
    
    // Now split the schema, but skip semicolons inside DO blocks
    let statements = [];
    let currentStatement = '';
    let i = 0;
    
    // Helper function to check if position is inside a DO block
    const isInDoBlock = (pos) => {
      return doBlockRanges.some(([start, end]) => pos >= start && pos < end);
    };
    
    while (i < cleanedSchema.length) {
      // Check if we're at the start of a DO block
      const doBlock = doBlocks.find(b => b.start === i);
      if (doBlock) {
        // Save any accumulated statement first
        if (currentStatement.trim().length > 0) {
          statements.push(currentStatement.trim());
          currentStatement = '';
        }
        // Add the complete DO block
        statements.push(doBlock.content);
        i = doBlock.end;
        continue;
      }
      
      // If we're inside a DO block, skip to the end
      if (isInDoBlock(i)) {
        const containingBlock = doBlocks.find(b => i >= b.start && i < b.end);
        if (containingBlock) {
          i = containingBlock.end;
          continue;
        }
      }
      
      // Regular character - add to current statement
      currentStatement += cleanedSchema[i];
      
      // Check for semicolon (end of statement) - but only if not in DO block
      if (cleanedSchema[i] === ';' && !isInDoBlock(i)) {
        const trimmed = currentStatement.trim();
        if (trimmed.length > 0) {
          statements.push(trimmed);
        }
        currentStatement = '';
      }
      
      i++;
    }
    
    // Add any remaining statement
    if (currentStatement.trim().length > 0) {
      statements.push(currentStatement.trim());
    }
    
    // Filter out empty or very short statements
    statements = statements.filter(s => s.length > 5);

    // Execute all statements
    console.log(`Executing ${statements.length} schema statements...\n`);
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      try {
        await db.query(statement);
      } catch (error) {
        const errorMsg = error.message.toLowerCase();
        // Ignore "already exists" errors
        if (!errorMsg.includes('already exists')) {
          console.error(`  ⚠ Error in statement ${i + 1}: ${error.message.substring(0, 100)}`);
        }
      }
    }

    console.log('\n✅ Database reset complete!\n');
    console.log('💡 Next steps:');
    console.log('   1. Run "npm run add-users" to create default login accounts');
    console.log('   2. Run "npm run import-dataset" to import student data (optional)');
    console.log('   3. Run "npm run assign-students" to assign students to teachers (optional)\n');

    process.exit(0);
  } catch (error) {
    console.error('\n✗ Failed to reset database:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
};

resetDatabase();

