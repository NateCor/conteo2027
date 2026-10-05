import electionConfig from '../../config/election.json';

// Export election metadata
export const ELECTION = electionConfig.election;
export const TOTAL_VOTERS = electionConfig.election.totalVoters;

// Build party configuration from election config
export const PARTY_CONFIG = {
  lista: buildPartyMap(electionConfig.parties.lista),
  sup: buildPartyMap(electionConfig.parties.sup)
};

// Build project configuration from election config
export const PROJECT_CONFIG = buildProjectMap(electionConfig.projects);

// Global key → color map across all party groups and projects
const COLOR_BY_KEY = {};
['lista', 'sup', 'ct'].forEach(group => {
  (electionConfig.parties[group] || []).forEach(p => { COLOR_BY_KEY[p.key] = p.color; });
});
electionConfig.projects.forEach(p => { COLOR_BY_KEY[p.key] = p.color; });
export const colorFor = (key) => COLOR_BY_KEY[key] || '#888';

// Runtime data from data.json (null until loaded)
let runtimeData = null;

// Set runtime data (called after data.json is fetched)
export function setRuntimeData(data) {
  runtimeData = data;
}

// Helper function to build party map
function buildPartyMap(parties) {
  const map = {};
  parties.forEach(party => {
    map[party.key] = {
      name: party.displayName,
      color: party.color
    };
  });
  return map;
}

// Helper function to build project map
function buildProjectMap(projects) {
  const map = {};
  projects.forEach(project => {
    map[project.key] = {
      name: project.displayName,
      color: project.color
    };
  });
  return map;
}

// Get active party keys — prefers runtime data (from Excel), falls back to config active flags
function getActivePartyKeys(type) {
  if (runtimeData && runtimeData.activeParties && runtimeData.activeParties[type]) {
    return runtimeData.activeParties[type];
  }
  return electionConfig.parties[type].filter(p => p.active).map(p => p.key);
}

// Export active parties for dynamic chart generation
export function getActiveParties(type) {
  const activeKeys = getActivePartyKeys(type);
  return activeKeys
    .map(key => {
      const p = electionConfig.parties[type].find(party => party.key === key);
      return p ? { key: p.key, name: p.displayName, color: p.color } : null;
    })
    .filter(Boolean);
}

// Full configured party list for a contest type (every list that can run),
// regardless of what the current data detected.
export function getAllParties(type) {
  return (electionConfig.parties[type] || []).map(p => ({
    key: p.key,
    name: p.displayName,
    color: p.color
  }));
}

// Export active projects for dynamic chart generation
export function getActiveProjects() {
  if (runtimeData && runtimeData.activeParties && runtimeData.activeParties.projects) {
    return runtimeData.activeParties.projects
      .map(key => {
        const p = electionConfig.projects.find(proj => proj.key === key);
        return p ? { key: p.key, name: p.displayName, color: p.color } : null;
      })
      .filter(Boolean);
  }
  return electionConfig.projects
    .filter(p => p.active)
    .map(p => ({
      key: p.key,
      name: p.displayName,
      color: p.color
    }));
}

// Detect election type based on number of active parties
export function getElectionType() {
  if (runtimeData && runtimeData.electionType) {
    return runtimeData.electionType;
  }
  // Explicit maintainer setting in config (controls display until Excel data loads)
  const configuredRound = (electionConfig.election.round || '').toLowerCase();
  if (configuredRound.includes('primera')) return 'firstRound';
  if (configuredRound.includes('segunda') || configuredRound.includes('ballotage')) return 'secondRound';
  const activeParties = electionConfig.parties.lista.filter(p => p.active);
  return activeParties.length > 2 ? 'firstRound' : 'secondRound';
}