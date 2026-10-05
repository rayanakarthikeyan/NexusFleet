module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins ?? []),
    [
      'expo-build-properties',
      {
        android: {
          // The phone profile omits emulator/32-bit binaries to reduce download
          // and installation space. Preview keeps all four architectures.
          buildArchs:
            process.env.NEXUSFLEET_ARM64_ONLY === '1'
              ? ['arm64-v8a']
              : ['armeabi-v7a', 'arm64-v8a', 'x86', 'x86_64'],
          // Compress native libraries in the APK; Android extracts them during
          // install. ELF page alignment is still checked on the downloaded APK.
          useLegacyPackaging: true,
        },
      },
    ],
  ],
});
