import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from 'react-native';
export default function Home() {
  return (
    <SafeAreaView style={{ flex: 1, padding: 24 }}>
      <Text>Loopnest · A fresh start</Text>
    </SafeAreaView>
  );
}
