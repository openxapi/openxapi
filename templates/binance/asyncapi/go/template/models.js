import { File, Text } from '@asyncapi/generator-react-sdk';
import { ModularIndividualModels } from '../components/ModularIndividualModels';

export default function ({ asyncapi, params }) {
  const packageName = params.packageName || 'main';
  const moduleName = params.moduleName || 'binance-websocket-client';
  const modelFiles = ModularIndividualModels({ asyncapi, context: { packageName, moduleName } });
  
  return modelFiles.map((modelFile, index) => (
    <File name={`models/${modelFile.name}`} key={index}>
      <Text>{modelFile.content}</Text>
    </File>
  ));
} 