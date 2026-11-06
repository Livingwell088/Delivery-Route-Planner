const { withAndroidManifest, withMainApplication, withDangerousMod, withInfoPlist } = require('expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');

const registration = 'add(com.routerunner.navigation.RouteNavigationPackage())';
function registerPackage(contents) {
  if (contents.includes(registration)) return contents;
  const anchor = /PackageList\(this\)\.packages\.apply\s*\{/;
  if (!anchor.test(contents)) throw new Error('Navigation plugin: expected Kotlin package registration was not found.');
  return contents.replace(anchor, (match) => `${match}\n          ${registration}`);
}

function addMapsQuery(manifest) {
  const queries = manifest.queries ?? (manifest.queries = []);
  while (queries.length > 1) {
    const extra = queries.pop();
    for (const key of ['package', 'intent', 'provider']) {
      if (extra[key]) queries[0][key] = [...(queries[0][key] ?? []), ...extra[key]];
    }
  }
  if (!queries.some((query) => query.package?.some((item) => item.$?.['android:name'] === 'com.google.android.apps.maps'))) {
    if (!queries.length) queries.push({});
    const packages = queries[0].package ?? (queries[0].package = []);
    packages.push({ $: { 'android:name': 'com.google.android.apps.maps' } });
  }
  return manifest;
}

function withNavigationApps(config) {
  config = withInfoPlist(config, (mod) => {
    mod.modResults.LSApplicationQueriesSchemes = [...new Set([
      ...(mod.modResults.LSApplicationQueriesSchemes ?? []), 'comgooglemapsurl', 'maps',
    ])];
    return mod;
  });
  config = withAndroidManifest(config, (mod) => {
    addMapsQuery(mod.modResults.manifest);
    return mod;
  });
  config = withMainApplication(config, (mod) => {
    if (mod.modResults.language !== 'kt') throw new Error('Navigation plugin requires Kotlin MainApplication.');
    mod.modResults.contents = registerPackage(mod.modResults.contents);
    return mod;
  });
  return withDangerousMod(config, ['android', async (mod) => {
    const directory = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/java/com/routerunner/navigation');
    await fs.mkdir(directory, { recursive: true });
    await fs.copyFile(path.join(__dirname, 'RouteNavigationModule.kt'), path.join(directory, 'RouteNavigationModule.kt'));
    return mod;
  }]);
}
module.exports = withNavigationApps;
module.exports.registerPackage = registerPackage;
module.exports.addMapsQuery = addMapsQuery;
