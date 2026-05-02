#!/usr/bin/env node

/**
 * TensorFlow.js Performance Optimization Analyzer
 * Provides recommendations to speed up inference
 * Run with: node scripts/optimizeTensorFlow.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('TensorFlow.js Performance Optimization Analyzer');
console.log('═══════════════════════════════════════════════════════════════\n');

// Load environment configuration
const envPath = path.join(__dirname, '..', '.env');
const env = {};
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && key.trim() && !key.startsWith('#')) {
      env[key.trim()] = valueParts.join('=').trim();
    }
  });
}

// Analyze system
console.log('📊 System Analysis:\n');
const totalMem = os.totalmem();
const freeMem = os.freemem();
const cpuCount = os.cpus().length;
const platform = os.platform();

console.log(`  CPU: ${os.cpus()[0].model}`);
console.log(`  Cores: ${cpuCount}`);
console.log(`  Total RAM: ${Math.round(totalMem / 1024 / 1024 / 1024)}GB`);
console.log(`  Free RAM: ${Math.round(freeMem / 1024 / 1024 / 1024)}GB`);
console.log(`  Platform: ${platform} (${os.arch()})\n`);

// Analyze TensorFlow setup
console.log('🔧 TensorFlow Setup Analysis:\n');

let tfSetup = {
  nativeBindings: false,
  warnings: [],
  recommendations: []
};

try {
  const { initializeTensorFlow, getBackendInfo } = require('../ml/tfInitializer');
  const { backendInfo } = initializeTensorFlow({ silent: true });
  
  if (backendInfo.useNodeBindings) {
    console.log('  ✓ Native bindings: ENABLED');
    tfSetup.nativeBindings = true;
  } else {
    console.log('  ✗ Native bindings: DISABLED');
    tfSetup.warnings.push('Native bindings not loaded - inference is 10-50x slower');
    tfSetup.recommendations.push('Install native bindings: npm install --build-from-source @tensorflow/tfjs-node');
  }
} catch (error) {
  console.log('  ? Could not determine TensorFlow setup');
}

console.log('\n');

// Analyze environment variables
console.log('📝 Environment Configuration:\n');

const recommendedEnv = {
  'TF_CPP_MIN_LOG_LEVEL': { current: env.TF_CPP_MIN_LOG_LEVEL || 'not set', recommended: '2', priority: 'HIGH' },
  'TF_FORCE_GPU_ALLOW_GROWTH': { current: env.TF_FORCE_GPU_ALLOW_GROWTH || 'not set', recommended: 'true', priority: 'MEDIUM' },
  'NODE_OPTIONS': { current: env.NODE_OPTIONS || 'not set', recommended: '--max-old-space-size=4096 (or higher)', priority: 'HIGH' }
};

let envIssuesCount = 0;
Object.entries(recommendedEnv).forEach(([key, config]) => {
  const current = config.current;
  const isOptimal = current !== 'not set' && current === config.recommended;
  const icon = isOptimal ? '✓' : '⚠';
  console.log(`  ${icon} ${key}`);
  console.log(`    Current: ${current}`);
  console.log(`    Recommended: ${config.recommended}`);
  console.log(`    Priority: ${config.priority}`);
  if (!isOptimal) envIssuesCount++;
  console.log('');
});

// Batch processing optimization
console.log('⚡ Code Optimization Opportunities:\n');

const codeAnalysis = {
  'Batch Processing': {
    potential: '5-20x faster',
    effort: 'Medium',
    description: 'Process multiple images together instead of one-by-one'
  },
  'Model Quantization': {
    potential: '2-4x faster',
    effort: 'Low',
    description: 'Reduce model size and increase inference speed'
  },
  'Inference Caching': {
    potential: '10-100x for repeats',
    effort: 'Low',
    description: 'Cache results for identical inputs (duplicate images)'
  },
  'Reduce IG Steps': {
    potential: '6-24x faster',
    effort: 'Low',
    description: 'Use fewer steps (4-8) for fast mode, 12-24 for accurate'
  },
  'Lazy Model Loading': {
    potential: '30-50% startup faster',
    effort: 'Low',
    description: 'Load models on-demand instead of at server start'
  }
};

Object.entries(codeAnalysis).forEach(([optimization, details]) => {
  console.log(`  📈 ${optimization}`);
  console.log(`    Speedup: ${details.potential}`);
  console.log(`    Effort: ${details.effort}`);
  console.log(`    ${details.description}`);
  console.log('');
});

// Hardware recommendations
console.log('💻 Hardware Recommendations:\n');

if (cpuCount < 4) {
  console.log('  ⚠ CPU cores are limited. For production:');
  console.log('    - Use at least 4 cores for parallel processing');
  console.log('    - Consider cloud VM with more cores\n');
}

if (totalMem < 8 * 1024 * 1024 * 1024) {
  console.log('  ⚠ RAM is limited. For production:');
  console.log('    - Use at least 8GB RAM for optimal performance');
  console.log('    - Current: ' + Math.round(totalMem / 1024 / 1024 / 1024) + 'GB\n');
}

if (!tfSetup.nativeBindings) {
  console.log('  ✓ GPU accelerator would provide 50-200x speedup');
  console.log('    - NVIDIA GPU with CUDA support recommended');
  console.log('    - Azure offers GPU VMs / Azure Container Instances\n');
}

// Generate .env optimization
console.log('🚀 Recommended .env Configuration:\n');

const recommendedEnvContent = `# TensorFlow.js Optimization
TF_CPP_MIN_LOG_LEVEL=2
TF_FORCE_GPU_ALLOW_GROWTH=true
NODE_OPTIONS=--max-old-space-size=4096

# For high-load production:
# NODE_OPTIONS=--max-old-space-size=8192

# For GPU (if available):
# TF_FORCE_GPU_ALLOW_GROWTH=true
`;

console.log('  Add to .env:');
recommendedEnvContent.split('\n').forEach(line => {
  if (line.trim()) console.log(`    ${line}`);
});

// Summary and action items
console.log('\n');
console.log('📋 Summary & Action Items:\n');

let actionItems = [];

if (!tfSetup.nativeBindings) {
  actionItems.push({
    priority: 'CRITICAL',
    action: 'Install native bindings',
    command: 'npm install --build-from-source @tensorflow/tfjs-node',
    speedup: '10-50x'
  });
}

if (envIssuesCount > 0) {
  actionItems.push({
    priority: 'HIGH',
    action: 'Update .env file',
    description: 'Copy recommended configuration to .env',
    speedup: '10-20%'
  });
}

if (cpuCount < 4) {
  actionItems.push({
    priority: 'MEDIUM',
    action: 'Upgrade hardware/VM',
    description: 'Use VM with 4+ CPU cores',
    speedup: '2-4x'
  });
}

actionItems.push({
  priority: 'MEDIUM',
  action: 'Implement batch processing',
  description: 'Update inference to process multiple images',
  speedup: '5-20x'
});

actionItems.forEach((item, idx) => {
  console.log(`  ${idx + 1}. [${item.priority}] ${item.action}`);
  if (item.command) console.log(`     Command: ${item.command}`);
  if (item.description) console.log(`     ${item.description}`);
  if (item.speedup) console.log(`     Speedup: ${item.speedup}`);
  console.log('');
});

// Expected improvements
console.log('⏱ Expected Performance Improvement:\n');

const baslineTime = 80; // 4 IG steps in JS
let improvedTime = baslineTime;
let improvements = [];

if (tfSetup.nativeBindings) {
  improvedTime *= 0.1; // 10x speedup
  improvements.push('Native bindings (10x)');
}

improvedTime *= 0.9; // 10% from env optimization
improvements.push('Env optimization (10%)');

// If batch processing implemented
const withBatch = improvedTime * 0.25; // 4x speedup with batching

console.log(`  Current: ~${baslineTime}s for 4 IG steps`);
console.log(`  After step 1+2: ~${Math.round(improvedTime)}s (${improvements.join(' + ')})`);
console.log(`  With batching: ~${Math.round(withBatch)}s (additional 4x)\n`);

console.log('═══════════════════════════════════════════════════════════════\n');

process.exit(0);
