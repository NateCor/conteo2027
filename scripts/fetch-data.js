import axios from 'axios';
import xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');

// Load configuration files
const ELECTION_CONFIG = JSON.parse(
  fs.readFileSync(path.join(ROOT_DIR, 'config', 'election.json'), 'utf8')
);
const TERRITORIES_CONFIG = JSON.parse(
  fs.readFileSync(path.join(ROOT_DIR, 'config', 'territories.json'), 'utf8')
);
// Per-territory padrón (Tricel). Optional: falls back to 0 participation
// per territory when the file doesn't exist yet.
const PADRON_PATH = path.join(ROOT_DIR, 'config', 'padron.json');
const PADRON = fs.existsSync(PADRON_PATH)
  ? JSON.parse(fs.readFileSync(PADRON_PATH, 'utf8'))
  : null;
const PADRON_TERRI = (PADRON && PADRON.totalPorTerritorio) || {};

const SHEET_URL = process.env.SHEET_URL;
const CACHE_FILE = path.join(ROOT_DIR, 'temp', 'last_count.xlsx');
const OUTPUT_FILE = path.join(ROOT_DIR, 'public', 'data.json');

// Parse command line arguments
const args = process.argv.slice(2);
const fileArgIndex = args.indexOf('--file');
const LOCAL_FILE = fileArgIndex !== -1 ? args[fileArgIndex + 1] : null;
const votersArgIndex = args.indexOf('--total-voters');
const CLI_TOTAL_VOTERS = votersArgIndex !== -1 ? parseInt(args[votersArgIndex + 1], 10) : null;

// Build maps from configuration
const TERRITORY_MAP = TERRITORIES_CONFIG.territories;
const MESA_MAP = TERRITORIES_CONFIG.mesas;

// Effective total voters: CLI flag takes precedence, then config
const TOTAL_VOTERS = CLI_TOTAL_VOTERS || ELECTION_CONFIG.election.totalVoters;

// Detected active parties/projects from Excel (populated during validation)
const detectedActive = { lista: [], sup: [], projects: [] };

// Build party maps from election config
function buildPartyMap() {
  const map = {};
  ['lista', 'sup'].forEach(type => {
    ELECTION_CONFIG.parties[type].forEach(party => {
      party.excelNames.forEach(name => {
        const cleanName = name.replace(/^>>/, '').trim();
        map[cleanName] = party.key;
      });
    });
  });
  
  // Add Blancos and Nulos (not parties but required columns)
  map['Blancos'] = 'b';
  map['Nulos'] = 'n';
  
  return map;
}

// Build project maps from election config
function buildProjectMap() {
  const map = {};
  ELECTION_CONFIG.projects.forEach(project => {
    project.excelNames.forEach(name => {
      const cleanName = name.replace(/^>>/, '').trim();
      map[cleanName] = project.key;
    });
  });
  return map;
}

const PARTY_MAP = buildPartyMap();
const PROJECT_MAP = buildProjectMap();

// CT lists share keys with lista where the list is the same; CT-only lists
// (Liberales, BUS, Surgencia, Independientes) live in parties.ct.
function buildCtListMap() {
  const map = {};
  (ELECTION_CONFIG.parties.ct || []).forEach(party => {
    party.excelNames.forEach(name => {
      const cleanName = name.replace(/^>>/, '').trim();
      map[cleanName] = party.key;
    });
  });
  return map;
}
const CT_LIST_MAP = buildCtListMap();

// Derive key arrays from config (single source of truth). Per contest type:
// sup can carry keys lista lacks (e.g. the 2027 CS-only "0%" list), so the
// aggregation must sum each contest with its own keys or those votes vanish.
const LISTA_KEYS = [...ELECTION_CONFIG.parties.lista.map(p => p.key), 'b', 'n'];
const SUP_KEYS = [...ELECTION_CONFIG.parties.sup.map(p => p.key), 'b', 'n'];
const PROJECT_KEYS = [...ELECTION_CONFIG.projects.map(p => p.key), 'b', 'n'];

