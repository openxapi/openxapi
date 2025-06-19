import { File, Text } from '@asyncapi/generator-react-sdk';
import { IndividualModels } from '../../components/IndividualModels';

export default function ({ asyncapi, params }) {
  const modelFiles = IndividualModels({ asyncapi });
  
  return modelFiles.map((modelFile, index) => (
    <File name={`models/${modelFile.name}`} key={index}>
      <Text>{modelFile.content}</Text>
    </File>
  ));
} 