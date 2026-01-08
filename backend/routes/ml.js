const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { authenticate } = require('../middleware/auth');
const { analyzeHandwriting, analyzeHandwritingFromFeatures, trainHandwritingModel } = require('../ml/handwritingModel');

const upload = multer({
  dest: 'uploads/',
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Analyze handwriting/drawing
router.post('/analyze-handwriting', authenticate, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }
    
    const { studentId } = req.body;
    
    const analysis = await analyzeHandwriting(req.file.path);
    
    // Save analysis to database
    const db = require('../config/database');
    await db.query(
      'INSERT INTO handwriting_analysis (student_id, image_path, emotion_detected, confidence_score) VALUES ($1, $2, $3, $4)',
      [studentId, req.file.path, analysis.emotion, analysis.confidence]
    );
    
    res.json({
      emotion: analysis.emotion,
      confidence: analysis.confidence,
      isWeak: analysis.isWeak,
      message: analysis.message
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Analyze student face/expression for behavioral records
router.post('/analyze-student-face', authenticate, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }
    
    // Check if model is trained before analyzing
    const fs = require('fs');
    const path = require('path');
    // models/ lives at the project root, not under server/
    const MODEL_SAVE_PATH = path.join(__dirname, '../../models/emotion-model');
    const modelPath = path.join(MODEL_SAVE_PATH, 'model.json');
    const isTrained = fs.existsSync(modelPath);
    
    // Allow analysis even if model not trained (will use simple fallback)
    // if (!isTrained) {
    //   // Clean up uploaded file
    //   if (fs.existsSync(req.file.path)) {
    //     fs.unlinkSync(req.file.path);
    //   }
    //   return res.status(503).json({ 
    //     error: 'Model not trained yet',
    //     message: 'The emotion detection model needs to be trained first. Please run: npm run train-models',
    //     requiresTraining: true
    //   });
    // }
    
    const analysis = await analyzeHandwriting(req.file.path);
    
    // Map emotion to behavior type and severity
    let behaviorType = 'neutral';
    let severity = 'medium';
    let category = 'emotional_expression';
    let description = '';
    
    // Map emotions to behavior types
    if (analysis.emotion === 'happy') {
      behaviorType = 'positive';
      description = `Student shows positive emotions (happy) with ${(analysis.confidence * 100).toFixed(1)}% confidence. This indicates good emotional well-being.`;
    } else if (['angry', 'fear', 'sad'].includes(analysis.emotion)) {
      behaviorType = 'negative';
      description = `Student shows ${analysis.emotion} emotions with ${(analysis.confidence * 100).toFixed(1)}% confidence. This may indicate emotional distress or learning difficulties.`;
    }
    
    // Map confidence to severity
    if (analysis.confidence > 0.8) {
      severity = 'high';
    } else if (analysis.confidence > 0.6) {
      severity = 'medium';
    } else {
      severity = 'low';
    }
    
    // Add emotion-specific category
    if (analysis.emotion === 'angry') {
      category = 'aggression_concern';
    } else if (analysis.emotion === 'fear') {
      category = 'anxiety_concern';
    } else if (analysis.emotion === 'sad') {
      category = 'depression_concern';
    } else if (analysis.emotion === 'happy') {
      category = 'positive_engagement';
    }
    
    res.json({
      emotion: analysis.emotion,
      confidence: analysis.confidence,
      behavior_type: behaviorType,
      severity: severity,
      category: category,
      description: description,
      message: analysis.message,
      probabilities: analysis.probabilities,
      method: analysis.method || 'trained_model',
      warning: analysis.warning || null,
      isFallback: analysis.method === 'simple_analysis_fallback'
    });
  } catch (error) {
    console.error('Error analyzing student face:', error);
    res.status(500).json({ error: error.message || 'Failed to analyze image' });
  }
});

// Analyze handwriting from feature data (JSON)
router.post('/analyze-handwriting-features', authenticate, async (req, res) => {
  try {
    const { features } = req.body;
    
    if (!features || typeof features !== 'object') {
      return res.status(400).json({ error: 'Features object is required' });
    }
    
    const analysis = await analyzeHandwritingFromFeatures(features);
    
    res.json(analysis);
  } catch (error) {
    console.error('Error analyzing handwriting features:', error);
    res.status(500).json({ error: error.message || 'Failed to analyze handwriting features' });
  }
});

// Train handwriting model from JSON data
router.post('/train-handwriting-model', authenticate, async (req, res) => {
  try {
    const { jsonFilePath } = req.body;
    const path = require('path');
    
    // Default to handwritingData.json if not provided
    const dataPath = jsonFilePath || path.join(__dirname, '../ml/handwritingData.json');
    
    console.log(`Training handwriting model from: ${dataPath}`);
    
    await trainHandwritingModel(dataPath);
    
    res.json({ 
      success: true, 
      message: 'Handwriting model trained successfully',
      dataPath 
    });
  } catch (error) {
    console.error('Error training handwriting model:', error);
    res.status(500).json({ error: error.message || 'Failed to train handwriting model' });
  }
});

module.exports = router;

