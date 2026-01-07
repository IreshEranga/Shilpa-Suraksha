const db = require('../config/database');
const { loadSinhalaResources, trainLearningPathModel } = require('../ml/learningPathModel');

const run = async () => {
  try {
    console.log('Starting learning path dataset load + model training...');
    await db.init();

    console.log('Loading Sinhala learning-path resources...');
    await loadSinhalaResources();

    console.log('Training learning path model...');
    await trainLearningPathModel();

    console.log('Learning path training complete.');
    process.exit(0);
  } catch (error) {
    console.error('Learning path training failed:', error);
    process.exit(1);
  }
};

run();


