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

const SHEET_URL = process.env.SHEET_URL;
const CACHE_FILE = path.join(ROOT_DIR, 'temp', 'last_count.xlsx');
const OUTPUT_FILE = path.join(ROOT_DIR, 'public', 'data.json');

// Parse command line arguments
const args = process.argv.slice(2);
const fileArgIndex = args.indexOf('--file');
const LOCAL_FILE = fileArgIndex !== -1 ? args[fileArgIndex + 1] : null;

// Build maps from configuration
const TERRITORY_MAP = TERRITORIES_CONFIG.territories;
const MESA_MAP = TERRITORIES_CONFIG.mesas;

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
const TOTAL_VOTERS = ELECTION_CONFIG.election.totalVoters;

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
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));
  console.log('\n✓ Data transformed and saved to', OUTPUT_FILE);
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
    
    // Check which configured parties are active
    const activeParties = ELECTION_CONFIG.parties[type].filter(p => p.active);
    
    activeParties.forEach(party => {
      const found = party.excelNames.some(name => {
        const cleanName = name.replace(/^>>/, '').trim();
        return headers.includes(cleanName);
      });
      
      if (found) {
        console.log(`  ✓ ${party.displayName} (${party.key})`);
      } else {
        validationWarnings.push(`Party "${party.displayName}" (${party.key}) not found in ${sheetMap[type]}`);
        console.log(`  ⚠ ${party.displayName} (${party.key}) - not found`);
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
    
    const activeProjects = ELECTION_CONFIG.projects.filter(p => p.active);
    
    activeProjects.forEach(project => {
      const found = project.excelNames.some(name => {
        const cleanName = name.replace(/^>>/, '').trim();
        return headers.includes(cleanName);
      });
      
      if (found) {
        console.log(`  ✓ ${project.displayName} (${project.key})`);
      } else {
        validationWarnings.push(`Project "${project.displayName}" (${project.key}) not found in ${sheetMap.ppto}`);
        console.log(`  ⚠ ${project.displayName} (${project.key}) - not found`);
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
  };

  const sheetNames = workbook.SheetNames;
  
  // Find sheet names (ignore Territorial sheets)
  let listaSheetName = sheetNames[0];
  let supSheetName = sheetNames[1];
  let pptoSheetName = sheetNames[2];
  
  sheetNames.forEach(name => {
    const lower = name.toLowerCase();
    
    // Skip Territorial sheets (they contain "Candidaturas" prefixed names)
    if (lower.includes('territorial')) {
      console.log(`  Skipping sheet: ${name} (Territorial - not supported)`);
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
  console.log(`  PPTO: ${pptoSheetName}`);

  parseMainSheet(workbook.Sheets[listaSheetName], converted, 'lista');
  parseMainSheet(workbook.Sheets[supSheetName], converted, 'sup');
  parsePptoSheet(workbook.Sheets[pptoSheetName], converted);

  calculateAggregates(converted);
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
      converted.dia1[tipo].mesa[mesaId] = createDefaultObject(mesaId, rawMesa);
      converted.dia1[tipo].mesa[mesaId].territoryId = territoryId;
    }
    if (!converted.dia2[tipo].mesa[mesaId]) {
      converted.dia2[tipo].mesa[mesaId] = createDefaultObject(mesaId, rawMesa);
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
      converted.dia1.ppto.terri[territoryId] = createDefaultObject(territoryId, rawTerritory);
    }
    if (!converted.dia2.ppto.terri[territoryId]) {
      converted.dia2.ppto.terri[territoryId] = createDefaultObject(territoryId, rawTerritory);
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

function createDefaultObject(id, name) {
  return {
    id, name,
    mg: 0, mgpc: 0, nau: 0, naupc: 0, sdd: 0, sddpc: 0, b: 0, bpc: 0, n: 0, npc: 0,
    votosve: 0, votos: 0, escrutada: false, participacion: 0,
    mapau: 0, mapaupc: 0, ani: 0, anipc: 0, tdicoll: 0, tdicollpc: 0,
    elp: 0, elppc: 0, tdicai: 0, tdicaipc: 0, caco: 0, cacopc: 0,
    spch: 0, spchpc: 0, jsf: 0, jsfpc: 0, clmun: 0, clmunpc: 0, proy: 0, proypc: 0,
  };
}

function calculateAggregates(converted) {
  ['lista', 'sup'].forEach(tipo => {
    // Process each day
    ['dia1', 'dia2'].forEach(dia => {
      const dayData = converted[dia][tipo];
      const totalObj = dayData.total = createDefaultObject('total', 'Total');
      
      // Aggregate territories from mesas
      Object.values(dayData.mesa).forEach(mesa => {
        const tId = mesa.territoryId;
        if (!dayData.terri[tId]) {
          const rawName = Object.keys(TERRITORY_MAP).find(k => TERRITORY_MAP[k] === tId) || tId;
          dayData.terri[tId] = createDefaultObject(tId, rawName);
        }
        
        const keys = ['mg', 'nau', 'sdd', 'elp', 'proy', 'b', 'n'];
        keys.forEach(k => {
          dayData.terri[tId][k] += mesa[k];
          totalObj[k] += mesa[k];
        });
        
        calculatePercentages(mesa);
        mesa.escrutada = mesa.votos > 0;
      });

      Object.values(dayData.terri).forEach(t => calculatePercentages(t));
      calculatePercentages(totalObj);
    });

    // Phase 2: Calculate combined totals (dia1 + dia2)
    const totalData = converted.total[tipo];
    totalData.total = createDefaultObject('total', 'Total');
    
    // First, copy all mesas and sum dia1 + dia2
    const allMesaIds = new Set([
      ...Object.keys(converted.dia1[tipo].mesa),
      ...Object.keys(converted.dia2[tipo].mesa)
    ]);
    
    allMesaIds.forEach(mId => {
      const m1 = converted.dia1[tipo].mesa[mId] || createDefaultObject(mId, mId);
      const m2 = converted.dia2[tipo].mesa[mId] || createDefaultObject(mId, mId);
      const mTotal = totalData.mesa[mId] = createDefaultObject(mId, m1.name || m2.name);
      mTotal.territoryId = m1.territoryId || m2.territoryId;
      
      const keys = ['mg', 'nau', 'sdd', 'elp', 'proy', 'b', 'n'];
      keys.forEach(k => {
        mTotal[k] = m1[k] + m2[k];
        totalData.total[k] += mTotal[k];
      });
      calculatePercentages(mTotal);
      mTotal.escrutada = m1.escrutada || m2.escrutada;
    });

    // Aggregate territories for total
    const allTerriIds = new Set([
      ...Object.keys(converted.dia1[tipo].terri),
      ...Object.keys(converted.dia2[tipo].terri)
    ]);
    
    allTerriIds.forEach(tId => {
      const t1 = converted.dia1[tipo].terri[tId] || createDefaultObject(tId, tId);
      const t2 = converted.dia2[tipo].terri[tId] || createDefaultObject(tId, tId);
      const tTotal = totalData.terri[tId] = createDefaultObject(tId, t1.name || t2.name);
      
      const keys = ['mg', 'nau', 'sdd', 'elp', 'proy', 'b', 'n'];
      keys.forEach(k => {
        tTotal[k] = t1[k] + t2[k];
      });
      calculatePercentages(tTotal);
      // No per-territory participation (no eligible voter data available)
      tTotal.participacion = 0;
    });
    
    calculatePercentages(totalData.total);
    totalData.total.participacion = Math.round((totalData.total.votos / TOTAL_VOTERS) * 100);
    
    console.log(`  ✓ ${tipo} total: ${totalData.total.nau} NAU!, ${totalData.total.mg} Amanecer`);
  });

  // PPTO Total aggregation
  const pDataTotal = converted.total.ppto;
  const keys = ['tdicai', 'tdicoll', 'ani', 'caco', 'spch', 'jsf', 'clmun', 'b', 'n'];

  // First calculate dia1 and dia2 percentages
  ['dia1', 'dia2'].forEach(dia => {
    Object.values(converted[dia].ppto.terri).forEach(t => calculatePercentages(t, true));
    converted[dia].ppto.total = createDefaultObject('total', 'Total');
    Object.values(converted[dia].ppto.terri).forEach(terri => {
      keys.forEach(k => {
        converted[dia].ppto.total[k] += terri[k];
      });
    });
    calculatePercentages(converted[dia].ppto.total, true);
  });

  // Then calculate combined
  const allPptoTerriIds = new Set([
    ...Object.keys(converted.dia1.ppto.terri),
    ...Object.keys(converted.dia2.ppto.terri)
  ]);
  
  allPptoTerriIds.forEach(tId => {
    const t1 = converted.dia1.ppto.terri[tId] || createDefaultObject(tId, tId);
    const t2 = converted.dia2.ppto.terri[tId] || createDefaultObject(tId, tId);
    const tTotal = pDataTotal.terri[tId] = createDefaultObject(tId, t1.name || t2.name);
    
    keys.forEach(k => {
      tTotal[k] = t1[k] + t2[k];
    });
    calculatePercentages(tTotal, true);
  });

  pDataTotal.total = createDefaultObject('total', 'Total');
  Object.values(pDataTotal.terri).forEach(terri => {
    keys.forEach(k => {
      pDataTotal.total[k] += terri[k];
    });
  });
  calculatePercentages(pDataTotal.total, true);
  
  console.log(`  ✓ PPTO total: ${pDataTotal.total.votos} votes`);
}

function calculatePercentages(obj, isPpto = false) {
  const keys = isPpto ? 
    ['tdicai', 'tdicoll', 'ani', 'caco', 'spch', 'jsf', 'clmun', 'b', 'n'] :
    ['mg', 'nau', 'sdd', 'elp', 'proy', 'b', 'n'];
  
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
