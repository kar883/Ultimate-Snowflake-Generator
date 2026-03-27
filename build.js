#!/usr/bin/env node

/**
 * Simple build helper script
 * Runs the build and package process with proper output
 */

const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const isWindows = process.platform === 'win32';
const projectRoot = __dirname;

async function runCommand(cmd, label) {
  return new Promise((resolve, reject) => {
    console.log(`\n[*] ${label}...`);
    console.log(`    Running: ${cmd}`);
    
    const proc = exec(cmd, { cwd: projectRoot }, (error, stdout, stderr) => {
      if (error) {
        console.error(`✗ ${label} failed:`);
        console.error(stderr || stdout);
        reject(error);
      } else {
        console.log(`✓ ${label} complete`);
        resolve();
      }
    });
    
    proc.stdout.on('data', (data) => {
      process.stdout.write(data.toString());
    });
  });
}

async function main() {
  console.log('\n╔════════════════════════════════════════════╗');
  console.log('║  Snowflake Generator - Build & Distribution║');
  console.log('╚════════════════════════════════════════════╝\n');
  
  try {
    // Step 1: Install dependencies
    await runCommand('npm install', 'Install dependencies');
    
    // Step 2: Build Vite frontend
    await runCommand('npm run build', 'Build Vite frontend');
    
    // Step 3: Build Electron packages
    await runCommand('npm run electron:build', 'Build Electron packages');
    
    // Step 4: List output files
    console.log('\n╔════════════════════════════════════════════╗');
    console.log('║  Build Complete - Distribution Ready       ║');
    console.log('╚════════════════════════════════════════════╝\n');
    
    const distPath = path.join(projectRoot, 'dist-electron');
    if (fs.existsSync(distPath)) {
      console.log('Output files in dist-electron/:\n');
      const files = fs.readdirSync(distPath);
      files.forEach(file => {
        const fullPath = path.join(distPath, file);
        const stat = fs.statSync(fullPath);
        const size = (stat.size / (1024 * 1024)).toFixed(2);
        console.log(`  • ${file} (${size} MB)`);
      });
    }
    
    console.log('\n✓ Ready for distribution!\n');
    process.exit(0);
  } catch (err) {
    console.error('\n✗ Build failed:', err.message);
    process.exit(1);
  }
}

main();
