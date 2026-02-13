import axios from 'axios';
import xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const SHEET_URL = process.env.SHEET_URL;
const CACHE_FILE = 'temp/last_count.xlsx';
const OUTPUT_FILE = 'public/data.json';

const TERRITORY_MAP = {
  "Agronomía y Sistemas Naturales": "agro",
  "Ciencias Biológicas": "csbio",
  "Ciencias de la Salud": "salud",
  "Ciencias Exactas": "astrofismat",
  "College": "coll",
  "Ing. Comercial": "comer",
  "Comunicaciones": "com",
  "Construcción Civil": "constru",
  "Derecho": "der",
  "Educación": "educa",
  "Enfermería": "enf",
  "Gobierno": "soc",
  "Humanidades": "hum",
  "Ingeniería": "ing",
  "Lo Contador": "loconta",
  "Medicina": "med",
  "Odontología": "odonto",
  "Oriente": "oriente",
  "Psicología": "psi",
  "Química": "quim",
  "Sociales y Teología": "soc",
  "Villarica": "vill"
};

const MESA_MAP = {
  "Agronomía 1": "agro1",
  "Agronomía 2": "agro2",
  "Ing. en RRNN": "collnat",
  "CCBB Casa Central 1": "csbiocc",
  "CCBB San Joaquin 2": "csbiosj",
  "Veterinaria": "csbiosj",
  "Kinesiología": "saludsj",
  "Fonoaudiología": "saludsj",
  "Terapia Ocupacional": "saludsj",
  "Nutrición": "saludcc",
  "CCEE 1": "comer1",
  "College 1": "collcc",
  "College 2": "collsoc",
  "College 3": "collnat",
  "College 4": "colllc",
  "College 5": "collo",
  "Comercial 1": "comer1",
  "Comercial 2": "comer2",
  "Comercial 3": "comer2",
  "Comercial 4": "comer2",
  "Comercial 5": "comer2",
  "Comunicaciones 1": "com",
  "Construcción Civil 1": "constru",
  "Construcción CIvil 2": "constru",
  "Derecho 1": "der1",
  "Derecho 2": "der2",
  "Derecho 3": "der2",
  "Educación 1": "educa1",
  "Educación 2": "educa2",
  "Educación 3": "educa2",
  "Educación 4": "educa2",
  "Educación 5": "educa2",
  "Educación 6": "educa2",
  "Enfermería San Joaquin": "enfsj",
  "Enfermería Casa Central": "enfcc",
  "Gobierno 1": "soc",
  "CP, Geografía e Historia": "soc",
  "Letras y Filosofía": "hum",
  "Ingeniería 1": "ing1",
  "Ingeniería 2": "ing2",
  "Ingeniería 3": "ing3",
  "Ingeniería 4": "ing4",
  "Ingeniería 5": "ing5",
  "Arquitectura": "arqui",
  "Diseño": "dno",
  "Medicina Casa Central 1": "med",
  "Medicina Hosp. Sótero del Río": "sotero",
  "Odontología San Joaquin 1": "odontosj",
  "Oriente 1": "oriente",
  "Oriente 2": "oriente",
  "Psicología 1": "psi",
  "Química 1": "quim",
  "Sociales 1": "soc",
  "Sociales 2": "soc",
  "Sociales 3": "soc",
  "Campus Villarica": "vill"
};

const PARTY_MAP = {
  'NAU!': 'nau',
  'Amanecer': 'mg',
  'Solidaridad': 'sdd',
  '1A': 'elp',
  'Avanzar': 'proy',
  'Blancos': 'b',
  'Nulos': 'n'
};

const PROJECT_MAP = {
  'Trabajos de Invierno CAi': 'tdicai',
  'Estudiantes por la ESI': 'tdicoll',
  'Animalia UC': 'ani',
  'Escuela Popular Paulo Freire': 'caco',
  'La Obra UC': 'spch',
  'UCeanos': 'jsf',
  'Trabajos de Verano Proyecta': 'clmun',
  'Blancos': 'b',
  'Nulos': 'n'
};

const TOTAL_VOTERS = 26500;

async function fetchData() {
  if (!SHEET_URL) {
    console.error('SHEET_URL is not defined in .env');
    return;
  }

  let buffer;
  try {
    const response = await axios.get(SHEET_URL, { responseType: 'arraybuffer', maxRedirects: 5 });
    buffer = response.data;
    fs.writeFileSync(CACHE_FILE, Buffer.from(buffer));
  } catch (error) {
    if (fs.existsSync(CACHE_FILE)) {
      buffer = fs.readFileSync(CACHE_FILE);
    } else {
      process.exit(1);
    }
  }

  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const data = transformWorkbook(workbook);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));
}

