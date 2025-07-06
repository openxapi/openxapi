import { File } from '@asyncapi/generator-react-sdk';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

export default function({ params }) {
  const testFilesDir = join(__dirname, '..', 'template', 'tests', 'integration');
  const testFiles = readdirSync(testFilesDir).filter(file => file.endsWith('.go'));
  
  return (
    <>
      {testFiles.map(fileName => {
        const testContent = readFileSync(join(testFilesDir, fileName), 'utf8');
        return (
          <File key={fileName} name={`tests/integration/${fileName}`}>
            {testContent}
          </File>
        );
      })}
      <File name="tests/integration/env.example">
        {readFileSync(join(testFilesDir, 'env.example'), 'utf8')}
      </File>
    </>
  );
}