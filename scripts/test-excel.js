#!/usr/bin/env node

import xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');

// Import maps from config files (single source of truth)
const ELECTION_CONFIG = JSON.parse(
  fs.readFileSync(path.join(ROOT_DIR, 'config', 'election.json'), 'utf8')
);
const TERRITORIES_CONFIG = JSON.parse(
  fs.readFileSync(path.join(ROOT_DIR, 'config', 'territories.json'), 'utf8')
);

const TERRITORY_MAP = TERRITORIES_CONFIG.territories;
const MESA_MAP = TERRITORIES_CONFIG.mesas;

// Build PARTY_MAP from election config (same logic as fetch-data.js)
const PARTY_MAP = {};
ELECTION_CONFIG.parties.lista.forEach(party => {
  party.excelNames.forEach(name => {
    PARTY_MAP[name.replace(/^>>/, '').trim()] = party.key;
  });
});
PARTY_MAP['Blancos'] = 'b';
PARTY_MAP['Nulos'] = 'n';

// Build PROJECT_MAP from election config
const PROJECT_MAP = {};
ELECTION_CONFIG.projects.forEach(project => {
  project.excelNames.forEach(name => {
    PROJECT_MAP[name.replace(/^>>/, '').trim()] = project.key;
  });
});
PROJECT_MAP['Blancos'] = 'b';
PROJECT_MAP['Nulos'] = 'n';

// Get file path from command line argument
const filePath = process.argv[2];

if (!filePath) {
  console.error('Usage: node scripts/test-excel.js <path-to-excel-file>');
  console.error('Example: node scripts/test-excel.js temp/2025-segunda-vuelta.xlsx');
  process.exit(1);
}

if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

console.log('='.repeat(60));
console.log('Excel Test Runner');
console.log('='.repeat(60));
console.log(`File: ${filePath}\n`);

const workbook = xlsx.readFile(filePath);

console.log(`Sheets found: ${workbook.SheetNames.length}`);
workbook.SheetNames.forEach((name, i) => {
  console.log(`   ${i + 1}. ${name}`);
});
console.log('');

// Track all warnings
const warnings = {
  unmappedTerritories: new Set(),
  unmappedMesas: new Set(),
  unmappedParties: new Set(),
  unmappedProjects: new Set(),
};

// Test each sheet
workbook.SheetNames.forEach((sheetName, sheetIndex) => {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Sheet ${sheetIndex + 1}: ${sheetName}`);
  console.log(`${'─'.repeat(60)}`);

  // Skip Territorial sheets
  if (sheetName.toLowerCase().includes('territorial')) {
    console.log('   Skipping Territorial sheet (not supported)');
    return;
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });

  if (rows.length < 2) {
    console.log('   Sheet has insufficient data');
    return;
  }

  const headers = rows[0];
  const dayRow = rows[1];

  console.log(`   Rows: ${rows.length - 2} data rows`);
  console.log(`   Columns: ${headers.length}`);

  // Detect sheet type
  const isPpto = headers.some(h => h && h.includes('Trabajos de Invierno'));
  const sheetType = isPpto ? 'Presupuesto Participativo' : 'Lista/Sup';
  console.log(`   Type: ${sheetType}`);

  // Show columns
  console.log('\n   Column mapping:');
  for (let j = 3; j < Math.min(headers.length, dayRow.length); j++) {
    const header = headers[j] || '(empty)';
    const day = dayRow[j] || '(empty)';
    if (header !== '(empty)' && day !== '(empty)') {
      console.log(`     Col ${j}: ${header} (${day})`);
    }
  }

  // Parse rows
  let processedRows = 0;
  let lastTerritory = null;

  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    const rawTerritory = row[1];
    const rawMesa = row[2];

    // Skip total/summary rows
    if (row[0] === 'Total' || row[0] === '% de válidamente emitidas') {
      break;
    }

    // Track territory
    if (rawTerritory) {
      lastTerritory = rawTerritory;
    }

    const terrToCheck = rawTerritory || lastTerritory;

    // Check mapping
    if (terrToCheck && !TERRITORY_MAP[terrToCheck]) {
      warnings.unmappedTerritories.add(terrToCheck);
    }

    if (rawMesa && !MESA_MAP[rawMesa]) {
      warnings.unmappedMesas.add(rawMesa);
    }

    // Check parties/projects in columns
    for (let j = 3; j < Math.min(headers.length, dayRow.length); j++) {
      const rawHeader = headers[j] || findPreviousHeader(headers, j);
      if (rawHeader) {
        // Strip >> prefix for comparison
        const header = rawHeader.replace(/^>>/, '').trim();

        if (!isPpto && !PARTY_MAP[header]) {
          warnings.unmappedParties.add(rawHeader);
        }
        if (isPpto && !PROJECT_MAP[header]) {
          warnings.unmappedProjects.add(rawHeader);
        }
      }
    }

    if (row[0] || rawTerritory || rawMesa) {
      processedRows++;
    }
  }

  console.log(`\n   Processed ${processedRows} data rows`);
});

function findPreviousHeader(headers, index) {
  for (let i = index; i >= 0; i--) {
    if (headers[i]) return headers[i];
  }
  return null;
}

// Summary
console.log(`\n${'='.repeat(60)}`);
console.log('Test Summary');
console.log(`${'='.repeat(60)}\n`);

let hasIssues = false;

if (warnings.unmappedTerritories.size > 0) {
  hasIssues = true;
  console.log('UNMAPPED Territories:');
  warnings.unmappedTerritories.forEach(t => console.log(`   - ${t}`));
  console.log('');
} else {
  console.log('OK - All territories mapped\n');
}

if (warnings.unmappedMesas.size > 0) {
  hasIssues = true;
  console.log('UNMAPPED Mesas:');
  warnings.unmappedMesas.forEach(m => console.log(`   - ${m}`));
  console.log('');
} else {
  console.log('OK - All mesas mapped\n');
}

if (warnings.unmappedParties.size > 0) {
  hasIssues = true;
  console.log('UNMAPPED Parties:');
  warnings.unmappedParties.forEach(p => console.log(`   - ${p}`));
  console.log('');
} else {
  console.log('OK - All parties mapped\n');
}

if (warnings.unmappedProjects.size > 0) {
  hasIssues = true;
  console.log('UNMAPPED Projects:');
  warnings.unmappedProjects.forEach(p => console.log(`   - ${p}`));
  console.log('');
} else {
  console.log('OK - All projects mapped\n');
}

// Final verdict
if (hasIssues) {
  console.log('EXCEL HAS COMPATIBILITY ISSUES');
  console.log('   Update config/election.json or config/territories.json to resolve');
  console.log('   Then run: npm run fetch-data -- --file <your-file.xlsx>\n');
} else {
  console.log('EXCEL IS FULLY COMPATIBLE');
  console.log('   Ready for production use!');
  console.log('   Run: npm run fetch-data -- --file <your-file.xlsx>\n');
}