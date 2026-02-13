import pug from 'pug';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pugDir = path.resolve(__dirname, '../src/pug');
const rootDir = path.resolve(__dirname, '..');

// Compile index.pug
const indexPugPath = path.join(pugDir, 'index.pug');
if (fs.existsSync(indexPugPath)) {
  const content = fs.readFileSync(indexPugPath, 'utf-8');
  
  try {
    const html = pug.compile(content, {
      filename: indexPugPath,
      basedir: pugDir,
      pretty: true,
      doctype: 'html'
    })();
    
    fs.writeFileSync(path.join(rootDir, 'index.html'), html);
    console.log('✓ Compiled index.pug -> index.html');
  } catch (err) {
    console.error('Error compiling index.pug:', err.message);
    process.exit(1);
  }
} else {
  console.error('index.pug not found at:', indexPugPath);
  process.exit(1);
}
