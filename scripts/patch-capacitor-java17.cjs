const fs = require('fs');
const path = require('path');

const targets = [
  path.join('android', 'app', 'capacitor.build.gradle'),
  path.join('android', 'capacitor-cordova-android-plugins', 'build.gradle'),
  path.join('node_modules', '@capacitor', 'android', 'capacitor', 'build.gradle'),
  path.join('node_modules', '@capacitor', 'app', 'android', 'build.gradle'),
];

for (const file of targets) {
  if (!fs.existsSync(file)) {
    console.log(`[IGNORADO] ${file}`);
    continue;
  }

  const before = fs.readFileSync(file, 'utf8');

  const after = before.replaceAll(
    'JavaVersion.VERSION_21',
    'JavaVersion.VERSION_17',
  );

  if (before !== after) {
    fs.writeFileSync(file, after, 'utf8');
    console.log(`[OK] Patch aplicado: ${file}`);
  } else {
    console.log(`[SEM ALTERAÇÃO] ${file}`);
  }
}

console.log('\nPatch Java 17 concluído.');
