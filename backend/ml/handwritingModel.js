// Try to load TensorFlow.js Node.js bindings, fallback to CPU version
const tfInitializer = require('./tfInitializer');
const { buildExplainabilityPackage } = require('./explainability');

// Ensure TensorFlow is initialized
const { tf: tfInstance, backendInfo } = tfInitializer.initializeTensorFlow({ silent: true });

let tf = tfInstance;
let useNodeBackend = backendInfo.useNodeBindings;

if (backendInfo.error) {
  console.warn(`⚠ TensorFlow warning at startup: ${backendInfo.error}`);
  console.warn('  Emotion analysis will be ~10-50x slower.');
  console.warn('  Fix: npm install --build-from-source @tensorflow/tfjs-node');
  console.warn('  Or run: node scripts/diagnoseTensorFlow.js for more info');
} else {
  console.log(`✓ Emotion analysis using TensorFlow backend: ${backendInfo.name}`);
}

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

let model = null;
let emotionModelType = 'cnn'; // 'cnn' | 'mobilenet'
let mobilenetModel = null;
const EMOTION_CLASSES = ['angry', 'fear', 'happy', 'sad'];
const IMAGE_SIZE = 128; // Reduced from 224 for much faster training (4x fewer pixels)
const MODEL_SAVE_PATH = path.join(__dirname, '../../models/emotion-model');
const EMOTION_META_PATH = path.join(MODEL_SAVE_PATH, 'meta.json');
const MOBILENET_IMAGE_SIZE = 224;
const MOBILENET_EMBEDDING = 'conv_preds';
const DEFAULT_IG_STEPS = 8;
const DEFAULT_MOBILENET_IG_STEPS = 8;

const saveLayersModelToFsDir = async (layersModel, dirPath) => {
  // Works even without tfjs-node (no file:// save handler)
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
  const modelJsonPath = path.join(dirPath, 'model.json');
  const weightsPath = path.join(dirPath, 'weights.bin');

  const saveHandler = tf.io.withSaveHandler(async (artifacts) => {
    try {
      if (!artifacts || !artifacts.modelTopology || !artifacts.weightData || !artifacts.weightSpecs) {
        throw new Error('Invalid model artifacts');
      }

      const weightDataBuf = Buffer.from(new Uint8Array(artifacts.weightData));
      fs.writeFileSync(weightsPath, weightDataBuf);

      const modelJson = {
        format: artifacts.format,
        generatedBy: artifacts.generatedBy,
        convertedBy: artifacts.convertedBy,
        modelTopology: artifacts.modelTopology,
        trainingConfig: artifacts.trainingConfig,
        userDefinedMetadata: artifacts.userDefinedMetadata,
        weightsManifest: [
          {
            paths: ['weights.bin'],
            weights: artifacts.weightSpecs
          }
        ]
      };
      fs.writeFileSync(modelJsonPath, JSON.stringify(modelJson, null, 2), 'utf8');

      return {
        modelArtifactsInfo: {
          dateSaved: new Date(),
          modelTopologyType: 'JSON',
          modelTopologyBytes: Buffer.byteLength(JSON.stringify(artifacts.modelTopology || {})),
          weightSpecsBytes: Buffer.byteLength(JSON.stringify(artifacts.weightSpecs || [])),
          weightDataBytes: weightDataBuf.byteLength
        }
      };
    } catch (e) {
      console.error('Failed to save model artifacts to filesystem:', e);
      throw e;
    }
  });

  await layersModel.save(saveHandler);
  return { modelJsonPath, weightsPath };
};

const loadLayersModelFromFsDir = async (dirPath) => {
  // Works even without tfjs-node (no file:// load handler)
  const modelJsonPath = path.join(dirPath, 'model.json');
  if (!fs.existsSync(modelJsonPath)) {
    throw new Error(`model.json not found at ${modelJsonPath}`);
  }
  const json = JSON.parse(fs.readFileSync(modelJsonPath, 'utf8'));
  const manifest = Array.isArray(json.weightsManifest) ? json.weightsManifest : [];
  const firstGroup = manifest[0];
  const weightSpecs = firstGroup?.weights || [];
  const firstPath = firstGroup?.paths?.[0] || 'weights.bin';
  const weightsPath = path.join(dirPath, firstPath);
  if (!fs.existsSync(weightsPath)) {
    throw new Error(`weights file not found at ${weightsPath}`);
  }
  const buf = fs.readFileSync(weightsPath);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

  // tf.io.fromMemory exists on plain @tensorflow/tfjs and provides a load handler.
  const ioHandler = tf.io.fromMemory({
    modelTopology: json.modelTopology,
    weightSpecs,
    weightData: ab,
    format: json.format,
    generatedBy: json.generatedBy,
    convertedBy: json.convertedBy,
    trainingConfig: json.trainingConfig,
    userDefinedMetadata: json.userDefinedMetadata
  });

  return await tf.loadLayersModel(ioHandler);
};

const getTrainMaxMinutes = () => {
  const raw = process.env.EMOTION_TRAIN_MAX_MINUTES;
  const parsed = raw ? Number(raw) : 20;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 20;
};

const loadEmotionMeta = () => {
  try {
    if (!fs.existsSync(EMOTION_META_PATH)) return null;
    return JSON.parse(fs.readFileSync(EMOTION_META_PATH, 'utf8'));
  } catch (e) {
    console.warn('Could not read emotion meta.json:', e.message);
    return null;
  }
};

const saveEmotionMeta = (meta) => {
  try {
    if (!fs.existsSync(MODEL_SAVE_PATH)) fs.mkdirSync(MODEL_SAVE_PATH, { recursive: true });
    fs.writeFileSync(EMOTION_META_PATH, JSON.stringify(meta, null, 2), 'utf8');
  } catch (e) {
    console.warn('Could not write emotion meta.json:', e.message);
  }
};

const createCnnEmotionModel = () => {
  // Enhanced CNN model optimized for ACCURACY (deeper, more filters)
  const m = tf.sequential({
    layers: [
      // First convolutional block - feature extraction
      tf.layers.conv2d({
        inputShape: [IMAGE_SIZE, IMAGE_SIZE, 3],
        filters: 32, // Increased from 16 for better feature extraction
        kernelSize: 3,
        activation: 'relu',
        padding: 'same'
      }),
      tf.layers.batchNormalization(), // Added for better training stability
      tf.layers.conv2d({
        filters: 32,
        kernelSize: 3,
        activation: 'relu',
        padding: 'same'
      }),
      tf.layers.maxPooling2d({ poolSize: 2 }),
      tf.layers.dropout({ rate: 0.25 }), // Slightly increased
      
      // Second convolutional block - deeper features
      tf.layers.conv2d({
        filters: 64, // Increased from 32
        kernelSize: 3,
        activation: 'relu',
        padding: 'same'
      }),
      tf.layers.batchNormalization(), // Added
      tf.layers.conv2d({
        filters: 64,
        kernelSize: 3,
        activation: 'relu',
        padding: 'same'
      }),
      tf.layers.maxPooling2d({ poolSize: 2 }),
      tf.layers.dropout({ rate: 0.25 }),
      
      // Third convolutional block - high-level features
      tf.layers.conv2d({
        filters: 128, // New layer for better accuracy
        kernelSize: 3,
        activation: 'relu',
        padding: 'same'
      }),
      tf.layers.batchNormalization(),
      tf.layers.maxPooling2d({ poolSize: 2 }),
      tf.layers.dropout({ rate: 0.3 }),
      
      // Flatten and dense layers - increased capacity
      tf.layers.flatten(),
      tf.layers.dense({ units: 256, activation: 'relu' }), // Increased from 64
      tf.layers.batchNormalization(),
      tf.layers.dropout({ rate: 0.4 }), // Increased
      tf.layers.dense({ units: 128, activation: 'relu' }), // Additional layer
      tf.layers.dropout({ rate: 0.3 }),
      tf.layers.dense({ units: EMOTION_CLASSES.length, activation: 'softmax' })
    ]
  });

  m.compile({
    optimizer: tf.train.adam(0.0005),
    loss: 'categoricalCrossentropy',
    metrics: ['accuracy']
  });
  return m;
};

