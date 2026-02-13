import { PARTY_CONFIG, PROJECT_CONFIG } from './config.js';
import { defaultProjects } from './projectsArray.js';

export const defaultChartsOptions = {
  responsive: true,
  legend: {
    display: false,
  },
  tooltips: {
    callbacks: {
      label: function (tooltipItem, data) {
        let val = data.datasets[tooltipItem.datasetIndex]
          .data[tooltipItem.index];
        let lab = data.labels[tooltipItem.index];
        return `${lab}: ${val}%`;
      },
    },
  },
};

export function listaDefaultData() {
  const labels = Object.values(PARTY_CONFIG.lista).map(p => p.name);
  const colors = Object.values(PARTY_CONFIG.lista).map(p => p.color);
  const data = labels.map(() => 100 / labels.length);
  return {
    labels: labels,
    datasets: [
      {
        data: data,
        backgroundColor: colors,
      },
    ],
  };
};

export function supDefaultData() {
  const labels = Object.values(PARTY_CONFIG.sup).map(p => p.name);
  const colors = Object.values(PARTY_CONFIG.sup).map(p => p.color);
  const data = labels.map(() => 100 / labels.length);
  return {
    labels: labels,
    datasets: [
      {
        data: data,
        backgroundColor: colors,
      },
    ],
  };
};

export function projectsDefaultData() {
  // Use the actual projects from projectsArray.js
  const labels = defaultProjects.map(p => p.name);
  const colors = defaultProjects.map(p => {
    // Get color from PROJECT_CONFIG if available
    const config = PROJECT_CONFIG[p.id];
    return config ? config.color : '#999999';
  });
  const data = labels.map(() => 100 / labels.length);
  
  return {
    labels: labels,
    datasets: [
      {
        data: data,
        backgroundColor: colors,
      },
    ],
  };
};