// Ensure directories exist
if (!fs.existsSync(path.join(ROOT_DIR, 'temp'))) fs.mkdirSync(path.join(ROOT_DIR, 'temp'));
if (!fs.existsSync(path.join(ROOT_DIR, 'public'))) fs.mkdirSync(path.join(ROOT_DIR, 'public'));

// Validation errors collector
const validationErrors = [];
const validationWarnings = [];

async function fetchData() {
  let buffer;
  
  // Option 1: Use local file if specified
  if (LOCAL_FILE) {
    const localPath = path.resolve(ROOT_DIR, LOCAL_FILE);
    if (fs.existsSync(localPath)) {
      console.log('Using local file:', localPath);
      buffer = fs.readFileSync(localPath);
    } else {
      console.error(`[ERROR] Local file not found: ${localPath}`);
      process.exit(1);
    }
  } 
  // Option 2: Download from URL
  else if (SHEET_URL) {
    try {
      console.log('Downloading Excel from:', SHEET_URL);
      const response = await axios.get(SHEET_URL, { 
        responseType: 'arraybuffer', 
        maxRedirects: 5,
        timeout: 30000 
      });
      buffer = response.data;
      fs.writeFileSync(CACHE_FILE, Buffer.from(buffer));
      console.log('Downloaded and cached successfully.');
    } catch (error) {
      console.error('[WARNING] Failed to download:', error.message);
      if (fs.existsSync(CACHE_FILE)) {
        console.log('Using cached file from:', CACHE_FILE);
        buffer = fs.readFileSync(CACHE_FILE);
      } else {
        console.error('[ERROR] No cache available and download failed.');
        process.exit(1);
      }
    }
  } 
  // Option 3: Use cached file
  else if (fs.existsSync(CACHE_FILE)) {
    console.log('Using cached file from:', CACHE_FILE);
    buffer = fs.readFileSync(CACHE_FILE);
  }
  else {
    console.error('[ERROR] No file source available.');
    console.error('  → Either provide SHEET_URL in .env or use --file flag');
    console.error('  → Example: npm run fetch-data -- --file temp/test.xlsx');
    process.exit(1);
  }

  const workbook = xlsx.read(buffer, { type: 'buffer' });
  
  // Validate Excel structure
  const isValid = validateExcel(workbook);
  
  if (!isValid) {
    console.error('\n[ERROR] Excel validation failed. Please fix the issues above and try again.');
    process.exit(1);
  }

  const data = transformWorkbook(workbook);

  // CT parsing runs inside transformWorkbook — surface its errors BEFORE
  // writing, so a rejected Excel never publishes a broken data.json.
  if (validationWarnings.length > 0) {
    console.log('\n[WARNINGS]:');
    validationWarnings.forEach(w => console.log(`  ⚠ ${w}`));
  }
  if (validationErrors.length > 0) {
    console.log('\n[ERRORS]:');
    validationErrors.forEach(e => console.log(`  ✗ ${e}`));
    process.exit(1);
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));
  console.log('\n✓ Data transformed and saved to', OUTPUT_FILE);
  console.log(`  Election type: ${data.electionType}`);
  console.log(`  Active lista parties: ${data.activeParties.lista.join(', ')}`);
  console.log(`  Active sup parties: ${data.activeParties.sup.join(', ')}`);
  console.log(`  Active projects: ${data.activeParties.projects.join(', ')}`);
  console.log(`  Total voters: ${data.totalVoters}`);
}