const createMobileNetClassifier = (embeddingSize = 1024) => {
  const m = tf.sequential({
    layers: [
      tf.layers.dense({ inputShape: [embeddingSize], units: 128, activation: 'relu' }),
      tf.layers.dropout({ rate: 0.3 }),
      tf.layers.dense({ units: EMOTION_CLASSES.length, activation: 'softmax' })
    ]
  });
  m.compile({
    optimizer: tf.train.adam(0.0008),
    loss: 'categoricalCrossentropy',
    metrics: ['accuracy']
  });
  return m;
};

const getMobileNet = async () => {
  if (mobilenetModel) return mobilenetModel;
  try {
    // Lazy require so the server can still run even if dependency isn't installed yet
    // (training will instruct user to install it)
    const mobilenet = require('@tensorflow-models/mobilenet');
    console.log('Loading MobileNet feature extractor (transfer learning)...');
    mobilenetModel = await mobilenet.load({ version: 2, alpha: 1.0 });
    console.log('✓ MobileNet loaded');
    return mobilenetModel;
  } catch (e) {
    console.error('❌ MobileNet not available:', e.message);
    console.error('Install it with: cd server && npm install @tensorflow-models/mobilenet');
    throw e;
  }
};

// Initialize the handwriting/emotion detection model
const initializeModel = async () => {
  try {
    const meta = loadEmotionMeta();
    emotionModelType = meta?.type || 'cnn';

    // Try to load saved model first
    if (fs.existsSync(MODEL_SAVE_PATH)) {
      try {
        console.log('Loading saved emotion model...');
        if (useNodeBackend) {
          model = await tf.loadLayersModel(`file://${MODEL_SAVE_PATH}/model.json`);
        } else {
          model = await loadLayersModelFromFsDir(MODEL_SAVE_PATH);
        }
        console.log('Saved emotion model loaded successfully');
        return;
      } catch (loadError) {
        console.warn('Could not load saved model, creating new one:', loadError.message);
      }
    }

    if (emotionModelType === 'mobilenet') {
      // We create only the small classifier head here (MobileNet is loaded separately)
      model = createMobileNetClassifier(meta?.embeddingSize || 1024);
      console.log('Emotion model initialized (MobileNet transfer learning - needs training)');
    } else {
      model = createCnnEmotionModel();
      console.log('Handwriting/emotion model initialized (CNN - needs training)');
    }
  } catch (error) {
    console.error('Error initializing handwriting model:', error);
  }
};

// Load image and convert to tensor efficiently (no giant JS arrays)
const loadImageTensor = async (imagePath, targetSize, augment = false) => {
  try {
    // Fastest path: tfjs-node decode
    if (useNodeBackend && tf.node?.decodeImage) {
      let buffer = fs.readFileSync(imagePath);
      let img = tf.node.decodeImage(buffer, 3); // [H,W,3] uint8
      if (augment && Math.random() > 0.5) {
        img = tf.image.flipLeftRight(img);
      }
      const resized = tf.image.resizeBilinear(img, [targetSize, targetSize]);
      const normalized = resized.toFloat().div(255.0);
      const expanded = normalized.expandDims(0);
      img.dispose();
      resized.dispose();
      normalized.dispose();
      return expanded;
    }

    // Portable path: sharp -> raw -> Uint8Array -> tensor3d
    let sharpInstance = sharp(imagePath).resize(targetSize, targetSize).removeAlpha().ensureAlpha(1).normalize();

    // Data augmentation for training
    if (augment) {
      // Random horizontal flip (50% chance)
      if (Math.random() > 0.5) {
        sharpInstance = sharpInstance.flip(true);
      }
      
      // Random brightness adjustment (±10%)
      const brightness = 1.0 + (Math.random() - 0.5) * 0.2;
      sharpInstance = sharpInstance.modulate({ brightness });
      
      // Random contrast adjustment (±10%)
      const contrast = 1.0 + (Math.random() - 0.5) * 0.2;
      sharpInstance = sharpInstance.linear(contrast, -(128 * contrast) + 128);
    }

    const imageBuffer = await sharpInstance.raw().toBuffer();
    const arr = new Uint8Array(imageBuffer);
    // sharp raw includes 4 channels if alpha is present; we forced alpha, so take RGB only
    // If buffer is RGBA, strip alpha; else assume RGB.
    const channels = (arr.length === targetSize * targetSize * 4) ? 4 : 3;
    let rgb = arr;
    if (channels === 4) {
      rgb = new Uint8Array(targetSize * targetSize * 3);
      for (let i = 0, j = 0; i < arr.length; i += 4, j += 3) {
        rgb[j] = arr[i];
        rgb[j + 1] = arr[i + 1];
        rgb[j + 2] = arr[i + 2];
      }
    }
    const imageTensor = tf.tensor3d(rgb, [targetSize, targetSize, 3], 'int32');
    const expanded = imageTensor.toFloat().div(255.0).expandDims(0);
    imageTensor.dispose();
    return expanded;
  } catch (error) {
    console.error('Error preprocessing image:', error);
    throw error;
  }
};

// Backward-compatible helper for existing CNN path
const preprocessImage = async (imagePath, augment = false) => loadImageTensor(imagePath, IMAGE_SIZE, augment);

const toFixedMetric = (value, digits = 4) => {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
};

const getPredictTensorFactory = async (trainedType) => {
  if (trainedType === 'mobilenet') {
    const mobileNet = await getMobileNet();
    return (inputTensor) => tf.tidy(() => {
      const emb = mobileNet.infer(inputTensor, MOBILENET_EMBEDDING);
      const batchSize = inputTensor.shape[0] || 1;
      const flat = emb.reshape([batchSize, emb.size / batchSize]);
      return model.predict(flat);
    });
  }

  return (inputTensor) => model.predict(inputTensor);
};

// Simple rule-based emotion detection (fallback when model not trained)
const simpleEmotionDetection = async (imagePath) => {
  try {
    // Get image statistics using Sharp
    const stats = await sharp(imagePath)
      .resize(IMAGE_SIZE, IMAGE_SIZE)
      .normalize()
      .stats();
    
    const channels = stats.channels;
    const avgR = channels[0]?.mean || 128;
    const avgG = channels[1]?.mean || 128;
    const avgB = channels[2]?.mean || 128;
    const brightness = (avgR + avgG + avgB) / 3;
    const saturation = Math.sqrt(
      Math.pow(avgR - brightness, 2) + 
      Math.pow(avgG - brightness, 2) + 
      Math.pow(avgB - brightness, 2)
    ) / 255;
    
    // Simple heuristics based on color and brightness
    // Improved to better detect sad emotions for dark/abstract images
    let emotion = 'happy';
    let confidence = 0.55;
    
    // Analyze image characteristics more carefully
    const redDominance = avgR / (avgR + avgG + avgB + 1);
    const greenDominance = avgG / (avgR + avgG + avgB + 1);
    const blueDominance = avgB / (avgR + avgG + avgB + 1);
    
    // Check if image is mostly black/white (low saturation = grayscale)
    const isGrayscale = saturation < 0.15;
    const isDark = brightness < 120;
    const isVeryDark = brightness < 90;
    
    // PRIORITY 1: Very dark images → sad (most important for abstract/dark images)
    if (isVeryDark) {
      emotion = 'sad';
      confidence = 0.70 + (90 - brightness) / 100; // 0.70-0.90 for very dark
      confidence = Math.min(0.90, Math.max(0.65, confidence));
    }
    // PRIORITY 2: Dark grayscale/black-white images → sad
    else if (isDark && isGrayscale) {
      emotion = 'sad';
      confidence = 0.65 + (120 - brightness) / 150; // 0.65-0.85
      confidence = Math.min(0.85, Math.max(0.60, confidence));
    }
    // PRIORITY 3: Dark images (not grayscale) → sad
    else if (isDark) {
      emotion = 'sad';
      confidence = 0.60 + (120 - brightness) / 200; // 0.60-0.80
      confidence = Math.min(0.80, Math.max(0.55, confidence));
    }
    // PRIORITY 4: Bright, warm colors (yellow, orange) → happy
    else if (brightness > 180 && avgR > avgB && avgG > avgB) {
      emotion = 'happy';
      confidence = 0.65 + (brightness - 180) / 200; // 0.65-0.85
      confidence = Math.min(0.85, Math.max(0.55, confidence));
    }
    // PRIORITY 5: Red/orange dominant → angry
    else if (redDominance > 0.45 && avgR > avgG + 25 && avgR > avgB + 25) {
      emotion = 'angry';
      confidence = 0.58 + (redDominance - 0.45) * 2; // 0.58-0.78
      confidence = Math.min(0.78, Math.max(0.55, confidence));
    }
    // PRIORITY 6: Blue/grey dominant → fear
    else if (blueDominance > 0.40 && saturation < 0.25) {
      emotion = 'fear';
      confidence = 0.57 + (blueDominance - 0.40) * 2; // 0.57-0.77
      confidence = Math.min(0.77, Math.max(0.55, confidence));
    }
    // PRIORITY 7: Medium-low brightness → sad (default for ambiguous dark images)
    else if (brightness < 150) {
      emotion = 'sad';
      confidence = 0.58 + (150 - brightness) / 200; // 0.58-0.78
      confidence = Math.min(0.78, Math.max(0.55, confidence));
    }
    // PRIORITY 8: Medium brightness, balanced colors → happy
    else {
      emotion = 'happy';
      confidence = 0.55 + (brightness - 150) / 300; // 0.55-0.75
      confidence = Math.min(0.75, Math.max(0.55, confidence));
    }
    
    // Create probability distribution
    const probabilities = {
      angry: emotion === 'angry' ? confidence : (1 - confidence) / 3,
      fear: emotion === 'fear' ? confidence : (1 - confidence) / 3,
      happy: emotion === 'happy' ? confidence : (1 - confidence) / 3,
      sad: emotion === 'sad' ? confidence : (1 - confidence) / 3
    };
    
    return {
      emotion: emotion,
      confidence: confidence,
      isWeak: ['angry', 'fear', 'sad'].includes(emotion) && confidence > 0.6,
      message: `⚠️ FALLBACK MODE: Simple color analysis detected ${emotion} emotions (confidence: ${(confidence * 100).toFixed(1)}%). Model not trained - results are approximate. Run "npm run train-models" for accurate AI predictions.`,
      probabilities: probabilities,
      method: 'simple_analysis_fallback',
      warning: 'Model not trained - using basic color analysis. Train the model for accurate predictions.'
    };
  } catch (error) {
    console.error('Error in simple emotion detection:', error);
    // Fallback to happy
    return {
      emotion: 'happy',
      confidence: 0.5,
      isWeak: false,
      message: 'Unable to analyze image - using default',
      probabilities: { angry: 0.25, fear: 0.25, happy: 0.25, sad: 0.25 },
      method: 'fallback'
    };
  }
};

