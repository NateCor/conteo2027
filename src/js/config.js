export const TOTAL_VOTERS = 26500; // Estimated 2026 Padrón

export const COLORS = {
  PINK: '#FFC0CB',
  RED: '#E01E25',
  GREEN: '#6fd528',
  ORANGE: '#e9841d',
  BLUE: '#3EACDE',
  BROWN: '#80583e',
  YELLOW: '#FFFF00',
  MAGENTA: '#FF00FF',
  DARK_BLUE: '#1C4587',
  WHITE: '#FFFFFF',
  BLACK: '#000000',
};

// For 2nd round elections, both Lista and Sup have the same 2 parties
// For full elections, Lista has all 5 parties
export const PARTY_CONFIG = {
  lista: {
    nau: { name: 'NAU!', color: COLORS.GREEN },
    mg: { name: 'Amanecer', color: COLORS.PINK },
    // These will be used in full elections:
    sdd: { name: 'Solidaridad', color: COLORS.RED },
    elp: { name: '1A', color: COLORS.ORANGE },
    proy: { name: 'Avanzar', color: COLORS.BLUE },
  },
  sup: {
    nau: { name: 'NAU!', color: COLORS.GREEN },
    mg: { name: 'Amanecer', color: COLORS.PINK },
    // These will be used if different parties run for Sup:
    sdd: { name: 'Solidaridad', color: COLORS.RED },
    elp: { name: '1A', color: COLORS.ORANGE },
    proy: { name: 'Avanzar', color: COLORS.BLUE },
  }
};

// Projects for Participatory Budget
export const PROJECT_CONFIG = {
  tdicai: { name: 'Trabajos de Invierno CAi', color: COLORS.YELLOW },
  tdicoll: { name: 'Estudiantes por la ESI', color: COLORS.ORANGE },
  ani: { name: 'Animalia UC', color: COLORS.GREEN },
  caco: { name: 'Escuela Popular Paulo Freire', color: COLORS.MAGENTA },
  spch: { name: 'La Obra UC', color: COLORS.DARK_BLUE },
  jsf: { name: 'UCeanos', color: COLORS.RED },
  clmun: { name: 'Trabajos de Verano Proyecta', color: COLORS.WHITE },
  // Keep legacy mappings for compatibility
  mapau: { name: 'MAPAU', color: COLORS.BROWN },
  proy: { name: 'Proyecta', color: COLORS.BLUE },
};
