import fs from 'fs';
import path from 'path';

// Patch maplibre-gl-shared.mjs and dev files to support Mapbox projection: { name: '...' }
const filesToPatch = [
  'node_modules/maplibre-gl/dist/maplibre-gl-shared.mjs',
  'node_modules/maplibre-gl/dist/maplibre-gl-shared-dev.mjs',
  'node_modules/@maplibre/maplibre-gl-style-spec/dist/reference/v8.mjs',
  'node_modules/@maplibre/maplibre-gl-style-spec/dist/index.cjs',
];

const target = 'projection:{type:{type:`projectionDefinition`,default:`mercator`,"property-type":`data-constant`,transition:!1,expression:{interpolated:!0,parameters:[`zoom`]}}}';
const replacement = 'projection:{type:{type:`projectionDefinition`,default:`mercator`,"property-type":`data-constant`,transition:!1,expression:{interpolated:!0,parameters:[`zoom`]}},name:{type:`projectionDefinition`,default:`mercator`,"property-type":`data-constant`,transition:!1,expression:{interpolated:!0,parameters:[`zoom`]}}}';

for (const relPath of filesToPatch) {
  try {
    const fullPath = path.resolve(relPath);
    if (!fs.existsSync(fullPath)) continue;
    let content = fs.readFileSync(fullPath, 'utf8');
    if (content.includes(target)) {
      content = content.replace(target, replacement);
      fs.writeFileSync(fullPath, content, 'utf8');
      console.log(`[patch-maplibre] Patched ${relPath}`);
    }
  } catch (err) {
    console.warn(`[patch-maplibre] Warning for ${relPath}:`, err);
  }
}
