#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Post-generation script to copy and organize integration test files
 * Copies integration test files from template source to generated output directory
 */

function copyIntegrationTests(outputDir) {
  console.log(`Post-processing integration tests in: ${outputDir}`);
  
  // Check if output directory exists
  if (!fs.existsSync(outputDir)) {
    console.log(`Output directory does not exist: ${outputDir}`);
    return;
  }
  
  // Determine module name from output directory path
  const moduleName = path.basename(outputDir);
  console.log(`Processing module: ${moduleName}`);
  
  // Source directory for integration tests
  const templateDir = path.join(__dirname, 'tests', 'integration', moduleName);
  
  if (!fs.existsSync(templateDir)) {
    console.log(`No integration tests found for module: ${moduleName}`);
    return;
  }
  
  // Create tests/integration directory in output
  const testsDir = path.join(outputDir, 'tests');
  const integrationDir = path.join(testsDir, 'integration');
  
  if (!fs.existsSync(testsDir)) {
    fs.mkdirSync(testsDir, { recursive: true });
    console.log(`Created directory: ${testsDir}`);
  }
  
  if (!fs.existsSync(integrationDir)) {
    fs.mkdirSync(integrationDir, { recursive: true });
    console.log(`Created directory: ${integrationDir}`);
  }
  
  // Copy all files from template directory to integration directory
  let copiedFiles = 0;
  
  try {
    const files = fs.readdirSync(templateDir);
    
    for (const fileName of files) {
      const sourcePath = path.join(templateDir, fileName);
      const targetPath = path.join(integrationDir, fileName);
      
      // Only copy files, not directories
      if (fs.statSync(sourcePath).isFile()) {
        let content = fs.readFileSync(sourcePath, 'utf8');
        
        // Replace template variables if any exist
        content = content.replace(/{{packageName}}/g, moduleName);
        content = content.replace(/{{moduleName}}/g, `github.com/openxapi/binance-go/ws`);
        
        fs.writeFileSync(targetPath, content);
        console.log(`Copied: ${fileName} -> tests/integration/${fileName}`);
        copiedFiles++;
      }
    }
    
    if (copiedFiles > 0) {
      console.log(`Successfully copied ${copiedFiles} integration test files to tests/integration/`);
    } else {
      console.log('No integration test files found to copy');
    }
    
  } catch (error) {
    console.error(`Failed to copy integration tests:`, error.message);
  }
}

// Get output directory from command line arguments or environment
const outputDir = process.argv[2] || process.env.OUTPUT_DIR || './output';

try {
  copyIntegrationTests(outputDir);
} catch (error) {
  console.error('Post-generation script failed:', error.message);
  process.exit(1);
}