function validateExcel(workbook) {
  console.log('\n=== Validating Excel Structure ===\n');
  
  const sheetNames = workbook.SheetNames;
  console.log(`Found ${sheetNames.length} sheets: ${sheetNames.join(', ')}`);
  
  // Check expected sheets
  const expectedSheets = ['Directiva FEUC', 'Consejería Superior', 'Presupuestos Participativos'];
  const sheetMap = {
    'lista': null,
    'sup': null,
    'ppto': null
  };
  
  sheetNames.forEach(name => {
    const lower = name.toLowerCase();
    if (lower.includes('directiva') || lower.includes('lista')) {
      sheetMap.lista = name;
    } else if (lower.includes('superior') && !lower.includes('territorial')) {
      sheetMap.sup = name;
    } else if (lower.includes('presupuesto') || lower.includes('participativo')) {
      sheetMap.ppto = name;
    }
  });
  
  if (!sheetMap.lista) {
    validationErrors.push('Sheet "Directiva FEUC" not found');
  }
  if (!sheetMap.sup) {
    validationErrors.push('Sheet "Consejería Superior" not found');
  }
  if (!sheetMap.ppto) {
    validationWarnings.push('Sheet "Presupuestos Participativos" not found (may not be available for this election)');
  }
  
  // Validate party columns in Lista and Sup sheets
  ['lista', 'sup'].forEach(type => {
    if (!sheetMap[type]) return;
    
    const sheet = workbook.Sheets[sheetMap[type]];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    const headers = rows[0].map(h => h ? h.replace(/^>>/, '').trim() : '');
    
    console.log(`\nValidating ${sheetMap[type]}...`);
    
    // Detect which parties are present in the Excel (auto-detection)
    ELECTION_CONFIG.parties[type].forEach(party => {
      const found = party.excelNames.some(name => {
        const cleanName = name.replace(/^>>/, '').trim();
        return headers.includes(cleanName);
      });
      
      if (found) {
        detectedActive[type].push(party.key);
        console.log(`  ✓ ${party.displayName} (${party.key})`);
      } else {
        console.log(`  - ${party.displayName} (${party.key}) not in Excel (inactive for this round)`);
      }
    });
    
    // Check for unknown columns
    const knownColumns = new Set();
    ELECTION_CONFIG.parties[type].forEach(party => {
      party.excelNames.forEach(name => {
        knownColumns.add(name.replace(/^>>/, '').trim());
      });
    });
    knownColumns.add('Blancos');
    knownColumns.add('Nulos');
    knownColumns.add('Campus');
    knownColumns.add('Territorio');
    knownColumns.add('Mesa');
    
    headers.forEach(header => {
      if (header && !knownColumns.has(header)) {
        validationErrors.push(`Unknown column "${header}" in ${sheetMap[type]}. Add it to config/election.json first!`);
      }
    });
  });
  
  // Validate project columns in PPTO sheet
  if (sheetMap.ppto) {
    const sheet = workbook.Sheets[sheetMap.ppto];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    const headers = rows[0].map(h => h ? h.replace(/^>>/, '').trim() : '');
    
    console.log(`\nValidating ${sheetMap.ppto}...`);
    
    ELECTION_CONFIG.projects.forEach(project => {
      const found = project.excelNames.some(name => {
        const cleanName = name.replace(/^>>/, '').trim();
        return headers.includes(cleanName);
      });
      
      if (found) {
        detectedActive.projects.push(project.key);
        console.log(`  ✓ ${project.displayName} (${project.key})`);
      } else {
        console.log(`  - ${project.displayName} (${project.key}) not in Excel (inactive for this round)`);
      }
    });
  }
  
  // Print results
  console.log('\n=== Validation Results ===');
  
  if (validationWarnings.length > 0) {
    console.log('\n[WARNINGS]:');
    validationWarnings.forEach(w => console.log(`  ⚠ ${w}`));
  }
  
  if (validationErrors.length > 0) {
    console.log('\n[ERRORS]:');
    validationErrors.forEach(e => console.log(`  ✗ ${e}`));
    return false;
  }
  
  console.log('\n✓ Validation passed!\n');
  return true;
}

