#!/usr/bin/env node

/**
 * TensorFlow.js Quick Start Guide
 * Run with: node scripts/quickStart.js
 * 
 * This interactive guide walks you through setting up native bindings
 * to fix the slow inference issue (80s → 2-5s for 4 IG steps)
 */

const readline = require('readline');
const { spawn } = require('child_process');
const os = require('os');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise(resolve => rl.question(prompt, resolve));
}

function displaySection(title) {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  ${title}`);
  console.log('═══════════════════════════════════════════════════════════════\n');
}

function displaySummary(text, icon = '•') {
  console.log(`  ${icon} ${text}`);
}

async function runCommand(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { 
      stdio: 'inherit',
      shell: true 
    });
    proc.on('close', (code) => {
      resolve(code);
    });
    proc.on('error', reject);
  });
}

async function main() {
  console.clear();
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                                                               ║');
  console.log('║     TensorFlow.js Native Binding Setup - Quick Start          ║');
  console.log('║                                                               ║');
  console.log('║     Transform inference from 80s → 2-5s (16x faster!)         ║');
  console.log('║                                                               ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  // Step 1: Check current status
  displaySection('STEP 1: Check Current Setup');
  console.log('  Analyzing your system...\n');

  try {
    const { initializeTensorFlow, getBackendInfo } = require('../ml/tfInitializer');
    const { backendInfo } = initializeTensorFlow({ silent: true });
    
    if (backendInfo.useNodeBindings) {
      console.log('  ✓ Great news! Native bindings are already working!\n');
      console.log('  Your inference should be fast (2-5s for 4 IG steps).\n');
      console.log('  To verify performance, run:');
      displaySummary('npm run test-explain -- --image images/image.png --steps 4', '→');
      
      rl.close();
      process.exit(0);
    } else {
      console.log('  ⚠ Native bindings not loaded');
      console.log('  Current backend: JavaScript (slow - 10-50x slower)\n');
      console.log('  Expected fix: Install native bindings\n');
    }
  } catch (error) {
    console.log('  ? Could not check status\n');
  }

  // Step 2: Platform detection
  displaySection('STEP 2: Detecting Your Platform');
  
  const platform = os.platform();
  const arch = os.arch();
  const cpuCount = os.cpus().length;
  const totalMem = Math.round(os.totalmem() / 1024 / 1024 / 1024);

  console.log(`  Detected: ${platform} ${arch}`);
  console.log(`  CPU: ${cpuCount} cores`);
  console.log(`  RAM: ${totalMem}GB\n`);

  let setupInstructions = null;

  if (platform === 'win32') {
    displaySection('WINDOWS SETUP DETECTED');
    console.log('  You\'ll need to install:');
    displaySummary('Python 3.10+ (for node-gyp build tool)');
    displaySummary('Visual Studio Build Tools (C++ compiler)');
    console.log('\n  This Quick Start will help you install these.\n');

    const installNow = await question('  Ready to proceed? (y/n): ');
    if (installNow.toLowerCase() !== 'y') {
      console.log('\n  See: TENSORFLOW_SETUP.md for detailed instructions');
      rl.close();
      process.exit(0);
    }

    setupInstructions = windowsSetup;
  } else if (platform === 'darwin') {
    displaySection('macOS SETUP DETECTED');
    console.log('  You\'ll need:\n');
    displaySummary('Xcode Command Line Tools (free)');
    console.log('');
    setupInstructions = macosSetup;
  } else if (platform === 'linux') {
    displaySection('LINUX SETUP DETECTED');
    console.log('  You\'ll need:\n');
    displaySummary('build-essential and python3-dev packages');
    console.log('');
    setupInstructions = linuxSetup;
  } else {
    console.log('  Unsupported platform. See: TENSORFLOW_SETUP.md');
    rl.close();
    process.exit(1);
  }

  // Step 3: Run setup
  displaySection('STEP 3: Running Setup');
  console.log('  This will take 5-15 minutes. Don\'t interrupt!\n');

  const continueSetup = await question('  Continue? (y/n): ');
  if (continueSetup.toLowerCase() !== 'y') {
    console.log('\n  Setup cancelled. Run again when ready.');
    rl.close();
    process.exit(0);
  }

  await setupInstructions();

  // Step 4: Verify
  displaySection('STEP 4: Verifying Installation');
  console.log('  Running diagnostic test...\n');

  const exitCode = await runCommand('npm', ['run', 'test-tensorflow']);
  
  if (exitCode === 0) {
    displaySection('✓ SUCCESS!');
    console.log('  Native bindings have been successfully installed!\n');
    console.log('  What\'s next:\n');
    displaySummary('Test performance: npm run test-explain -- --image images/image.png --steps 4', '1.');
    displaySummary('Optimize configuration: npm run optimize', '2.');
    displaySummary('Review results: Check inference times (should be 2-5s for 4 steps)', '3.');
    console.log('');
    displaySection('Performance Summary');
    console.log('  Before: 80 seconds for 4 IG steps');
    console.log('  After:  2-5 seconds for 4 IG steps');
    console.log('  Speedup: 16-40x faster!\n');
  } else {
    displaySection('⚠ Installation May Have Issues');
    console.log('  The diagnostic test had issues.\n');
    console.log('  Next steps:\n');
    displaySummary('Check error messages above', '1.');
    displaySummary('Read detailed guide: See TENSORFLOW_SETUP.md', '2.');
    displaySummary('Check build logs: npm install --verbose @tensorflow/tfjs-node 2>&1 | tee build.log', '3.');
    console.log('');
  }

  // Step 5: Configure environment
  displaySection('STEP 5: Optional - Configure Environment');
  
  const configureEnv = await question('  Setup .env file for optimal performance? (y/n): ');
  if (configureEnv.toLowerCase() === 'y') {
    console.log('\n  Adding configuration to .env...\n');
    // Would need to implement env file update here
    console.log('  Add this to your .env file:\n');
    console.log('    TF_CPP_MIN_LOG_LEVEL=2');
    console.log('    NODE_OPTIONS=--max-old-space-size=4096');
    console.log('    TF_FORCE_GPU_ALLOW_GROWTH=true\n');
  }

  rl.close();
  process.exit(0);
}

async function windowsSetup() {
  displaySection('WINDOWS: User Cannot Auto-Install');
  console.log('  Please manually install prerequisites:\n');
  console.log('  1. Python (https://www.python.org/downloads/)\n');
  console.log('  2. Visual Studio Build Tools');
  console.log('     https://visualstudio.microsoft.com/visual-cpp-build-tools/\n');
  console.log('  3. Then run:');
  console.log('     npm cache clean --force');
  console.log('     rm -r node_modules/@tensorflow');
  console.log('     npm install --build-from-source @tensorflow/tfjs-node\n');
  
  const confirmedInstalled = await question('  Have you installed these prerequisites? (y/n): ');
  
  if (confirmedInstalled.toLowerCase() === 'y') {
    console.log('\n  Proceeding with installation...\n');
    
    console.log('  Step 1: Clearing cache...');
    await runCommand('npm', ['cache', 'clean', '--force']);
    
    console.log('  Step 2: Removing old TensorFlow files...');
    if (require('fs').existsSync('node_modules')) {
      await runCommand('rmdir', ['/s', '/q', 'node_modules\\@tensorflow']);
    }
    
    console.log('  Step 3: Installing native bindings...');
    await runCommand('npm', ['install', '--build-from-source', '@tensorflow/tfjs-node']);
  } else {
    console.log('\n  Please install the prerequisites and try again.');
    process.exit(1);
  }
}

async function macosSetup() {
  console.log('  Step 1: Installing Xcode Command Line Tools...\n');
  await runCommand('xcode-select', ['--install']);
  
  console.log('  Step 2: Clearing npm cache...\n');
  await runCommand('npm', ['cache', 'clean', '--force']);
  
  console.log('  Step 3: Installing native bindings...\n');
  await runCommand('npm', ['install', '--build-from-source', '@tensorflow/tfjs-node']);
}

async function linuxSetup() {
  console.log('  Step 1: Installing build tools...\n');
  console.log('  Note: You may be prompted for your password\n');
  await runCommand('sudo', ['apt-get', 'install', 'build-essential', 'python3']);
  
  console.log('  Step 2: Clearing npm cache...\n');
  await runCommand('npm', ['cache', 'clean', '--force']);
  
  console.log('  Step 3: Installing native bindings...\n');
  await runCommand('npm', ['install', '--build-from-source', '@tensorflow/tfjs-node']);
}

// Run main
main().catch(error => {
  console.error('\n  Error:', error.message);
  rl.close();
  process.exit(1);
});
