import { File, Text } from '@asyncapi/generator-react-sdk';
import { PythonModularIndividualModels } from '../../components/PythonModularIndividualModels.js';

export default function ({ asyncapi, params }) {
  const packageName = params.packageName || 'main';
  const moduleName = params.moduleName || 'binance-websocket-client';
  const modelFiles = PythonModularIndividualModels({ asyncapi, context: { packageName, moduleName } });
  
  // Generate individual model files in models/ subdirectory
  // This approach works because we're now in the correct template directory structure
  return modelFiles.map((modelFile, index) => (
    <File name={modelFile.name} key={index}>
      <Text>{modelFile.content}</Text>
    </File>
  ));
}