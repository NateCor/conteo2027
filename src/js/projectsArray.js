import { getActiveProjects } from './config.js';

// Export active projects from configuration
export const defaultProjects = getActiveProjects().map(p => ({
  name: p.name,
  id: p.key,
  pc: 0
}));
