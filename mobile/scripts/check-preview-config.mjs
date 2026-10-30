import { backendConfiguration } from '../src/domain/backend-config.ts';
const mode = backendConfiguration({
  url: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  key: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
  allowLocal: false,
  development: false,
});
if (mode !== 'hosted')
  throw new Error(
    'Preview requires a hosted HTTPS project and public publishable key. Never provide privileged keys.',
  );
if (
  process.env.EXPO_PUBLIC_ALLOW_TEST_SCREENSHOTS !== 'false' ||
  process.env.EXPO_PUBLIC_USE_LOCAL_BACKEND !== 'false'
)
  throw new Error('Preview must use normal capture protection and hosted mode.');
console.log('Public preview configuration and normal capture policy verified.');
