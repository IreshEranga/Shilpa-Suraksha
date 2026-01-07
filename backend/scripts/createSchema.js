const db = require('../config/database');
const fs = require('fs');
const path = require('path');

const createSchema = async () => {
  try {
    console.log('Connecting to database...');
    await db.query('SELECT NOW()');
    console.log('✓ Database connection established');

    const schemaPath = path.join(__dirname, '../database/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    // Remove comments
    let cleanedSchema = schema
      .replace(/--.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .trim();
    
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

    console.log(`Executing ${statements.length} statements...`);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      try {
        await db.query(statement);
        console.log(`✓ Statement ${i + 1}/${statements.length} executed`);
      } catch (error) {
        const errorMsg = error.message.toLowerCase();
        if (errorMsg.includes('already exists')) {
          console.log(`  (Statement ${i + 1} skipped - already exists)`);
        } else {
          console.error(`✗ Error in statement ${i + 1}: ${error.message}`);
          console.error(`  Statement: ${statement.substring(0, 100)}...`);
          throw error;
        }
      }
    }

    console.log('\n✓ Schema created successfully!');
    console.log('\n💡 Next step: Run "npm run add-users" to create default admin and teacher accounts');
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Failed to create schema:', error.message);
    process.exit(1);
  }
};

createSchema();

