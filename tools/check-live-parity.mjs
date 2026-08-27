import fs from 'node:fs';
import path from 'node:path';

const trialPath = path.resolve(import.meta.dirname, '..', 'index.html');
const livePath = process.argv[2];

if (!livePath) {
  process.stderr.write('Usage: node tools/check-live-parity.mjs <absolute-live-index.html>\n');
  process.exit(2);
}
if (!fs.existsSync(livePath)) {
  process.stderr.write(`Live reference not found: ${livePath}\n`);
  process.exit(2);
}

const live = fs.readFileSync(livePath, 'utf8');
const trial = fs.readFileSync(trialPath, 'utf8');

const collect = (text, re) => new Set([...text.matchAll(re)].map(match => match[1]));
const difference = (expected, actual) => [...expected].filter(value => !actual.has(value)).sort();
const version = text => Number(text.match(/const\s+APP_VERSION\s*=\s*(\d+)/)?.[1] || 0);

const liveIds = collect(live, /\bid="([^"]+)"/g);
const trialIds = collect(trial, /\bid="([^"]+)"/g);
const liveFunctions = collect(live, /\bfunction\s+([\w$]+)\s*\(/g);
const trialFunctions = collect(trial, /\bfunction\s+([\w$]+)\s*\(/g);

const missingIds = difference(liveIds, trialIds);
// Chỉ có trong bản live để giả lập vai qua query string; bản thử nghiệm không mang
// cửa hậu kiểm thử này sang candidate triển khai thật.
const intentionallyExcludedFunctions = new Set(['applyLocalRoleTest']);
const missingFunctions = difference(liveFunctions, trialFunctions)
  .filter(name => !intentionallyExcludedFunctions.has(name));

process.stdout.write(`Live APP_VERSION:  ${version(live)}\n`);
process.stdout.write(`Trial APP_VERSION: ${version(trial)}\n`);
process.stdout.write(`Missing HTML ids (${missingIds.length}): ${missingIds.join(', ') || 'none'}\n`);
process.stdout.write(`Missing functions (${missingFunctions.length}): ${missingFunctions.join(', ') || 'none'}\n`);

if (missingIds.length || missingFunctions.length) {
  process.stderr.write('\nTrial has not reached live feature parity.\n');
  process.exit(1);
}

process.stdout.write('\nTrial contains every named live UI element and function.\n');
