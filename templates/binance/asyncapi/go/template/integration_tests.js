import { File } from '@asyncapi/generator-react-sdk';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

export default function({ params }) {
  const packageName = params.packageName || 'spot';
  const moduleName = params.moduleName || 'github.com/openxapi/binance-go/ws';
  
  // Only generate integration tests for the spot module (these tests are spot-specific)
  if (packageName !== 'spot') {
    return <></>;
  }
  
  // Use the root integration test directory (no module subdirectory)
  const testDir = join(__dirname, '..', 'template', 'tests', 'integration');
  
  if (!existsSync(testDir)) {
    return <></>;
  }
  
  const testFiles = readdirSync(testDir).filter(file => file.endsWith('.go'));
  
  if (testFiles.length === 0) {
    return <></>;
  }
  
  return (
    <>
      {testFiles.map(fileName => {
        let testContent = readFileSync(join(testDir, fileName), 'utf8');
        
        // Replace template variables with actual values (if any)
        testContent = testContent.replace(/{{packageName}}/g, packageName);
        testContent = testContent.replace(/{{moduleName}}/g, moduleName);
        
        return (
          <File key={fileName} name={`tests/integration/${fileName}`}>
            {testContent}
          </File>
        );
      })}
      {existsSync(join(testDir, 'env.example')) && (
        <File name="tests/integration/env.example">
          {readFileSync(join(testDir, 'env.example'), 'utf8')}
        </File>
      )}
    </>
  );
}