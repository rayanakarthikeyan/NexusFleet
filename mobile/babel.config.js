module.exports = function (api) {
  api.cache(true);
  // SDK 54's preset installs the Worklets plugin automatically.
  return { presets: ['babel-preset-expo'] };
};