// Train the model from emotion folders
const trainModel = async () => {
  try {
    const trainingType = (process.env.EMOTION_TRAINING_TYPE || 'mobilenet').toLowerCase(); // mobilenet | cnn
    const maxMinutes = getTrainMaxMinutes();
    console.log(`\n=== Emotion Model Training (${trainingType}) ===`);
    console.log(`Time budget: ${maxMinutes} minutes`);

    if (trainingType === 'mobilenet') {
      await trainEmotionModelWithMobileNet(maxMinutes);
      return;
    }

    // CNN fallback path
    emotionModelType = 'cnn';
    saveEmotionMeta({ type: 'cnn', imageSize: IMAGE_SIZE, classes: EMOTION_CLASSES, updatedAt: new Date().toISOString() });

    // Initialize model first if not already initialized
    if (!model) await initializeModel();
    
    // If model was loaded from saved file, we still need to train it (or skip if already trained)
    // For now, we'll always retrain to ensure it's up to date
    
    const basePath = path.join(__dirname, '../../');
    const emotions = ['angry', 'fear', 'happy', 'sad'];
    
    const images = [];
    const labels = [];

    for (let i = 0; i < emotions.length; i++) {
      const emotion = emotions[i];
      const emotionPath = path.join(basePath, emotion);
      
      if (!fs.existsSync(emotionPath)) {
        console.log(`Path ${emotionPath} does not exist, skipping...`);
        continue;
      }

      const files = fs.readdirSync(emotionPath)
        .filter(f => /\.(jpg|jpeg|png)$/i.test(f));

      // Use more images for better accuracy (up to 100 per emotion)
      const imagesToUse = Math.min(files.length, 100);
      const selectedFiles = files.slice(0, imagesToUse);

      console.log(`Loading ${selectedFiles.length} images for ${emotion}...`);

      for (const file of selectedFiles) {
        try {
          const imagePath = path.join(emotionPath, file);
          
          // Load original image
          const imageTensor = await preprocessImage(imagePath, false);
          images.push(imageTensor);
          
          // One-hot encoding
          const label = new Array(EMOTION_CLASSES.length).fill(0);
          label[i] = 1;
          labels.push(label);
          
          // Data augmentation: add augmented versions for better accuracy
          // Add horizontally flipped version (50% chance)
          if (Math.random() > 0.5) {
            const augmentedTensor = await preprocessImage(imagePath, true);
            images.push(augmentedTensor);
            labels.push([...label]); // Same label
          }
        } catch (error) {
          console.error(`Error loading image ${file}:`, error.message);
        }
      }
    }

    if (images.length === 0) {
      console.log('No images found for training');
      return;
    }

    console.log(`Total images loaded: ${images.length}`);
    console.log('Stacking images into tensor (this may take a moment)...');

    // Stack images and labels
    const xs = tf.concat(images);
    console.log('Images stacked. Creating labels tensor...');
    const ys = tf.tensor2d(labels);
    console.log('Labels created. Splitting data...');

    // Split data
    const splitIndex = Math.floor(images.length * 0.8);
    const trainXs = xs.slice([0, 0, 0, 0], [splitIndex, IMAGE_SIZE, IMAGE_SIZE, 3]);
    const trainYs = ys.slice([0, 0], [splitIndex, EMOTION_CLASSES.length]);
    const valXs = xs.slice([splitIndex, 0, 0, 0], [-1, IMAGE_SIZE, IMAGE_SIZE, 3]);
    const valYs = ys.slice([splitIndex, 0], [-1, EMOTION_CLASSES.length]);

    // Clean up individual tensors and original tensors after splitting
    console.log('Cleaning up individual image tensors...');
    images.forEach(img => {
      if (img && img.dispose) {
        img.dispose();
      }
    });
    xs.dispose();
    ys.dispose();
    console.log('Memory cleaned. Starting training...');
    console.log(`Training on ${splitIndex} samples, validating on ${images.length - splitIndex} samples`);
    console.log('CNN training: deeper conv blocks (32/64/128), 128x128 images');
    console.log(`This may take several minutes on CPU. Time budget: ${maxMinutes} minutes.\n`);
    console.log('📝 Note: First batch processes 64 images through CNN (forward + backward pass)');
    console.log('   This is computationally intensive on CPU - subsequent batches are faster!\n');
    
    // Warm-up: Initialize computation graph before training (makes first batch faster)
    console.log('🔥 Warming up model (compiling computation graph - this takes 15-30 seconds)...');
    const warmupStart = Date.now();
    try {
      // Create a small dummy batch to initialize the graph
      const warmupBatch = trainXs.slice([0, 0, 0, 0], [1, IMAGE_SIZE, IMAGE_SIZE, 3]);
      const warmupLabels = trainYs.slice([0, 0], [1, EMOTION_CLASSES.length]);
      await model.fit(warmupBatch, warmupLabels, {
        epochs: 1,
        batchSize: 1,
        verbose: 0
      });
      warmupBatch.dispose();
      warmupLabels.dispose();
      const warmupTime = ((Date.now() - warmupStart) / 1000).toFixed(0);
      console.log(`✓ Warm-up complete (${warmupTime}s) - computation graph compiled!\n`);
    } catch (warmupError) {
      console.log('⚠️  Warm-up skipped, proceeding with training...\n');
    }

    console.log('Training started - batches should process quickly now...');

    // Train the model
    const startTime = Date.now();
    
    console.log('Starting model.fit()...');
    
    // Learning rate scheduling for better accuracy
    let currentLearningRate = 0.0005;
    let bestValAccEmotion = 0;
    let patience = 15; // Early stopping patience
    let patienceCounter = 0;
    let reduceLRPatience = 5; // Reduce LR if no improvement
    let reduceLRCounter = 0;
    
    try {
      await model.fit(trainXs, trainYs, {
        epochs: 20, // Increased from 2 to 20 for better accuracy
        batchSize: 32, // Optimal batch size for accuracy
        validationData: [valXs, valYs],
        verbose: 1, // Show progress
        callbacks: {
          onTrainBegin: () => {
            console.log('✓ Training loop started');
          },
          onEpochBegin: (epoch) => {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
            console.log(`\n[Epoch ${epoch + 1}/20] Starting... (${elapsed}s elapsed)`);
          },
          onEpochEnd: async (epoch, logs) => {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
            const loss = logs.loss ? logs.loss.toFixed(4) : 'N/A';
            const acc = (logs.acc || logs.accuracy) ? ((logs.acc || logs.accuracy) * 100).toFixed(2) + '%' : 'N/A';
            const valLoss = logs.val_loss ? logs.val_loss.toFixed(4) : 'N/A';
            const valAcc = (logs.val_acc || logs.val_accuracy) ? ((logs.val_acc || logs.val_accuracy) * 100).toFixed(2) + '%' : 'N/A';
            
            // Track best validation accuracy and implement early stopping
            const currentValAcc = logs.val_acc || logs.val_accuracy || 0;
            const currentValLoss = logs.val_loss || Infinity;
            
            if (currentValAcc > bestValAccEmotion) {
              bestValAccEmotion = currentValAcc;
              patienceCounter = 0;
              reduceLRCounter = 0;
              console.log(`[Epoch ${epoch + 1}/20] ✓ Completed (${elapsed}s) - loss: ${loss}, acc: ${acc}, val_loss: ${valLoss}, val_acc: ${valAcc} ⭐ (best val_acc)`);
            } else {
              patienceCounter++;
              reduceLRCounter++;
              
              // Reduce learning rate if no improvement
              if (reduceLRCounter >= reduceLRPatience && currentLearningRate > 0.0001) {
                currentLearningRate *= 0.5; // Halve the learning rate
                model.compile({
                  optimizer: tf.train.adam(currentLearningRate),
                  loss: 'categoricalCrossentropy',
                  metrics: ['accuracy']
                });
                reduceLRCounter = 0;
                console.log(`  → Reduced learning rate to ${currentLearningRate}`);
              }
              
              // Early stopping
              if (patienceCounter >= patience) {
                console.log(`  → Early stopping triggered (no improvement for ${patience} epochs)`);
                model.stopTraining = true;
              } else {
                console.log(`[Epoch ${epoch + 1}/20] ✓ Completed (${elapsed}s) - loss: ${loss}, acc: ${acc}, val_loss: ${valLoss}, val_acc: ${valAcc}`);
              }
            }
          },
          onBatchBegin: (batch, logs) => {
            const batchStartTime = Date.now();
            // Show progress for first few batches, then every 5 batches
            if (batch === 0) {
              console.log(`  ⏳ Processing batch ${batch + 1} (forward pass + backprop - this takes 10-30s on CPU)...`);
              // Store batch start time for first batch
              if (!global.batchStartTimes) global.batchStartTimes = {};
              global.batchStartTimes[batch] = batchStartTime;
            } else if (batch < 5) {
              console.log(`  Processing batch ${batch + 1}...`);
              if (!global.batchStartTimes) global.batchStartTimes = {};
              global.batchStartTimes[batch] = batchStartTime;
            } else if (batch % 5 === 0) {
              process.stdout.write(`.${batch + 1}`);
            }
          },
          onBatchEnd: (batch, logs) => {
            // Hard time budget stop (prevents "hours" runs)
            if (Date.now() - startTime > maxMinutes * 60 * 1000) {
              console.log(`\n⏱️  Time budget reached (${maxMinutes} min). Stopping training now.`);
              model.stopTraining = true;
              return;
            }
            // Show progress for first few batches, then every 5 batches
            if (batch < 5) {
              const batchTime = global.batchStartTimes && global.batchStartTimes[batch] 
                ? ((Date.now() - global.batchStartTimes[batch]) / 1000).toFixed(1)
                : 'N/A';
              const loss = logs.loss ? logs.loss.toFixed(4) : 'N/A';
              const acc = (logs.acc || logs.accuracy) ? ((logs.acc || logs.accuracy) * 100).toFixed(1) + '%' : 'N/A';
              const totalTime = ((Date.now() - startTime) / 1000).toFixed(0);
              console.log(`  ✓ Batch ${batch + 1} done (${batchTime}s for this batch, ${totalTime}s total) - loss: ${loss}, acc: ${acc}`);
            } else if ((batch + 1) % 5 === 0) {
              const loss = logs.loss ? logs.loss.toFixed(4) : 'N/A';
              const acc = (logs.acc || logs.accuracy) ? ((logs.acc || logs.accuracy) * 100).toFixed(1) + '%' : 'N/A';
              console.log(`\n  Batch ${batch + 1} done - loss: ${loss}, acc: ${acc}`);
            }
          }
        }
      });
    } catch (error) {
      console.error('Error during training:', error);
      throw error;
    }
    
    const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    console.log(`\n✓ Training completed in ${totalTime} minutes!`);

    trainXs.dispose();
    trainYs.dispose();
    valXs.dispose();
    valYs.dispose();

    // Save the trained model
    try {
      // Ensure models directory exists
      const modelsDir = path.join(__dirname, '../../models');
      if (!fs.existsSync(modelsDir)) {
        fs.mkdirSync(modelsDir, { recursive: true });
      }
      
      // Ensure emotion-model directory exists
      if (!fs.existsSync(MODEL_SAVE_PATH)) {
        fs.mkdirSync(MODEL_SAVE_PATH, { recursive: true });
      }
      
      // Use proper file:// URL format for Windows
      // Convert backslashes to forward slashes for file:// URL
      // Also need to handle Windows drive letters (C: -> /C:)
      let normalizedPath = MODEL_SAVE_PATH.replace(/\\/g, '/');
      if (normalizedPath.match(/^[A-Z]:/)) {
        // Windows absolute path: C:/path -> /C:/path
        normalizedPath = '/' + normalizedPath;
      }
      const savePath = `file://${normalizedPath}`;
      
      console.log(`Saving model to: ${savePath}`);
      console.log(`Original path: ${MODEL_SAVE_PATH}`);
      
      if (!useNodeBackend) {
        console.warn('⚠️  Not using Node.js backend - using filesystem save fallback (model.json + weights.bin)');
      }
      
      if (useNodeBackend) {
        await model.save(savePath);
      } else {
        await saveLayersModelToFsDir(model, MODEL_SAVE_PATH);
      }
      console.log(`✓ Handwriting/emotion model saved successfully to ${MODEL_SAVE_PATH}`);
      
      // Verify the files were created
      const modelJsonPath = path.join(MODEL_SAVE_PATH, 'model.json');
      if (fs.existsSync(modelJsonPath)) {
        const stats = fs.statSync(modelJsonPath);
        console.log(`✓ Model file verified: ${modelJsonPath} (${stats.size} bytes)`);
      } else {
        console.warn('⚠️  Warning: model.json not found after save - model may not have saved correctly');
      }
    } catch (saveError) {
      console.error('❌ Error saving model:', saveError.message);
      console.error('Stack:', saveError.stack);
      console.warn('Model training completed but could not be saved. You may need to retrain.');
    }

    console.log('Handwriting/emotion model trained successfully');
  } catch (error) {
    console.error('Error training handwriting model:', error);
  }
};

