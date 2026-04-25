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

// Export active parties for dynamic chart generation
export function getActiveParties(type) {
  return electionConfig.parties[type]
    .filter(p => p.active)
    .map(p => ({
      key: p.key,
      name: p.displayName,
      color: p.color
    }));
}

// Export active projects for dynamic chart generation
export function getActiveProjects() {
  return electionConfig.projects
    .filter(p => p.active)
    .map(p => ({
      key: p.key,
      name: p.displayName,
      color: p.color
    }));
}
