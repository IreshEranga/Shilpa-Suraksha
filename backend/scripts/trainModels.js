const { trainModel: trainAcademicModel } = require('../ml/academicModel');
const { trainModel: trainHandwritingModel, trainHandwritingModel: trainHandwritingFromJSON } = require('../ml/handwritingModel');
const { loadSinhalaResources, trainLearningPathModel } = require('../ml/learningPathModel');
const db = require('../config/database');
const path = require('path');

const trainAllModels = async () => {
  try {
    console.log('Starting model training...');
    
    // Initialize database connection
    await db.init();
    
    // Load Sinhala resources
    console.log('Loading Sinhala resources...');
    await loadSinhalaResources();

    // Train learning path retrieval model
    console.log('Training learning path model...');
    await trainLearningPathModel();
    
    // Train academic model
    console.log('Training academic model...');
    await trainAcademicModel();
    
    // Train handwriting/emotion model (from images)
    console.log('Training handwriting/emotion model...');
    await trainHandwritingModel();
    
    // Train handwriting recognition model (from JSON data)
    const jsonDataPath = path.join(__dirname, '../ml/handwritingData.json');
    console.log('\nTraining handwriting recognition model from JSON data...');
    try {
      await trainHandwritingFromJSON(jsonDataPath);
    } catch (error) {
      console.warn('Could not train handwriting model from JSON:', error.message);
      console.warn('Make sure handwritingData.json exists with valid data');
    }
    
    console.log('\nAll models trained successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error training models:', error);
    process.exit(1);
  }
};

trainAllModels();

