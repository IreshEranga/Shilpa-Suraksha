const db = require('../config/database');
const path = require('path');


const extractAndLoadResources = async () => {
  try {
    console.log('Sinhala resource extraction');
    console.log('Note: PDF extraction requires additional setup.');
    console.log('You can manually add resources using SQL or the API.');
    
 
    const sampleResources = [
      {
        subject: 'Mathematics',
        section: 'Basic Operations',
        content: 'සංඛ්‍යා මූලික කර්මාන්ත. එකතු කිරීම, අඩු කිරීම, ගුණ කිරීම, බෙදීම.',
        resource_type: 'lesson',
        grade_level: 1
      },
      {
        subject: 'Sinhala Language',
        section: 'Reading',
        content: 'කියවීමේ මූලික කුසලතා. අකුරු හඳුනා ගැනීම, වචන කියවීම.',
        resource_type: 'lesson',
        grade_level: 1
      }
    ];

    for (const resource of sampleResources) {
      await db.query(
        `INSERT INTO sinhala_resources (subject, section, content, resource_type, grade_level)
         SELECT $1, $2, $3, $4, $5
         WHERE NOT EXISTS (
           SELECT 1 FROM sinhala_resources 
           WHERE subject = $1 AND section = $2
         )`,
        [resource.subject, resource.section, resource.content, resource.resource_type, resource.grade_level]
      );
    }

    console.log('Sample resources added. Add more resources manually or parse PDF.');
  } catch (error) {
    console.error('Error loading resources:', error);
  }
};

if (require.main === module) {
  extractAndLoadResources()
    .then(() => {
      console.log('Resource loading complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed:', error);
      process.exit(1);
    });
}

module.exports = { extractAndLoadResources };