const trainEmotionModelWithMobileNet = async (maxMinutes = 20) => {
  const basePath = path.join(__dirname, '../../');
  const emotions = ['angry', 'fear', 'happy', 'sad'];

  // Load MobileNet once
  const mobileNet = await getMobileNet();

  const embeddings = [];
  const labels = [];

  for (let i = 0; i < emotions.length; i++) {
    const emotion = emotions[i];
    const emotionPath = path.join(basePath, emotion);
    if (!fs.existsSync(emotionPath)) {
      console.log(`Path ${emotionPath} does not exist, skipping...`);
      continue;
    }

    const files = fs.readdirSync(emotionPath).filter(f => /\.(jpg|jpeg|png)$/i.test(f));
    // More images helps accuracy; keep reasonable for CPU time
    const imagesToUse = Math.min(files.length, 250);
    const selectedFiles = files.slice(0, imagesToUse);

    console.log(`Embedding ${selectedFiles.length} images for ${emotion} (MobileNet)...`);

    for (const file of selectedFiles) {
      const imagePath = path.join(emotionPath, file);
      try {
        const img = await loadImageTensor(imagePath, MOBILENET_IMAGE_SIZE, false);
        const emb = mobileNet.infer(img, MOBILENET_EMBEDDING); // [1, embedding]
        const flat = emb.reshape([1, emb.size]);

        embeddings.push(flat);
        const label = new Array(EMOTION_CLASSES.length).fill(0);
        label[i] = 1;
        labels.push(label);

        // Optional light augmentation: flip
        if (Math.random() > 0.6) {
          const imgFlip = await loadImageTensor(imagePath, MOBILENET_IMAGE_SIZE, true);
          const embFlip = mobileNet.infer(imgFlip, MOBILENET_EMBEDDING);
          const flatFlip = embFlip.reshape([1, embFlip.size]);
          embeddings.push(flatFlip);
          labels.push([...label]);
          imgFlip.dispose();
          embFlip.dispose();
        }

        img.dispose();
        emb.dispose();
      } catch (e) {
        console.warn(`Skipping ${file}: ${e.message}`);
      }
    }
  }

  if (embeddings.length === 0) {
    console.log('No images found for training');
    return;
  }

  console.log(`Total embedded samples: ${embeddings.length}`);
  console.log('Stacking embeddings...');

  const xs = tf.concat(embeddings, 0);
  const ys = tf.tensor2d(labels);
  embeddings.forEach(t => t.dispose && t.dispose());

  const splitIndex = Math.floor(xs.shape[0] * 0.8);
  const trainXs = xs.slice([0, 0], [splitIndex, xs.shape[1]]);
  const trainYs = ys.slice([0, 0], [splitIndex, EMOTION_CLASSES.length]);
  const valXs = xs.slice([splitIndex, 0], [-1, xs.shape[1]]);
  const valYs = ys.slice([splitIndex, 0], [-1, EMOTION_CLASSES.length]);
  xs.dispose();
  ys.dispose();

  // (Re)create classifier to match embedding size
  emotionModelType = 'mobilenet';
  model = createMobileNetClassifier(trainXs.shape[1]);
  saveEmotionMeta({
    type: 'mobilenet',
    imageSize: MOBILENET_IMAGE_SIZE,
    embedding: MOBILENET_EMBEDDING,
    embeddingSize: trainXs.shape[1],
    classes: EMOTION_CLASSES,
    updatedAt: new Date().toISOString()
  });

  const startTime = Date.now();
  console.log(`Training classifier head (MobileNet frozen). Time budget: ${maxMinutes} minutes.`);

  await model.fit(trainXs, trainYs, {
    epochs: 30,
    batchSize: 32,
    validationData: [valXs, valYs],
    verbose: 1,
    callbacks: {
      onEpochEnd: (epoch, logs) => {
        const elapsedMin = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
        const acc = (logs.acc || logs.accuracy) ? ((logs.acc || logs.accuracy) * 100).toFixed(2) : 'N/A';
        const valAcc = (logs.val_acc || logs.val_accuracy) ? ((logs.val_acc || logs.val_accuracy) * 100).toFixed(2) : 'N/A';
        console.log(`[Epoch ${epoch + 1}/30] ${elapsedMin}m acc=${acc}% val_acc=${valAcc}%`);
      },
      onBatchEnd: () => {
        if (Date.now() - startTime > maxMinutes * 60 * 1000) {
          console.log(`\n⏱️  Time budget reached (${maxMinutes} min). Stopping training now.`);
          model.stopTraining = true;
        }
      }
    }
  });

  trainXs.dispose();
  trainYs.dispose();
  valXs.dispose();
  valYs.dispose();

  // Save classifier model
  try {
    const modelsDir = path.join(__dirname, '../../models');
    if (!fs.existsSync(modelsDir)) fs.mkdirSync(modelsDir, { recursive: true });
    if (!fs.existsSync(MODEL_SAVE_PATH)) fs.mkdirSync(MODEL_SAVE_PATH, { recursive: true });

    let normalizedPath = MODEL_SAVE_PATH.replace(/\\/g, '/');
    if (normalizedPath.match(/^[A-Z]:/)) normalizedPath = '/' + normalizedPath;
    const savePath = `file://${normalizedPath}`;
    console.log(`Saving MobileNet-head model to: ${savePath}`);
    if (useNodeBackend) {
      await model.save(savePath);
    } else {
      console.warn('⚠️  Not using Node.js backend - using filesystem save fallback (model.json + weights.bin)');
      await saveLayersModelToFsDir(model, MODEL_SAVE_PATH);
    }
    console.log('✓ Emotion model (MobileNet head) saved successfully');
  } catch (e) {
    console.error('❌ Error saving MobileNet-head model:', e.message);
  }
};

