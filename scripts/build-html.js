import pug from 'pug';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pugDir = path.resolve(__dirname, '../src/pug');
const rootDir = path.resolve(__dirname, '..');

// Load election config to inject into Pug templates
const electionConfig = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'config', 'election.json'), 'utf8')
);

// Build party/project lists for vote-pills generation (all parties, not just active)
// Inactive parties show 0 votes but are still displayed for context
const pugData = {
  election: electionConfig.election,
  listaParties: electionConfig.parties.lista,
  supParties: electionConfig.parties.sup,
  projects: electionConfig.projects,
};

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
    })(pugData);
    
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