function transformWorkbook(workbook) {
  const converted = {
    dia1: { lista: { mesa: {}, terri: {}, total: {} }, sup: { mesa: {}, terri: {}, total: {} }, ppto: { terri: {}, total: {} } },
    dia2: { lista: { mesa: {}, terri: {}, total: {} }, sup: { mesa: {}, terri: {}, total: {} }, ppto: { terri: {}, total: {} } },
    total: { lista: { mesa: {}, terri: {}, total: {} }, sup: { mesa: {}, terri: {}, total: {} }, ppto: { terri: {}, total: {} } },
    ct: { terri: {}, total: { parties: [], b: { dia1: 0, dia2: 0, votos: 0 }, n: { dia1: 0, dia2: 0, votos: 0 }, votos: 0, votosve: 0, escrutada: false }, terriList: [] },
  };

  const sheetNames = workbook.SheetNames;
  
  // Find sheet names (ignore Territorial sheets)
  let listaSheetName = sheetNames[0];
  let supSheetName = sheetNames[1];
  let pptoSheetName = null;
  let ctSheetName = null;
  
  sheetNames.forEach(name => {
    const lower = name.toLowerCase();
    
    // CT sheet: per-territory candidates ("Candidaturas X" blocks)
    if (lower.includes('territorial')) {
      ctSheetName = name;
      return;
    }
    
    if (lower.includes('directiva') || lower.includes('lista')) {
      listaSheetName = name;
    } else if (lower.includes('consejería') || lower.includes('superior')) {
      supSheetName = name;
    } else if (lower.includes('presupuesto') || lower.includes('participativo')) {
      pptoSheetName = name;
    }
  });

  console.log('Processing sheets:');
  console.log(`  Lista: ${listaSheetName}`);
  console.log(`  Sup: ${supSheetName}`);
  console.log(`  PPTO: ${pptoSheetName || '(not found)'}`);
  console.log(`  CT: ${ctSheetName || '(not found)'}`);

  parseMainSheet(workbook.Sheets[listaSheetName], converted, 'lista');
  parseMainSheet(workbook.Sheets[supSheetName], converted, 'sup');
  if (pptoSheetName) {
    parsePptoSheet(workbook.Sheets[pptoSheetName], converted);
  }
  if (ctSheetName) {
    parseCtSheet(workbook.Sheets[ctSheetName], converted);
  }

  calculateAggregates(converted);

  // Add election metadata for the frontend
  converted.activeParties = detectedActive;
  converted.electionType = detectedActive.lista.length > 2 ? 'firstRound' : 'secondRound';
  converted.totalVoters = TOTAL_VOTERS;

  return converted;
}

function parseMainSheet(sheet, converted, tipo) {
  if (!sheet) {
    console.log(`  Skipping ${tipo} - sheet not found`);
    return;
  }
  
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  if (rows.length < 2) return;

  const headers = rows[0];
  const dayRow = rows[1];
  let lastTerritory = null;

  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    let rawTerritory = row[1];
    const rawMesa = row[2];
    
    // Skip total/summary rows (check both territory column and first column)
    if (rawTerritory === 'Total' || rawTerritory === '% de válidamente emitidas' || 
        row[0] === 'Total' || row[0] === '% de válidamente emitidas') {
      break;
    }

    // Skip if no mesa (empty row or summary row)
    if (!rawMesa) {
      continue;
    }

    // Use last territory if current is empty (Excel has merged cells visually)
    if (!rawTerritory && lastTerritory) {
      rawTerritory = lastTerritory;
    }

    // Update last territory tracker
    if (rawTerritory) {
      lastTerritory = rawTerritory;
    }

    const territoryId = TERRITORY_MAP[rawTerritory] || rawTerritory;
    const mesaId = MESA_MAP[rawMesa] || rawMesa;

    if (!converted.dia1[tipo].mesa[mesaId]) {
      converted.dia1[tipo].mesa[mesaId] = buildDefaultObject(mesaId, rawMesa);
      converted.dia1[tipo].mesa[mesaId].territoryId = territoryId;
    }
    if (!converted.dia2[tipo].mesa[mesaId]) {
      converted.dia2[tipo].mesa[mesaId] = buildDefaultObject(mesaId, rawMesa);
      converted.dia2[tipo].mesa[mesaId].territoryId = territoryId;
    }

    // Use dayRow.length instead of headers.length to include all data columns
    for (let j = 3; j < dayRow.length; j++) {
      let partyName = headers[j] || findPreviousHeader(headers, j);
      if (partyName) {
        partyName = partyName.replace(/^>>/, '').trim();
      }
      const day = dayRow[j];
      const votes = parseInt(row[j]) || 0;
      const key = PARTY_MAP[partyName];

      if (key) {
        if (day === 'Dia 1') converted.dia1[tipo].mesa[mesaId][key] += votes;
        if (day === 'Dia 2') converted.dia2[tipo].mesa[mesaId][key] += votes;
      }
    }
  }
  
  const mesaCount = Object.keys(converted.dia1[tipo].mesa).length;
  console.log(`  ✓ Parsed ${mesaCount} mesas for ${tipo}`);
}