// Analyze handwriting/drawing image
const analyzeHandwriting = async (imagePath, options = {}) => {
  let inputTensor = null;
  try {
    const explainRequested = options?.explain !== false;
    const explainSteps = options?.explainSteps;
    let explain = null;

    // Check if model is trained (has saved weights)
    const modelPath = path.join(MODEL_SAVE_PATH, 'model.json');
    const isTrained = fs.existsSync(modelPath);
    const meta = loadEmotionMeta();
    const trainedType = meta?.type || 'cnn';
    
    if (!isTrained) {
      // Use simple rule-based approach until model is trained
      console.log('⚠️  Model not trained - using simple color/brightness analysis (FALLBACK MODE)');
      console.log('💡 Run "npm run train-models" to train the CNN model for better accuracy');
      console.log(`📁 Looking for model at: ${modelPath}`);
      const result = await simpleEmotionDetection(imagePath);
      console.log(`🔍 Fallback result: ${result.emotion} (${(result.confidence * 100).toFixed(1)}% confidence)`);
      if (explainRequested) {
        result.explain = {
          targetClass: result.emotion,
          targetScore: toFixedMetric(result.confidence),
          method: 'unavailable_model_not_trained',
          explanationMethod: 'unavailable_model_not_trained',
          heatmapPngBase64: null,
          encodedHeatmapPngBase64: null,
          overlayHeatmapPngBase64: null,
          gridOverlayPngBase64: null,
          gridHeatmapPngBase64: null,
          factors: null
        };
      }
      return result;
    }

    // Load trained model
    if (!model) {
      await initializeModel();
    }

    inputTensor = trainedType === 'mobilenet'
      ? await loadImageTensor(imagePath, MOBILENET_IMAGE_SIZE, false)
      : await preprocessImage(imagePath);
    const predictTensor = await getPredictTensorFactory(trainedType);

    let probabilities;
    const prediction = predictTensor(inputTensor);
    probabilities = await prediction.data();
    prediction.dispose();

    // Get emotion with highest probability
    let maxIndex = 0;
    let maxProb = probabilities[0];
    
    for (let i = 1; i < probabilities.length; i++) {
      if (probabilities[i] > maxProb) {
        maxProb = probabilities[i];
        maxIndex = i;
      }
    }

    const emotion = EMOTION_CLASSES[maxIndex];
    const confidence = maxProb;
    
    // Warn if confidence is too low
    if (confidence < 0.4) {
      console.warn(`⚠️  Low confidence (${(confidence * 100).toFixed(1)}%) - Model may need retraining`);
    }

    // Negative emotions (angry, fear, sad) indicate potential weakness
    const isWeak = ['angry', 'fear', 'sad'].includes(emotion) && confidence > 0.6;
    
    const message = isWeak 
      ? `Student shows ${emotion} emotions in their work, which may indicate learning difficulties.`
      : `Student shows ${emotion} emotions in their work.`;

    // Include all probabilities in response for debugging
    const allProbabilities = EMOTION_CLASSES.reduce((acc, emo, idx) => {
      acc[emo] = probabilities[idx];
      return acc;
    }, {});

    if (explainRequested) {
      try {
        const resolvedExplainSteps = Number.isFinite(Number(explainSteps))
          ? Number(explainSteps)
          : (trainedType === 'mobilenet' ? DEFAULT_MOBILENET_IG_STEPS : DEFAULT_IG_STEPS);
        console.log(`Generating explanation...(${trainedType}`);

        const imageBuffer = fs.readFileSync(imagePath);
        const inputSizeForEdits = trainedType === 'mobilenet' ? MOBILENET_IMAGE_SIZE : IMAGE_SIZE;
        explain = await buildExplainabilityPackage({
          tf,
          inputTensor,
          predictTensor,
          imageBuffer,
          targetClassIndex: maxIndex,
          targetClassLabel: emotion,
          targetScore: confidence,
          inputSizeForEdits,
          explainSteps: resolvedExplainSteps
        });

      } catch (explainError) {
        console.warn('Explain mode failed:', explainError.message);
        explain = {
          target_class: emotion,
          target_score: toFixedMetric(confidence),
          method: 'explain_failed',
          explanation_text: `Explanation failed: ${explainError.message}`,
          where_the_model_looked: null,
          what_the_model_used: null
        };
      }
    }

    return {
      emotion,
      confidence,
      isWeak,
      message,
      probabilities: allProbabilities,
      isTrained: isTrained,
      method: trainedType === 'mobilenet' ? 'mobilenet_transfer' : 'cnn',
      warning: !isTrained ? 'Model is not trained - predictions are unreliable' : undefined,
      explain
    };
  } catch (error) {
    console.error('Error analyzing handwriting:', error);
    // Fallback
    return {
      emotion: 'unknown',
      confidence: 0,
      isWeak: false,
      message: 'Unable to analyze image'
    };
  } finally {
    if (inputTensor) inputTensor.dispose();
  }
};

