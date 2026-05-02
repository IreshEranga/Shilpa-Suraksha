#!/usr/bin/env node

/**
 * Diagnostic script to check TensorFlow.js setup and native binding status
 * Run with: node scripts/diagnoseTensorFlow.js
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

const LINE = '='.repeat(63);

function checkPackage(pkgName) {
  try {
    const pkgEntryPath = require.resolve(pkgName);
    const pkgJsonPath = require.resolve(`${pkgName}/package.json`);
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    return {
      installed: true,
      version: pkgJson.version,
      location: path.dirname(pkgEntryPath)
    };
  } catch (_error) {
    return { installed: false };
  }
}

function hasWindowsCppBuildTools() {
  if (os.platform() !== 'win32') {
    return null;
  }

  try {
    const vsWherePath = 'C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer\\vswhere.exe';
    if (!fs.existsSync(vsWherePath)) {
      return false;
    }

    const output = execSync(
      `"${vsWherePath}" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();

    return Boolean(output);
  } catch (_error) {
    return false;
  }
}

function makeNormalTensor(tf, shape) {
  if (typeof tf.randomNormal === 'function') {
    return tf.randomNormal(shape);
  }
  if (typeof tf.randn === 'function') {
    return tf.randn(shape);
  }
  throw new Error('No Gaussian random tensor function found (randomNormal/randn).');
}

console.log(`\n${LINE}`);
console.log('TensorFlow.js Setup Diagnostic Test');
console.log(`${LINE}\n`);

console.log('System Information:');
console.log(`  Platform: ${os.platform()} (${os.arch()})`);
console.log(`  Node.js: ${process.version}`);
console.log(`  N-API: ${process.versions.napi || 'unknown'}`);
console.log(`  CPU Cores: ${os.cpus().length}`);
console.log(`  Memory: ${Math.round(os.totalmem() / 1024 / 1024 / 1024)}GB\n`);

console.log('Package Installation Status:\n');

const packageNames = [
  '@tensorflow/tfjs',
  '@tensorflow/tfjs-node',
  '@tensorflow-models/mobilenet'
];

for (const pkgName of packageNames) {
  const pkg = checkPackage(pkgName);
  if (pkg.installed) {
    console.log(`  OK ${pkgName}@${pkg.version}`);
    console.log(`    Location: ${pkg.location}`);
  } else {
    console.log(`  MISSING ${pkgName}`);
    if (pkgName === '@tensorflow/tfjs-node') {
      console.log('    Fix: npm install @tensorflow/tfjs-node');
    }
  }
}

console.log('\nTensorFlow Backend Test:\n');

let tf;
let backendName = 'unknown';
let useNodeBindings = false;
let nativeBindingError = null;

try {
  tf = require('@tensorflow/tfjs-node');
  useNodeBindings = true;
  backendName = tf.backend().constructor.name;
  console.log('  OK @tensorflow/tfjs-node loaded successfully');
  console.log(`    Backend: ${backendName}`);
} catch (error) {
  nativeBindingError = error;
  console.log('  FAIL @tensorflow/tfjs-node native bindings NOT loaded');
  console.log(`    Reason: ${error.message}`);
  console.log('    Fallback: using @tensorflow/tfjs CPU backend (slower)\n');

  try {
    tf = require('@tensorflow/tfjs');
    backendName = tf.backend().constructor.name;
    console.log(`    Fallback Backend: ${backendName}`);
  } catch (fallbackError) {
    console.log(`  FAIL Could not load @tensorflow/tfjs either: ${fallbackError.message}`);
    process.exit(1);
  }
}

console.log('\nPerformance Test:\n');

try {
  const startTime = Date.now();

  const a = makeNormalTensor(tf, [512, 512]);
  const b = makeNormalTensor(tf, [512, 512]);

  const result = tf.matMul(a, b);
  result.dataSync(); // Force compute

  const durationMs = Date.now() - startTime;

  a.dispose();
  b.dispose();
  result.dispose();

  if (useNodeBindings) {
    console.log(`  OK Matrix multiplication (512x512): ${durationMs}ms (native binding)`);
  } else {
    console.log(`  WARN Matrix multiplication (512x512): ${durationMs}ms (JavaScript backend)`);
  }
} catch (error) {
  console.log(`  FAIL Performance test failed: ${error.message}`);
}

console.log('\nRecommendations:\n');

if (useNodeBindings) {
  console.log('  OK TensorFlow.js is running with native bindings.');
  console.log('    Inference speed should be near-optimal for CPU.\n');
} else {
  console.log('  WARN TensorFlow.js is running in JavaScript fallback mode.');
  console.log('    This is usually 10-50x slower for heavier inference workloads.\n');

  if (os.platform() === 'win32') {
    const nodeMajor = Number(process.version.replace(/^v/, '').split('.')[0]);
    const hasVsTools = hasWindowsCppBuildTools();

    console.log('  Windows fix checklist:');
    console.log('  1. Install Visual Studio 2022 Build Tools');
    console.log('     Include workload: "Desktop development with C++"');
    if (hasVsTools === false) {
      console.log('     Status on this machine: NOT DETECTED');
    } else if (hasVsTools === true) {
      console.log('     Status on this machine: detected');
    }
    console.log('  2. Point npm/node-gyp to Python 3.12+');
    console.log('     npm config set python "C:\\Program Files\\Python312\\python.exe"');
    console.log('  3. Rebuild native addon');
    console.log('     npm rebuild @tensorflow/tfjs-node --build-addon-from-source');

    if (nodeMajor >= 22) {
      console.log('  4. If build still fails on Node 22, test on Node 20 LTS');
      console.log('     nvm use 20');
      console.log('     npm ci');
      console.log('     npm rebuild @tensorflow/tfjs-node --build-addon-from-source');
    }

    if (nativeBindingError && /tfjs_binding\\.node/.test(nativeBindingError.message)) {
      console.log('  Note: tfjs_binding.node is missing, so the addon never finished building.');
    }
    console.log('');
  } else if (os.platform() === 'darwin') {
    console.log('  macOS fix checklist:');
    console.log('  1. xcode-select --install');
    console.log('  2. npm rebuild @tensorflow/tfjs-node --build-addon-from-source\n');
  } else if (os.platform() === 'linux') {
    console.log('  Linux fix checklist:');
    console.log('  1. sudo apt-get update && sudo apt-get install -y build-essential python3');
    console.log('  2. npm rebuild @tensorflow/tfjs-node --build-addon-from-source\n');
  }
}

console.log('Current TensorFlow-related environment variables:');
for (const varName of ['TF_CPP_MIN_LOG_LEVEL', 'TF_FORCE_GPU_ALLOW_GROWTH', 'CUDA_VISIBLE_DEVICES']) {
  if (process.env[varName]) {
    console.log(`  ${varName}=${process.env[varName]}`);
  }
}

console.log('\nRecommended production baseline (.env):');
console.log('  TF_CPP_MIN_LOG_LEVEL=2');
console.log('  NODE_OPTIONS=--max-old-space-size=4096');

console.log(`\n${LINE}\n`);
process.exit(0);