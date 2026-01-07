const db = require('../config/database');
const fs = require('fs');
const path = require('path');

const initSampleData = async () => {
  try {
    console.log('Database initialized. Add sample data manually if needed.');
  } catch (error) {
    console.error('Error initializing sample data:', error);
  }
};

if (require.main === module) {
  db.init()
    .then(() => initSampleData())
    .then(() => {
      console.log('Database initialization complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Initialization failed:', error);
      process.exit(1);
    });
}

module.exports = { initSampleData };