// ============================================
// HANDWRITING RECOGNITION FROM JSON DATA
// ============================================

let handwritingModel = null;
// Enhanced features based on EMOTHAW and handwriting emotion recognition research
// Includes both quality assessment and emotional state indicators
const HANDWRITING_FEATURES = [
  // Basic quality features
  'letter_size', 'letter_spacing', 'line_spacing', 'slant_angle', 
  'pressure', 'stroke_width', 'letter_consistency', 'baseline_alignment',
  'word_spacing', 'letter_formation',
  // EMOTHAW-inspired emotional state features
  'pressure_variation',      // Variation in writing pressure (indicates stress/anxiety)
  'stroke_speed',            // Average stroke speed (faster = more energetic/agitated)
  'pen_lifts',              // Number of pen lifts per word (indicates hesitation)
  'stroke_direction',       // Consistency of stroke direction (0-1)
  'line_stability',         // Stability of baseline (wavy = emotional instability)
  'letter_connectivity',    // How letters connect (0-1, disconnected = anxiety)
  'stroke_intensity',       // Overall stroke intensity (pressure + width)
  'spatial_regularity',    // Regularity of spacing (irregular = emotional state)
  'vertical_extension',     // Vertical extension of letters (tall = confidence/aggression)
  'horizontal_compression' // Horizontal compression (compressed = stress)
];
const HANDWRITING_LABELS = ['poor', 'needs_improvement', 'good', 'excellent'];
// Emotional state labels (can be used alongside quality labels)
const EMOTIONAL_STATES = ['calm', 'anxious', 'agitated', 'focused', 'distracted'];
const HANDWRITING_MODEL_SAVE_PATH = path.join(__dirname, '../../models/handwriting-model');

const getHandwritingTrainMaxMinutes = () => {
  const raw = process.env.HANDWRITING_TRAIN_MAX_MINUTES;
  const parsed = raw ? Number(raw) : 20;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 20;
};

const getHandwritingKFold = () => {
  const raw = process.env.HANDWRITING_K_FOLD;
  const parsed = raw ? Number(raw) : 0;
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
};

