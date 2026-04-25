#!/usr/bin/env node

import xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import maps from fetch-data.js (we'll need to duplicate them here for standalone use)
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
console.log('📊 Excel Test Runner');
console.log('='.repeat(60));
console.log(`📁 File: ${filePath}\n`);

const workbook = xlsx.readFile(filePath);

console.log(`📋 Sheets found: ${workbook.SheetNames.length}`);
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
  console.log(`📄 Sheet ${sheetIndex + 1}: ${sheetName}`);
  console.log(`${'─'.repeat(60)}`);
  
  const sheet = workbook.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  
  if (rows.length < 2) {
    console.log('   ⚠️  Sheet has insufficient data');
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
      const header = headers[j] || findPreviousHeader(headers, j);
      if (header) {
        if (!isPpto && !PARTY_MAP[header]) {
          warnings.unmappedParties.add(header);
        }
        if (isPpto && !PROJECT_MAP[header]) {
          warnings.unmappedProjects.add(header);
        }
      }
    }
    
    if (row[0] || rawTerritory || rawMesa) {
      processedRows++;
    }
  }
  
  console.log(`\n   ✓ Processed ${processedRows} data rows`);
});

function findPreviousHeader(headers, index) {
  for (let i = index; i >= 0; i--) {
    if (headers[i]) return headers[i];
  }
  return null;
}

// Summary
console.log(`\n${'='.repeat(60)}`);
console.log('📊 Test Summary');
console.log(`${'='.repeat(60)}\n`);

let hasIssues = false;

if (warnings.unmappedTerritories.size > 0) {
  hasIssues = true;
  console.log('❌ Unmapped Territories:');
  warnings.unmappedTerritories.forEach(t => console.log(`   • ${t}`));
  console.log('');
} else {
  console.log('✅ All territories mapped\n');
}

if (warnings.unmappedMesas.size > 0) {
  hasIssues = true;
  console.log('❌ Unmapped Mesas:');
  warnings.unmappedMesas.forEach(m => console.log(`   • ${m}`));
  console.log('');
} else {
  console.log('✅ All mesas mapped\n');
}

if (warnings.unmappedParties.size > 0) {
  hasIssues = true;
  console.log('❌ Unmapped Parties:');
  warnings.unmappedParties.forEach(p => console.log(`   • ${p}`));
  console.log('');
} else {
  console.log('✅ All parties mapped\n');
}

if (warnings.unmappedProjects.size > 0) {
  hasIssues = true;
  console.log('❌ Unmapped Projects:');
  warnings.unmappedProjects.forEach(p => console.log(`   • ${p}`));
  console.log('');
} else {
  console.log('✅ All projects mapped\n');
}

// Generate test output
const testOutputPath = path.join(__dirname, '..', 'temp', 'test-output.json');
console.log(`📁 Saving test output to: ${testOutputPath}`);

try {
  // Import and run the actual fetch script logic
  const data = parseWorkbook(workbook);
  fs.writeFileSync(testOutputPath, JSON.stringify(data, null, 2));
  console.log('✅ Test output saved successfully\n');
} catch (error) {
  console.log('❌ Error generating test output:', error.message, '\n');
}

// Final verdict
if (hasIssues) {
  console.log('⚠️  EXCEL HAS COMPATIBILITY ISSUES');
  console.log('   Update TERRITORY_MAP, MESA_MAP, or PROJECT_MAP to resolve');
  console.log('   See scripts/fetch-data.js for mapping locations\n');
} else {
  console.log('🎉 EXCEL IS FULLY COMPATIBLE');
  console.log('   Ready for production use!\n');
}

// Placeholder parse function (simplified)
function parseWorkbook(workbook) {
  // This is a simplified version - you can import the full one from fetch-data.js
  return {
    sheets: workbook.SheetNames,
    rows: workbook.SheetNames.map(name => {
      const sheet = workbook.Sheets[name];
      return xlsx.utils.sheet_to_json(sheet).length;
    })
  };
}
