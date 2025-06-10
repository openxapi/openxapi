import { File, Text } from '@asyncapi/generator-react-sdk';

export default function ({ asyncapi, params }) {
  const moduleName = params.moduleName || 'websocket-client';

  return (
    <File name="go.mod">
      <Text>module {moduleName}</Text>
      <Text newLines={2}>go 1.21</Text>
      <Text newLines={2}>
        {`require (
	github.com/gorilla/websocket v1.5.1
)`}
      </Text>
    </File>
  );
} 