const mulberry32 = (seed) => {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

const shuffleInPlace = (arr, seed = 42) => {
  const rand = mulberry32(seed);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

const stratifiedSplitIndices = (labelsIdx, trainRatio = 0.8, seed = 42) => {
  // labelsIdx: number[] where each entry is label index
  const buckets = new Map();
  labelsIdx.forEach((lab, idx) => {
    if (!buckets.has(lab)) buckets.set(lab, []);
    buckets.get(lab).push(idx);
  });

  const trainIdx = [];
  const valIdx = [];
  for (const [lab, idxs] of buckets.entries()) {
    shuffleInPlace(idxs, seed + lab * 1000);
    const nTrain = Math.max(1, Math.floor(idxs.length * trainRatio));
    trainIdx.push(...idxs.slice(0, nTrain));
    valIdx.push(...idxs.slice(nTrain));
  }
  shuffleInPlace(trainIdx, seed + 1);
  shuffleInPlace(valIdx, seed + 2);
  return { trainIdx, valIdx };
};

const gatherRows2d = (tensor2d, indices) => {
  // tf.gather works but keeps it explicit for tfjs compatibility
  const idxTensor = tf.tensor1d(indices, 'int32');
  const gathered = tf.gather(tensor2d, idxTensor);
  idxTensor.dispose();
  return gathered;
};

// Initialize handwriting recognition model (for JSON data)
const initializeHandwritingModel = async () => {
  try {
    // Try to load saved model first
    const modelJsonPath = path.join(HANDWRITING_MODEL_SAVE_PATH, 'model.json');
    if (fs.existsSync(modelJsonPath)) {
      try {
        console.log('Loading saved handwriting model...');
        if (useNodeBackend) {
          let normalizedPath = HANDWRITING_MODEL_SAVE_PATH.replace(/\\/g, '/');
          if (normalizedPath.match(/^[A-Z]:/)) {
            normalizedPath = '/' + normalizedPath;
          }
          handwritingModel = await tf.loadLayersModel(`file://${normalizedPath}/model.json`);
        } else {
          handwritingModel = await loadLayersModelFromFsDir(HANDWRITING_MODEL_SAVE_PATH);
        }
        console.log('Saved handwriting model loaded successfully');
        return;
      } catch (loadError) {
        console.warn('Could not load saved handwriting model, creating new one:', loadError.message);
      }
    }

    // Enhanced neural network optimized for ACCURACY
    // Deeper network with more capacity to capture complex relationships
    handwritingModel = tf.sequential({
      layers: [
        // Input layer - 20 features (enhanced from EMOTHAW research)
        tf.layers.dense({
          inputShape: [HANDWRITING_FEATURES.length],
          units: 256,  // Increased from 128 for better capacity
          activation: 'relu',
          kernelRegularizer: tf.regularizers.l2({ l2: 0.005 })  // Reduced L2 for less overfitting
        }),
        tf.layers.batchNormalization(),
        tf.layers.dropout({ rate: 0.3 }),
        
        // Hidden layer 1
        tf.layers.dense({
          units: 128,  // Increased from 64
          activation: 'relu',
          kernelRegularizer: tf.regularizers.l2({ l2: 0.005 })
        }),
        tf.layers.batchNormalization(),
        tf.layers.dropout({ rate: 0.25 }),
        
        // Hidden layer 2 - additional layer for better accuracy
        tf.layers.dense({
          units: 64,  // Increased from 32
          activation: 'relu',
          kernelRegularizer: tf.regularizers.l2({ l2: 0.005 })
        }),
        tf.layers.batchNormalization(),
        tf.layers.dropout({ rate: 0.2 }),
        
        // Hidden layer 3 - new layer for deeper learning
        tf.layers.dense({
          units: 32,
          activation: 'relu'
        }),
        tf.layers.dropout({ rate: 0.15 }),
        
        // Output layer - quality assessment
        tf.layers.dense({
          units: HANDWRITING_LABELS.length,
          activation: 'softmax'
        })
      ]
    });

    // Enhanced training configuration with lower learning rate for better accuracy
    handwritingModel.compile({
      optimizer: tf.train.adam(0.0005),  // Reduced from 0.001 for finer tuning
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy']
    });

    console.log('Handwriting recognition model initialized (new model - needs training)');
  } catch (error) {
    console.error('Error initializing handwriting recognition model:', error);
  }
};

// Load handwriting data from JSON file
const loadHandwritingData = (jsonFilePath) => {
  try {
    if (!fs.existsSync(jsonFilePath)) {
      console.warn(`Handwriting data file not found: ${jsonFilePath}`);
      return null;
    }

    const jsonData = fs.readFileSync(jsonFilePath, 'utf8');
    const data = JSON.parse(jsonData);

    if (!Array.isArray(data)) {
      throw new Error('JSON data must be an array of handwriting samples');
    }

    console.log(`Loaded ${data.length} handwriting samples from ${jsonFilePath}`);
    return data;
  } catch (error) {
    console.error('Error loading handwriting data:', error);
    return null;
  }
};

// Convert handwriting data to tensors
const prepareHandwritingData = (data) => {
  const features = [];
  const labels = [];
  const labelIndices = [];

  for (const sample of data) {
    if (!sample.features || !sample.label) {
      console.warn('Skipping invalid sample:', sample);
      continue;
    }

    // Extract and normalize features (Z-score normalization based on EMOTHAW)
    // Note: For simplicity, we'll use raw values here, but normalization can be added
    const featureVector = HANDWRITING_FEATURES.map(feature => {
      const value = sample.features[feature];
      if (value === undefined || value === null) {
        console.warn(`Missing feature ${feature} in sample ${sample.id}, using 0`);
        return 0;
      }
      return value;
    });

    features.push(featureVector);

    // One-hot encode label
    const labelIndex = HANDWRITING_LABELS.indexOf(sample.label);
    if (labelIndex === -1) {
      console.warn(`Unknown label "${sample.label}" in sample ${sample.id}, skipping`);
      continue;
    }
    const oneHotLabel = new Array(HANDWRITING_LABELS.length).fill(0);
    oneHotLabel[labelIndex] = 1;
    labels.push(oneHotLabel);
    labelIndices.push(labelIndex);
  }

  return {
    features: tf.tensor2d(features),
    labels: tf.tensor2d(labels),
    labelIndices
  };
};

// Train handwriting model from JSON data
const trainHandwritingModel = async (jsonFilePath) => {
  try {
    console.log('\n=== Training Handwriting Recognition Model from JSON Data ===');
    const maxMinutes = getHandwritingTrainMaxMinutes();
    const kFold = getHandwritingKFold();
    const seed = process.env.HANDWRITING_SEED ? Number(process.env.HANDWRITING_SEED) : 42;
    console.log(`Time budget: ${maxMinutes} minutes`);
    if (kFold > 1) {
      console.log(`Evaluation: ${kFold}-fold cross-validation (note: requires enough data for reliability)`);
    }
    
    // Initialize model if not already initialized
    if (!handwritingModel) {
      await initializeHandwritingModel();
    }

    // Load JSON data
    const data = loadHandwritingData(jsonFilePath);
    if (!data || data.length === 0) {
      throw new Error('No handwriting data found in JSON file');
    }

    console.log(`\nTraining on ${data.length} samples...`);

    // Prepare data
    const { features, labels, labelIndices } = prepareHandwritingData(data);

    if (labelIndices.length < 50) {
      console.warn(`⚠️  Only ${labelIndices.length} usable samples. Any accuracy number is NOT a strong guarantee.`);
      console.warn('   To make results reliable, aim for 200+ samples (balanced across labels).');
    }

    // Stratified split into train/val (more reliable than plain slicing)
    const { trainIdx, valIdx } = stratifiedSplitIndices(labelIndices, 0.8, seed);
    const trainFeatures = gatherRows2d(features, trainIdx);
    const trainLabels = gatherRows2d(labels, trainIdx);
    const valFeatures = gatherRows2d(features, valIdx);
    const valLabels = gatherRows2d(labels, valIdx);

    console.log(`Training set: ${trainIdx.length} samples`);
    console.log(`Validation set: ${valIdx.length} samples`);

    const startTime = Date.now();

    // Enhanced training with early stopping, learning rate scheduling, and better accuracy
    let bestValLoss = Infinity;
    let bestValAcc = 0;
    let bestWeights = null;
    let bestEpoch = -1;
    const patience = 15;
    const minDelta = 1e-4;
    let patienceCounter = 0;
    let earlyStopped = false;
    const baseLearningRate = 0.0005;

    handwritingModel.compile({
      optimizer: tf.train.adam(baseLearningRate),
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy']
    });

    class TimeBudgetCallback extends tf.Callback {
      constructor(start, minutes) {
        super();
        this.start = start;
        this.minutes = minutes;
        this.fired = false;
      }
      async onBatchEnd() {
        if (Date.now() - this.start > this.minutes * 60 * 1000) {
          if (!this.fired) {
            console.log(`⏱️  Time budget reached (${this.minutes} min). Stopping training now.`);
            this.fired = true;
          }
          this.model.stopTraining = true;
        }
      }
    }

    class BestWeightsCallback extends tf.Callback {
      async onEpochEnd(epoch, logs) {
        const safeNum = (v) => {
          if (typeof v === 'number') return v;
          if (v && typeof v.dataSync === 'function') {
            const arr = v.dataSync();
            return arr && arr.length ? arr[0] : NaN;
          }
          const n = Number(v);
          return Number.isFinite(n) ? n : NaN;
        };
        const fmt = (v, digits = 4) => {
          const n = safeNum(v);
          return Number.isFinite(n) ? n.toFixed(digits) : 'N/A';
        };

        const valLossNum = safeNum(logs?.val_loss ?? logs?.valLoss);
        const valAccNum = safeNum(logs?.val_acc ?? logs?.val_accuracy ?? logs?.valAccuracy);
        const currentValLoss = Number.isFinite(valLossNum) ? valLossNum : Infinity;
        const currentValAcc = Number.isFinite(valAccNum) ? valAccNum : 0;

        const improvedLoss = currentValLoss < (bestValLoss - minDelta);
        const improvedAcc = currentValAcc > (bestValAcc + 1e-6);

        if (improvedLoss || improvedAcc) {
          if (improvedLoss) bestValLoss = currentValLoss;
          if (improvedAcc) bestValAcc = currentValAcc;

          if (bestWeights) bestWeights.forEach(w => w.dispose());
          bestWeights = this.model.getWeights().map(w => w.clone());
          bestEpoch = epoch;

          patienceCounter = 0;
        } else {
          patienceCounter++;
          if (!earlyStopped && patienceCounter >= patience) {
            console.log(`Early stopping triggered - no improvement for ${patience} epochs`);
            earlyStopped = true;
            this.model.stopTraining = true;
          }
        }

        const accNum = safeNum(logs?.acc ?? logs?.accuracy);
        const valAccNumOut = currentValAcc;
        const accStr = Number.isFinite(accNum) ? `${(accNum * 100).toFixed(1)}%` : 'N/A';
        const valAccStr = Number.isFinite(valAccNumOut) ? `${(valAccNumOut * 100).toFixed(1)}%` : 'N/A';
        const lossStr = fmt(logs?.loss, 4);
        const valLossStr = fmt(logs?.val_loss, 4);
        console.log(`Epoch ${epoch + 1}/150 - loss: ${lossStr}, acc: ${accStr}, val_loss: ${valLossStr}, val_acc: ${valAccStr}${(improvedLoss || improvedAcc) ? ' ⭐ (best)' : ''}`);
      }
    }
    
    await handwritingModel.fit(trainFeatures, trainLabels, {
      epochs: 150,
      batchSize: 16,  // Increased from 8 for more stable gradients
      validationSplit: 0,
      validationData: [valFeatures, valLabels],
      callbacks: [new TimeBudgetCallback(startTime, maxMinutes), new BestWeightsCallback()]
    });

    // Restore best weights before saving (prevents late-epoch overfitting hurting the saved model)
    if (bestWeights && bestEpoch >= 0) {
      handwritingModel.setWeights(bestWeights);
      console.log(`✓ Restored best weights from epoch ${bestEpoch + 1} (best val_acc ${(bestValAcc * 100).toFixed(1)}%, best val_loss ${bestValLoss.toFixed(4)})`);
    }

    const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    console.log(`\n✓ Handwriting model training completed in ${totalTime} minutes!`);

    // Clean up tensors
    trainFeatures.dispose();
    trainLabels.dispose();
    valFeatures.dispose();
    valLabels.dispose();
    features.dispose();
    labels.dispose();

    // Save the trained model
    try {
      const modelsDir = path.join(__dirname, '../../models');
      if (!fs.existsSync(modelsDir)) {
        fs.mkdirSync(modelsDir, { recursive: true });
      }
      
      if (!fs.existsSync(HANDWRITING_MODEL_SAVE_PATH)) {
        fs.mkdirSync(HANDWRITING_MODEL_SAVE_PATH, { recursive: true });
      }
      
      let normalizedPath = HANDWRITING_MODEL_SAVE_PATH.replace(/\\/g, '/');
      if (normalizedPath.match(/^[A-Z]:/)) {
        normalizedPath = '/' + normalizedPath;
      }
      const savePath = `file://${normalizedPath}`;
      
      console.log(`Saving handwriting model to: ${savePath}`);
      
      if (!useNodeBackend) {
        console.warn('⚠️  Not using Node.js backend - using filesystem save fallback (model.json + weights.bin)');
      }
      
      if (useNodeBackend) {
        await handwritingModel.save(savePath);
      } else {
        await saveLayersModelToFsDir(handwritingModel, HANDWRITING_MODEL_SAVE_PATH);
      }
      console.log(`✓ Handwriting model saved successfully to ${HANDWRITING_MODEL_SAVE_PATH}`);
      
      // Verify the files were created
      const modelJsonPath = path.join(HANDWRITING_MODEL_SAVE_PATH, 'model.json');
      if (fs.existsSync(modelJsonPath)) {
        const stats = fs.statSync(modelJsonPath);
        console.log(`✓ Model file verified: ${modelJsonPath} (${stats.size} bytes)`);
      }
    } catch (saveError) {
      console.error('❌ Error saving handwriting model:', saveError.message);
      console.error('Stack:', saveError.stack);
    }

    console.log('Handwriting recognition model trained successfully');

    // Optional: k-fold evaluation for a more reliable estimate (still not a "guarantee")
    // Note: For very small datasets, this is still noisy.
    if (kFold > 1) {
      try {
        await evaluateHandwritingModelKFold(data, kFold, { seed, maxMinutes });
      } catch (e) {
        console.warn('K-fold evaluation skipped/failed:', e.message);
      }
    }
  } catch (error) {
    console.error('Error training handwriting model:', error);
    throw error;
  }
};

const evaluateHandwritingModelKFold = async (data, k = 5, opts = {}) => {
  const seed = Number.isFinite(opts.seed) ? opts.seed : 42;
  const maxMinutes = Number.isFinite(opts.maxMinutes) ? opts.maxMinutes : 20;
  console.log(`\n=== Handwriting Model ${k}-Fold Evaluation ===`);
  console.log(`Time budget: ${maxMinutes} minutes (total)`);

  const usable = data.filter(s => s?.features && HANDWRITING_LABELS.includes(s?.label));
  if (usable.length < k * 5) {
    console.warn(`⚠️  Too few usable samples (${usable.length}) for meaningful ${k}-fold evaluation.`);
    return;
  }

  const { features, labels, labelIndices } = prepareHandwritingData(usable);
  const n = labelIndices.length;
  const indices = Array.from({ length: n }, (_, i) => i);
  shuffleInPlace(indices, seed);

  const foldSize = Math.floor(n / k);
  const foldAccs = [];
  const startAll = Date.now();

  for (let fold = 0; fold < k; fold++) {
    if (Date.now() - startAll > maxMinutes * 60 * 1000) {
      console.log(`⏱️  Time budget reached during k-fold. Stopping at fold ${fold}/${k}.`);
      break;
    }

    const start = fold * foldSize;
    const end = fold === k - 1 ? n : (fold + 1) * foldSize;
    const valIdx = indices.slice(start, end);
    const trainIdx = indices.slice(0, start).concat(indices.slice(end));

    // fresh model each fold
    const foldModel = tf.sequential({
      layers: [
        tf.layers.dense({
          inputShape: [HANDWRITING_FEATURES.length],
          units: 256,
          activation: 'relu',
          kernelRegularizer: tf.regularizers.l2({ l2: 0.005 })
        }),
        tf.layers.batchNormalization(),
        tf.layers.dropout({ rate: 0.3 }),
        tf.layers.dense({
          units: 128,
          activation: 'relu',
          kernelRegularizer: tf.regularizers.l2({ l2: 0.005 })
        }),
        tf.layers.batchNormalization(),
        tf.layers.dropout({ rate: 0.25 }),
        tf.layers.dense({
          units: 64,
          activation: 'relu',
          kernelRegularizer: tf.regularizers.l2({ l2: 0.005 })
        }),
        tf.layers.batchNormalization(),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ units: 32, activation: 'relu' }),
        tf.layers.dropout({ rate: 0.15 }),
        tf.layers.dense({ units: HANDWRITING_LABELS.length, activation: 'softmax' })
      ]
    });
    foldModel.compile({
      optimizer: tf.train.adam(0.0005),
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy']
    });

    const xTrain = gatherRows2d(features, trainIdx);
    const yTrain = gatherRows2d(labels, trainIdx);
    const xVal = gatherRows2d(features, valIdx);
    const yVal = gatherRows2d(labels, valIdx);

    let bestValAcc = 0;
    let patience = 8;
    let patienceCounter = 0;
    const fitStart = Date.now();

    await foldModel.fit(xTrain, yTrain, {
      epochs: 60,
      batchSize: 16,
      validationData: [xVal, yVal],
      verbose: 0,
      callbacks: {
        onEpochEnd: function (epoch, logs) {
          const valAcc = logs.val_acc || logs.val_accuracy || 0;
          if (valAcc > bestValAcc + 1e-6) {
            bestValAcc = valAcc;
            patienceCounter = 0;
          } else {
            patienceCounter++;
            if (patienceCounter >= patience) this.model.stopTraining = true;
          }
          if (Date.now() - startAll > maxMinutes * 60 * 1000) this.model.stopTraining = true;
          if (Date.now() - fitStart > Math.max(1, maxMinutes / k) * 60 * 1000) this.model.stopTraining = true;
        }
      }
    });

    foldAccs.push(bestValAcc);
    console.log(`Fold ${fold + 1}/${k}: best val_acc ${(bestValAcc * 100).toFixed(1)}%`);

    xTrain.dispose(); yTrain.dispose(); xVal.dispose(); yVal.dispose();
    foldModel.dispose();
  }

  features.dispose();
  labels.dispose();

  if (foldAccs.length > 0) {
    const mean = foldAccs.reduce((a, b) => a + b, 0) / foldAccs.length;
    const variance = foldAccs.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / foldAccs.length;
    const std = Math.sqrt(variance);
    console.log(`\nK-fold summary (${foldAccs.length} folds): mean ${(mean * 100).toFixed(1)}% ± ${(std * 100).toFixed(1)}%`);
    if (usable.length < 200) {
      console.warn('⚠️  Still not a strong guarantee: dataset is small. Add more labeled samples for reliability.');
    }
  }
};

