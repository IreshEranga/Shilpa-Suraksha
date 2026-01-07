const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');


const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'shilpa_suraksha_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '1234',
  // Connection pool settings
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Initialize database schema
const init = async () => {
  try {
    // Test connection first
    await pool.query('SELECT NOW()');
    console.log('✓ Database connection established');

    // Load and execute schema
    const schemaPath = path.join(__dirname, '../database/schema.sql');
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Schema file not found: ${schemaPath}`);
    }
    
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    // Remove single-line comments
    let cleanedSchema = schema.replace(/--.*$/gm, '').trim();
    
    // Parse statements manually, handling DO blocks correctly
    // First, extract all DO blocks using a reliable method
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
          // We should have already added this block, so skip to end
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

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    console.log(`Executing ${statements.length} schema statements...`);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      try {
        await pool.query(statement);
        successCount++;
      } catch (error) {
        const errorMsg = error.message.toLowerCase();
        // Check if it's an "already exists" error (expected)
        if (errorMsg.includes('already exists') || 
            errorMsg.includes('duplicate') ||
            (errorMsg.includes('relation') && errorMsg.includes('already exists')) ||
            errorMsg.includes('column') && errorMsg.includes('already exists')) {
          // This is expected - table/index/column already exists
          successCount++;
        } else if (errorMsg.includes('column') && errorMsg.includes('does not exist')) {
          // Column doesn't exist - might be trying to create index on non-existent column
          // This can happen if ALTER TABLE hasn't run yet or failed
          // Try to add the column first, then retry the index
          if (statement.includes('idx_teachers_school')) {
            // Try to add school_id column if it doesn't exist
            try {
              await pool.query('ALTER TABLE teachers ADD COLUMN IF NOT EXISTS school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE');
              // Retry the index creation
              await pool.query(statement);
              successCount++;
              console.log(`✓ Fixed and retried statement ${i + 1}`);
            } catch (retryError) {
              errorCount++;
              console.warn(`⚠ Warning in statement ${i + 1}: ${error.message.substring(0, 100)}`);
            }
          } else {
            errorCount++;
            console.warn(`⚠ Warning in statement ${i + 1}: ${error.message.substring(0, 100)}`);
          }
        } else {
          errorCount++;
          errors.push({
            statement: statement.substring(0, 100),
            error: error.message
          });
          console.error(`✗ Error in statement ${i + 1}: ${error.message}`);
          console.error(`  Statement: ${statement.substring(0, 150)}...`);
        }
      }
    }
    
    console.log(`✓ Database schema synchronized (${successCount} statements executed)`);
    if (errorCount > 0) {
      console.warn(`⚠ ${errorCount} statements had errors:`);
      errors.forEach((err, idx) => {
        console.warn(`  ${idx + 1}. ${err.error}`);
      });
    }

    // Verify critical tables exist
    const criticalTables = ['teachers', 'students', 'classes', 'academic_records', 'attendance_records'];
    for (const table of criticalTables) {
      try {
        const result = await pool.query(
          `SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = $1
          )`,
          [table]
        );
        if (!result.rows[0].exists) {
          console.error(`✗ Critical table '${table}' does not exist!`);
          throw new Error(`Table '${table}' was not created`);
        } else {
          console.log(`  ✓ Table '${table}' exists`);
        }
      } catch (error) {
        if (!error.message.includes('was not created')) {
          throw error;
        }
      }
    }
  } catch (error) {
    console.error('✗ Error initializing database:', error.message);
    // Only throw for critical connection errors
    if (error.code === 'ECONNREFUSED' || error.code === '3D000' || error.code === '28P01') {
      console.error('✗ Database connection failed. Please check:');
      console.error('  - PostgreSQL is running');
      console.error('  - Database credentials are correct');
      console.error('  - Database "primary_school_db" exists');
      throw error;
    }
    // For schema errors, throw to prevent server from starting with broken schema
    throw error;
  }
};

// Test connection
pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

module.exports = {
  pool,
  init,
  query: (text, params) => pool.query(text, params),
};

