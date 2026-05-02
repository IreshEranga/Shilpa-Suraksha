const tfInitializer = require('./tfInitializer');
const { tf: tfInstance, backendInfo } = tfInitializer.initializeTensorFlow({ silent: true });
const tf = tfInstance;

if (!backendInfo.useNodeBindings) {
  console.warn('⚠ WARNING: render.js requires @tensorflow/tfjs-node for PNG encoding.');
  console.warn('  Heatmap rendering will be unavailable. Fix: npm install --build-from-source @tensorflow/tfjs-node');
}

async function heatmapToPngBase64(heatmap01) {
  const pngTensor = tf.tidy(() =>
    heatmap01.mul(255).clipByValue(0, 255).toInt().expandDims(-1) 
  );
  const buf = await tf.node.encodePng(pngTensor);
  pngTensor.dispose();
  return buf.toString('base64');
}

module.exports = { heatmapToPngBase64 };