function parsePptoSheet(sheet, converted) {
  if (!sheet) {
    console.log('  Skipping ppto - sheet not found');
    return;
  }
  
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  if (rows.length < 2) return;

  const headers = rows[0];
  const dayRow = rows[1];
  let lastTerritory = null;

  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    let rawTerritory = row[1];

    // Skip total/summary rows
    if (rawTerritory === 'Total' || rawTerritory === '% de válidamente emitidas' || 
        row[0] === 'Total' || row[0] === '% de válidamente emitidas') {
      break;
    }

    // Use last territory if current is empty
    if (!rawTerritory && lastTerritory) {
      rawTerritory = lastTerritory;
    }

    if (!rawTerritory) {
      continue;
    }

    // Update last territory tracker
    if (rawTerritory) {
      lastTerritory = rawTerritory;
    }

    const territoryId = TERRITORY_MAP[rawTerritory] || rawTerritory;

    if (!converted.dia1.ppto.terri[territoryId]) {
      converted.dia1.ppto.terri[territoryId] = buildDefaultObject(territoryId, rawTerritory);
    }
    if (!converted.dia2.ppto.terri[territoryId]) {
      converted.dia2.ppto.terri[territoryId] = buildDefaultObject(territoryId, rawTerritory);
    }

    // Use dayRow.length instead of headers.length to include all data columns
    for (let j = 3; j < dayRow.length; j++) {
      let projName = headers[j] || findPreviousHeader(headers, j);
      if (projName) {
        projName = projName.replace(/^>>/, '').trim();
      }
      const day = dayRow[j];
      const votes = parseInt(row[j]) || 0;
      const key = PROJECT_MAP[projName];

      if (key) {
        if (day === 'Dia 1') converted.dia1.ppto.terri[territoryId][key] += votes;
        if (day === 'Dia 2') converted.dia2.ppto.terri[territoryId][key] += votes;
      }
    }
  }
  
  const terriCount = Object.keys(converted.dia1.ppto.terri).length;
  console.log(`  ✓ Parsed ${terriCount} PPTO territories`);
}

