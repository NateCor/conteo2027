import { PARTY_CONFIG, PROJECT_CONFIG, getActiveParties, getActiveProjects } from './config.js';

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
  const activeParties = getActiveParties('lista');
  const labels = [...activeParties.map(p => p.name), 'Blancos', 'Nulos'];
  const colors = [...activeParties.map(p => p.color), '#FFFFFF', '#000000'];
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
  const activeParties = getActiveParties('sup');
  const labels = [...activeParties.map(p => p.name), 'Blancos', 'Nulos'];
  const colors = [...activeParties.map(p => p.color), '#FFFFFF', '#000000'];
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
  const activeProjects = getActiveProjects();
  const labels = [...activeProjects.map(p => p.name), 'Blancos', 'Nulos'];
  const colors = [...activeProjects.map(p => p.color), '#FFFFFF', '#000000'];
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
