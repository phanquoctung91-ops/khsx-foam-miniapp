import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const file = path.resolve(import.meta.dirname, '..', process.argv[2] || 'index.html');
const html = fs.readFileSync(file, 'utf8');
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter(match => !/\bsrc\s*=|application\/json/i.test(match[1]))
  .map(match => match[2]);

scripts.forEach((source, index) => new vm.Script(source, {filename: `${path.basename(file)}#script-${index + 1}`}));
process.stdout.write(`PASS  ${path.basename(file)}: ${scripts.length} inline JavaScript block(s) parse successfully.\n`);