function findPreviousHeader(headers, index) {
  for (let i = index; i >= 0; i--) {
    if (headers[i]) return headers[i];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Consejerías Territoriales (CT) sheet parser
//
// Layout (verified against FEUC 2025 and 2026 Puclítico workbooks):
//   Row 0: Campus | Territorio | Mesa | "Candidaturas <lista>" ×N | Blancos | Nulos
//   Row 1: per block: Nombre | Dia 1 | Dia 2 | Total | Total Global
//          (Blancos/Nulos blocks carry only Dia 1 | Dia 2)
//   Data rows are grouped by territory (col 1 set on the territory's first row).
//   Within a territory, each list block runs "candidate layers": the first
//   layer shares rows with the mesas; extra candidates for the same list get
//   their own rows below (mesa cols empty). A candidate's name appears on the
//   FIRST row of their run and their votes continue on the rows below until
//   the next name in the same block. "Total Global" (block+4) on the name row
//   equals the sum of the run's Dia1+Dia2 (used as a cross-check).
// ---------------------------------------------------------------------------
function parseCtSheet(sheet, converted) {
  if (!sheet) return;
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  if (rows.length < 3) return;

  const headers = rows[0];

  // Discover list blocks from "Candidaturas X" headers
  const blocks = [];
  for (let c = 3; c < headers.length; c++) {
    const h = headers[c];
    if (typeof h !== 'string') continue;
    const cleanName = h.replace(/^Candidaturas\s+/i, '').replace(/^>>/, '').trim();
    if (/^Candidaturas\s+/i.test(h)) {
      const key = CT_LIST_MAP[cleanName];
      if (!key) {
        validationErrors.push(`CT: lista desconocida "${h}" en Consejerías Territoriales. Agregarla a config/election.json (parties.ct)`);
        continue;
      }
      blocks.push({ key, name: cleanName, col: c });
    }
  }

  // Blancos / Nulos day columns (Dia 1 | Dia 2)
  let bCol = null;
  let nCol = null;
  for (let c = 3; c < headers.length; c++) {
    if (headers[c] === 'Blancos') bCol = c;
    if (headers[c] === 'Nulos') nCol = c;
  }

  if (blocks.length === 0) {
    console.log('  ⚠ CT sheet has no "Candidaturas" blocks — skipped');
    return;
  }

  // Group rows into territories
  let current = null;
  const territories = [];
  for (let r = 2; r < rows.length; r++) {
    const row = rows[r];
    const rawTerri = row[1];
    if (rawTerri != null && String(rawTerri).trim()) {
      const name = String(rawTerri).trim();
      current = {
        // Key by the Excel's own territory name: CT contests are per-territory,
        // so "Gobierno" must NOT merge into "Sociales y Teología" like the
        // main-site map does for mesa totals.
        id: name,
        name,
        candidates: [],
        b: { dia1: 0, dia2: 0, votos: 0 },
        n: { dia1: 0, dia2: 0, votos: 0 },
        votos: 0,
        votosve: 0,
        escrutada: false,
      };
      territories.push(current);
    }
    if (!current) continue;

    // Per-block candidate runs
    blocks.forEach(blk => {
      const nameVal = row[blk.col];
      const d1 = parseInt(row[blk.col + 1]) || 0;
      const d2 = parseInt(row[blk.col + 2]) || 0;
      if (nameVal != null && String(nameVal).trim()) {
        blk.nextId = (blk.nextId || 0) + 1;
        const cand = {
          id: `${blk.key}-${blk.nextId}`,
          name: String(nameVal).trim(),
          key: blk.key,
          dia1: 0,
          dia2: 0,
          votos: 0,
          pc: 0,
          totalGlobalCell: parseInt(row[blk.col + 4]) || 0,
        };
        current.candidates.push(cand);
      }
      // Only accumulate into the run that belongs to THIS block
      const run = [...current.candidates].reverse().find(c => c.key === blk.key);
      if (run && (d1 || d2 || nameVal)) {
        run.dia1 += d1;
        run.dia2 += d2;
      } else if (d1 || d2) {
        validationWarnings.push(`CT fila ${r + 1}: votos sin candidato en la lista "${blk.name}"`);
      }
    });

    // Blancos / Nulos (any row can carry them; layer rows usually empty)
    if (bCol != null) {
      current.b.dia1 += parseInt(row[bCol]) || 0;
      current.b.dia2 += parseInt(row[bCol + 1]) || 0;
    }
    if (nCol != null) {
      current.n.dia1 += parseInt(row[nCol]) || 0;
      current.n.dia2 += parseInt(row[nCol + 1]) || 0;
    }
  }

  // Finalize territories
  territories.forEach(t => {
    t.candidates.forEach(c => {
      c.votos = c.dia1 + c.dia2;
      if (c.totalGlobalCell && c.totalGlobalCell !== c.votos) {
        validationWarnings.push(
          `CT ${t.name} / ${c.name}: Total Global del Excel (${c.totalGlobalCell}) ≠ suma de días (${c.votos})`
        );
      }
      delete c.totalGlobalCell;
    });
    t.b.votos = t.b.dia1 + t.b.dia2;
    t.n.votos = t.n.dia1 + t.n.dia2;
    t.votosve = t.candidates.reduce((s, c) => s + c.votos, 0);
    t.votos = t.votosve + t.b.votos + t.n.votos;
    t.escrutada = t.votos > 0;
    // Percentages over valid votes (candidate share of the territory's valid votes)
    t.candidates.forEach(c => {
      c.pc = t.votosve > 0 ? Math.round((c.votos / t.votosve) * 100 * 100) / 100 : 0;
    });
    t.candidates.sort((a, b2) => b2.votos - a.votos);
  });

  // University-wide CT totals: aggregated per LIST (candidates differ per territory)
  const byKey = {};
  territories.forEach(t => {
    t.candidates.forEach(c => {
      if (!byKey[c.key]) byKey[c.key] = { key: c.key, dia1: 0, dia2: 0, votos: 0, pc: 0 };
      byKey[c.key].dia1 += c.dia1;
      byKey[c.key].dia2 += c.dia2;
    });
    converted.ct.total.b.dia1 += t.b.dia1;
    converted.ct.total.b.dia2 += t.b.dia2;
    converted.ct.total.n.dia1 += t.n.dia1;
    converted.ct.total.n.dia2 += t.n.dia2;
    converted.ct.terri[t.id] = t;
    converted.ct.terriList.push({ id: t.id, name: t.name });
  });
  const totalVotosve = Object.values(byKey).reduce((s, p) => s + p.dia1 + p.dia2, 0);
  Object.values(byKey).forEach(p => {
    p.votos = p.dia1 + p.dia2;
    p.pc = totalVotosve > 0 ? Math.round((p.votos / totalVotosve) * 100 * 100) / 100 : 0;
  });
  converted.ct.total.parties = Object.values(byKey).sort((a, b2) => b2.votos - a.votos);
  converted.ct.total.b.votos = converted.ct.total.b.dia1 + converted.ct.total.b.dia2;
  converted.ct.total.n.votos = converted.ct.total.n.dia1 + converted.ct.total.n.dia2;
  converted.ct.total.votosve = totalVotosve;
  converted.ct.total.votos = totalVotosve + converted.ct.total.b.votos + converted.ct.total.n.votos;
  converted.ct.total.escrutada = converted.ct.total.votos > 0;

  console.log(`  ✓ CT: ${territories.length} territories, ${Object.keys(byKey).length} lists, ${converted.ct.total.votos} votes`);
}

// Build default object dynamically from config (single source of truth)
function buildDefaultObject(id, name) {
  const obj = {
    id, name,
    b: 0, bpc: 0, n: 0, npc: 0,
    votosve: 0, votos: 0, escrutada: false, participacion: 0,
  };
  // Add all party keys (union of lista and sup — sup-only keys must exist on
  // the object or parsing drops their votes to NaN)
  const seen = new Set();
  ['lista', 'sup'].forEach(group => {
    ELECTION_CONFIG.parties[group].forEach(p => {
      if (seen.has(p.key)) return;
      seen.add(p.key);
      obj[p.key] = 0;
      obj[p.key + 'pc'] = 0;
    });
  });
  // Add all project keys
  ELECTION_CONFIG.projects.forEach(p => {
    obj[p.key] = 0;
    obj[p.key + 'pc'] = 0;
  });
  return obj;
}

function calculateAggregates(converted) {
  ['lista', 'sup'].forEach(tipo => {
    const keys = tipo === 'lista' ? LISTA_KEYS : SUP_KEYS;
    // Process each day
    ['dia1', 'dia2'].forEach(dia => {
      const dayData = converted[dia][tipo];
      const totalObj = dayData.total = buildDefaultObject('total', 'Total');
      
      // Aggregate territories from mesas
      Object.values(dayData.mesa).forEach(mesa => {
        const tId = mesa.territoryId;
        if (!dayData.terri[tId]) {
          const rawName = Object.keys(TERRITORY_MAP).find(k => TERRITORY_MAP[k] === tId) || tId;
          dayData.terri[tId] = buildDefaultObject(tId, rawName);
        }
        
        keys.forEach(k => {
          dayData.terri[tId][k] += mesa[k];
          totalObj[k] += mesa[k];
        });
        
        calculatePercentages(mesa, keys);
        mesa.escrutada = mesa.votos > 0;
      });

      Object.values(dayData.terri).forEach(t => calculatePercentages(t, keys));
      calculatePercentages(totalObj, keys);
      totalObj.escrutada = totalObj.votos > 0;
    });

    // Phase 2: Calculate combined totals (dia1 + dia2)
    const totalData = converted.total[tipo];
    totalData.total = buildDefaultObject('total', 'Total');
    
    // First, copy all mesas and sum dia1 + dia2
    const allMesaIds = new Set([
      ...Object.keys(converted.dia1[tipo].mesa),
      ...Object.keys(converted.dia2[tipo].mesa)
    ]);
    
    allMesaIds.forEach(mId => {
      const m1 = converted.dia1[tipo].mesa[mId] || buildDefaultObject(mId, mId);
      const m2 = converted.dia2[tipo].mesa[mId] || buildDefaultObject(mId, mId);
      const mTotal = totalData.mesa[mId] = buildDefaultObject(mId, m1.name || m2.name);
      mTotal.territoryId = m1.territoryId || m2.territoryId;
      
      keys.forEach(k => {
        mTotal[k] = m1[k] + m2[k];
        totalData.total[k] += mTotal[k];
      });
      calculatePercentages(mTotal, keys);
      mTotal.escrutada = m1.escrutada || m2.escrutada;
    });

    // Aggregate territories for total
    const allTerriIds = new Set([
      ...Object.keys(converted.dia1[tipo].terri),
      ...Object.keys(converted.dia2[tipo].terri)
    ]);
    
    allTerriIds.forEach(tId => {
      const t1 = converted.dia1[tipo].terri[tId] || buildDefaultObject(tId, tId);
      const t2 = converted.dia2[tipo].terri[tId] || buildDefaultObject(tId, tId);
      const tTotal = totalData.terri[tId] = buildDefaultObject(tId, t1.name || t2.name);
      
      keys.forEach(k => {
        tTotal[k] = t1[k] + t2[k];
      });
      calculatePercentages(tTotal, keys);
      // Participation per territory from the Tricel padrón (config/padron.json)
      const terriPadron = PADRON_TERRI[tId] || 0;
      tTotal.participacion = terriPadron > 0
        ? Math.round((tTotal.votos / terriPadron) * 100)
        : 0;
    });
    
    calculatePercentages(totalData.total, keys);
    totalData.total.participacion = Math.round((totalData.total.votos / TOTAL_VOTERS) * 100);
    totalData.total.escrutada = totalData.total.votos > 0;
    
    console.log(`  ✓ ${tipo} total: ${totalData.total.votos} votes`);
  });

  // PPTO Total aggregation
  const pDataTotal = converted.total.ppto;
  const pptoKeys = PROJECT_KEYS;

  // First calculate dia1 and dia2 percentages
  ['dia1', 'dia2'].forEach(dia => {
    Object.values(converted[dia].ppto.terri).forEach(t => calculatePercentages(t, PROJECT_KEYS));
    converted[dia].ppto.total = buildDefaultObject('total', 'Total');
    Object.values(converted[dia].ppto.terri).forEach(terri => {
      pptoKeys.forEach(k => {
        converted[dia].ppto.total[k] += terri[k];
      });
    });
    calculatePercentages(converted[dia].ppto.total, PROJECT_KEYS);
    converted[dia].ppto.total.escrutada = converted[dia].ppto.total.votos > 0;
  });

  // Then calculate combined
  const allPptoTerriIds = new Set([
    ...Object.keys(converted.dia1.ppto.terri),
    ...Object.keys(converted.dia2.ppto.terri)
  ]);
  
  allPptoTerriIds.forEach(tId => {
    const t1 = converted.dia1.ppto.terri[tId] || buildDefaultObject(tId, tId);
    const t2 = converted.dia2.ppto.terri[tId] || buildDefaultObject(tId, tId);
    const tTotal = pDataTotal.terri[tId] = buildDefaultObject(tId, t1.name || t2.name);
    
    pptoKeys.forEach(k => {
      tTotal[k] = t1[k] + t2[k];
    });
    calculatePercentages(tTotal, PROJECT_KEYS);
  });

  pDataTotal.total = buildDefaultObject('total', 'Total');
  Object.values(pDataTotal.terri).forEach(terri => {
    pptoKeys.forEach(k => {
      pDataTotal.total[k] += terri[k];
    });
  });
  calculatePercentages(pDataTotal.total, PROJECT_KEYS);
  pDataTotal.total.escrutada = pDataTotal.total.votos > 0;
  
  console.log(`  ✓ PPTO total: ${pDataTotal.total.votos} votes`);
}

function calculatePercentages(obj, keys) {
  const total = keys.reduce((sum, k) => sum + obj[k], 0);
  obj.votos = total;
  obj.votosve = total - (obj.b || 0) - (obj.n || 0);
  
  if (total > 0) {
    keys.forEach(k => {
      obj[k + 'pc'] = Math.round((obj[k] / total) * 100 * 100) / 100;
    });
  }
}

fetchData();
