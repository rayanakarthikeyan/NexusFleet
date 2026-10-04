import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateApkConfiguration } from '../scripts/check-build-config.mjs';

const projectId = '1d00a589-8bf5-44e1-b158-f53fc5b5b063';
const environment = {
  EXPO_PUBLIC_API_URL: 'https://fleet-demo.onrender.com',
};

test('APK preflight rejects placeholders and accidental credentials in the API URL', () => {
  for (const url of [
    '',
    'http://fleet-demo.onrender.com',
    'https://your-api.example.com',
    'https://user:password@fleet-demo.onrender.com',
    'https://fleet-demo.onrender.com/telemetry',
  ]) {
    assert.ok(
      validateApkConfiguration(
        { ...environment, EXPO_PUBLIC_API_URL: url },
        { extra: { eas: { projectId } } },
      ).some((error) => error.startsWith('EXPO_PUBLIC_API_URL')),
    );
  }
  assert.equal(validateApkConfiguration({}, {}).length, 2);
});

test('APK preflight accepts a project binding from app.json without any Maps key', () => {
  assert.deepEqual(validateApkConfiguration(environment, { extra: { eas: { projectId } } }), []);
});