// Analyze handwriting from feature data
const analyzeHandwritingFromFeatures = async (features) => {
  try {
    if (!handwritingModel) {
      await initializeHandwritingModel();
    }

    // Check if model is trained
    const modelJsonPath = path.join(HANDWRITING_MODEL_SAVE_PATH, 'model.json');
    const isTrained = fs.existsSync(modelJsonPath);

    if (!isTrained) {
      return {
        label: 'unknown',
        confidence: 0,
        message: 'Handwriting model not trained yet. Please train the model first.',
        requiresTraining: true
      };
    }

    // Prepare feature vector
    const featureVector = HANDWRITING_FEATURES.map(feature => {
      const value = features[feature];
      if (value === undefined || value === null) {
        return 0;
      }
      return value;
    });

    const inputTensor = tf.tensor2d([featureVector]);
    const prediction = handwritingModel.predict(inputTensor);
    const probabilities = await prediction.data();

    inputTensor.dispose();
    prediction.dispose();

    // Get label with highest probability
    let maxIndex = 0;
    let maxProb = probabilities[0];
    
    for (let i = 1; i < probabilities.length; i++) {
      if (probabilities[i] > maxProb) {
        maxProb = probabilities[i];
        maxIndex = i;
      }
    }

    const label = HANDWRITING_LABELS[maxIndex];
    const confidence = maxProb;

    // Map label to quality assessment
    const qualityMap = {
      'poor': { grade: 'F', needs_help: true, message: 'Handwriting needs significant improvement' },
      'needs_improvement': { grade: 'C', needs_help: true, message: 'Handwriting needs improvement' },
      'good': { grade: 'B', needs_help: false, message: 'Good handwriting quality' },
      'excellent': { grade: 'A', needs_help: false, message: 'Excellent handwriting quality' }
    };

    const assessment = qualityMap[label] || { grade: 'N/A', needs_help: false, message: 'Unable to assess' };

    return {
      label,
      confidence,
      grade: assessment.grade,
      needs_help: assessment.needs_help,
      message: assessment.message,
      probabilities: HANDWRITING_LABELS.reduce((acc, lbl, idx) => {
        acc[lbl] = probabilities[idx];
        return acc;
      }, {})
    };
  } catch (error) {
    console.error('Error analyzing handwriting from features:', error);
    return {
      label: 'unknown',
      confidence: 0,
      message: 'Error analyzing handwriting',
      error: error.message
    };
  }
};

// Initialize model on module load
initializeModel();
initializeHandwritingModel();

module.exports = {
  initializeModel,
  trainModel,
  analyzeHandwriting,
  // analyzeHandwritingExplain,
  // Handwriting recognition from JSON
  initializeHandwritingModel,
  trainHandwritingModel,
  analyzeHandwritingFromFeatures,
  loadHandwritingData
};
