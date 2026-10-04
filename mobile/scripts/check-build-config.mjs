import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function validateApkConfiguration(environment, appConfig) {
  const errors = [];
  let apiUrl;
  try {
    apiUrl = new URL(environment.EXPO_PUBLIC_API_URL ?? '');
  } catch {
    /* Report one useful error below. */
  }
  if (
    !apiUrl ||
    apiUrl.protocol !== 'https:' ||
    apiUrl.username ||
    apiUrl.password ||
    apiUrl.pathname !== '/' ||
    apiUrl.search ||
    apiUrl.hash ||
    apiUrl.hostname.endsWith('.example.com') ||
    apiUrl.hostname.endsWith('.example')
  ) {
    errors.push(
      'EXPO_PUBLIC_API_URL must be your deployed HTTPS API origin, without credentials, a path, or placeholder hostname.',
    );
  }
  const projectId = appConfig.extra?.eas?.projectId;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId ?? '')) {
    errors.push('Initialize the real Expo project and configure extra.eas.projectId in app.json.');
  }
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mobileDirectory = new URL('../', import.meta.url);
  const localEnv = fileURLToPath(new URL('.env', mobileDirectory));
  if (existsSync(localEnv)) process.loadEnvFile(localEnv);
  const appConfig = JSON.parse(readFileSync(new URL('app.json', mobileDirectory), 'utf8')).expo;
  const errors = validateApkConfiguration(process.env, appConfig);
  if (errors.length) {
    // Print names/instructions only. Keys and connection credentials never enter build logs.
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('APK configuration is complete. Backend availability still needs verification.');
  }
}