function transformWorkbook(workbook) {
  const converted = {
    dia1: { lista: { mesa: {}, terri: {}, total: {} }, sup: { mesa: {}, terri: {}, total: {} }, ppto: { terri: {}, total: {} } },
    dia2: { lista: { mesa: {}, terri: {}, total: {} }, sup: { mesa: {}, terri: {}, total: {} }, ppto: { terri: {}, total: {} } },
    total: { lista: { mesa: {}, terri: {}, total: {} }, sup: { mesa: {}, terri: {}, total: {} }, ppto: { terri: {}, total: {} } },
  };

  parseMainSheet(workbook.Sheets[workbook.SheetNames[0]], converted, 'lista');
  parseMainSheet(workbook.Sheets[workbook.SheetNames[1]], converted, 'sup');
  parsePptoSheet(workbook.Sheets[workbook.SheetNames[2]], converted);

  calculateAggregates(converted);
  return converted;
}

function parseMainSheet(sheet, converted, tipo) {
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  if (rows.length < 2) return;

  const headers = rows[0];
  const dayRow = rows[1];

  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    const rawTerritory = row[1];
    const rawMesa = row[2];
    
    // Stop at total rows or if mesa is missing
    if (!rawMesa || rawMesa === 'Total' || rawTerritory === 'Total' || rawTerritory === '% de válidamente emitidas') {
      console.log(`Stopping at row ${i}: rawMesa="${rawMesa}", rawTerritory="${rawTerritory}"`);
      break;
    }

    const territoryId = TERRITORY_MAP[rawTerritory] || rawTerritory;
    const mesaId = MESA_MAP[rawMesa] || rawMesa;

    if (rawTerritory && !TERRITORY_MAP[rawTerritory]) console.warn(`[WARNING] Unmapped Territory: "${rawTerritory}"`);
    if (rawMesa && !MESA_MAP[rawMesa]) console.warn(`[WARNING] Unmapped Mesa: "${rawMesa}"`);

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
      const partyName = headers[j] || findPreviousHeader(headers, j);
      const day = dayRow[j];
      const votes = parseInt(row[j]) || 0;
      const key = PARTY_MAP[partyName];

      if (key) {
        if (day === 'Dia 1') converted.dia1[tipo].mesa[mesaId][key] += votes;
        if (day === 'Dia 2') converted.dia2[tipo].mesa[mesaId][key] += votes;
      }
    }
  }
  
  console.log(`Parsed ${Object.keys(converted.dia1[tipo].mesa).length} mesas for ${tipo}`);
}

function parsePptoSheet(sheet, converted) {
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

    // Use last territory if current is empty (Excel has merged cells visually)
    if (!rawTerritory && lastTerritory) {
      rawTerritory = lastTerritory;
    }

    // Skip if no territory and no mesa (empty row)
    if (!rawTerritory && !rawMesa) {
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
      const projName = headers[j] || findPreviousHeader(headers, j);
      const day = dayRow[j];
      const votes = parseInt(row[j]) || 0;
      const key = PROJECT_MAP[projName];

      if (key) {
        if (day === 'Dia 1') converted.dia1.ppto.terri[territoryId][key] += votes;
        if (day === 'Dia 2') converted.dia2.ppto.terri[territoryId][key] += votes;
      }
    }
  }

  console.log(`Parsed ${Object.keys(converted.dia1.ppto.terri).length} PPTO territories`);
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
    // Phase 1: Aggregate dia1 and dia2 totals separately
    ['dia1', 'dia2'].forEach(dia => {
      const dayData = converted[dia][tipo];
      const totalObj = dayData.total = createDefaultObject('total', 'Total');
      
      // Aggregate mesas into territories and totals
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
      
      console.log(`${tipo} ${dia} total:`, totalObj.nau, 'NAU! votes,', totalObj.mg, 'Amanecer votes');
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
      tTotal.participacion = Math.round((tTotal.votos / 1500) * 100);
    });
    
    calculatePercentages(totalData.total);
    totalData.total.participacion = Math.round((totalData.total.votos / TOTAL_VOTERS) * 100);
    
    console.log(`${tipo} COMBINED total:`, totalData.total.nau, 'NAU! votes,', totalData.total.mg, 'Amanecer votes');
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
