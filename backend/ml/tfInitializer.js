/**
 * TensorFlow.js Initialization Manager
 * Handles loading TensorFlow with proper backend selection and diagnostics
 */

let tf = null;
let backendInfo = {
  name: 'unknown',
  useNodeBindings: false,
  initialized: false,
  error: null
};

/**
 * Initialize TensorFlow.js with native bindings if available
 * @param {Object} options - Configuration options
 * @param {boolean} options.verbose - Enable detailed logging
 * @param {boolean} options.silent - Suppress all logging
 * @returns {Object} TensorFlow instance and backend info
 */
const initializeTensorFlow = (options = {}) => {
  const { verbose = process.env.TF_VERBOSE === 'true', silent = false } = options;

  if (tf && backendInfo.initialized) {
    if (verbose && !silent) {
      console.log('[TF] TensorFlow already initialized with backend:', backendInfo.name);
    }
    return { tf, backendInfo };
  }

  const log = silent ? () => {} : console.log.bind(console);
  const warn = silent ? () => {} : console.warn.bind(console);
  const logError = silent ? () => {} : console.error.bind(console);

  try {
    // Attempt to load native binding first
    try {
      if (!silent) log('[TF] Loading TensorFlow.js with native bindings...');
      
      tf = require('@tensorflow/tfjs-node');
      backendInfo.useNodeBindings = true;
      backendInfo.name = 'CPU-Native';
      backendInfo.initialized = true;
      backendInfo.error = null;
      
      if (!silent) {
        log('✓ [TF] Native bindings loaded successfully');
        if (verbose) {
          const backend = tf.backend();
          log(`    Backend type: ${backend.constructor.name}`);
          const memInfo = tf.memory();
          log(`    Memory: ${Math.round(memInfo.numTensors)} tensors, ${Math.round(memInfo.numBytes / 1024 / 1024)}MB`);
        }
      }
    } catch (nativeError) {
      // Fallback to CPU JavaScript backend
      if (!silent) {
        warn('[TF] Native bindings not available, using JavaScript backend');
        if (verbose) {
          warn(`    Reason: ${nativeError.message}`);
          warn('    This will be ~10-50x slower for inference');
          warn('    To fix: Run: npm install --build-from-source @tensorflow/tfjs-node');
        }
      }

      tf = require('@tensorflow/tfjs');
      backendInfo.useNodeBindings = false;
      backendInfo.name = 'CPU-JavaScript';
      backendInfo.initialized = true;
      backendInfo.error = nativeError.message;
    }

    // Set environment for better performance
    if (process.env.TF_CPP_MIN_LOG_LEVEL === undefined) {
      process.env.TF_CPP_MIN_LOG_LEVEL = '2'; // Reduce TensorFlow logging
    }

    return { tf, backendInfo };
  } catch (initError) {
    backendInfo.initialized = false;
    backendInfo.error = initError.message;
    logError(`[TF] Failed to initialize TensorFlow.js: ${initError.message}`);
    throw initError;
  }
};

/**
 * Get TensorFlow instance (lazy initialization)
 * @returns {Object} TensorFlow instance
 */
const getTensorFlow = () => {
  if (!tf) {
    throw new Error(
      'TensorFlow.js not initialized. Call initializeTensorFlow() first. ' +
      'Alternatively, require this module and access tf via getTensorFlow().'
    );
  }
  return tf;
};

/**
 * Get current backend information
 * @returns {Object} Backend info object
 */
const getBackendInfo = () => {
  return { ...backendInfo };
};

/**
 * Get memory usage statistics
 * @returns {Object} Memory info
 */
const getMemoryInfo = () => {
  if (!tf) return null;
  
  const memInfo = tf.memory();
  return {
    numTensors: memInfo.numTensors,
    numDataBuffers: memInfo.numDataBuffers,
    numBytes: memInfo.numBytes,
    unreliable: memInfo.unreliable,
    formattedBytes: formatBytes(memInfo.numBytes)
  };
};

/**
 * Clean up and dispose all tensors
 */
const cleanup = () => {
  if (tf) {
    const disposed = tf.disposeVariables();
    console.log(`[TF] Disposed ${disposed} variables`);
  }
};

/**
 * Format bytes to human readable format
 * @param {number} bytes - Number of bytes
 * @returns {string} Formatted string
 */
const formatBytes = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

module.exports = {
  initializeTensorFlow,
  getTensorFlow,
  getBackendInfo,
  getMemoryInfo,
  cleanup,
  formatBytes
};
