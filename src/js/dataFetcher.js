'use strict';
import _ from 'underscore';
import electionConfig from '../../config/election.json';

// Build default object dynamically from config (single source of truth)
function buildDefaultObject() {
  const obj = {
    b: 0,
    bpc: 0,
    n: 0,
    npc: 0,
    votosve: 0,
    votos: 0,
    escrutada: false,
    participacion: 0,
  };
  // Add all party keys (union of lista and sup — sup-only keys like the
  // CS-only "Trinidad y Amanda" (ex "0%") must exist so its pill/binding renders real values)
  const seen = new Set();
  ['lista', 'sup'].forEach(group => {
    electionConfig.parties[group].forEach(p => {
      if (seen.has(p.key)) return;
      seen.add(p.key);
      obj[p.key] = 0;
      obj[p.key + 'pc'] = 0;
    });
  });
  // Add all project keys
  electionConfig.projects.forEach(p => {
    obj[p.key] = 0;
    obj[p.key + 'pc'] = 0;
  });
  return obj;
}

export const defaultObject = buildDefaultObject();
