import { getActiveParties, getActiveProjects } from './config.js';

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

// Build placeholder pie data (equal slices) from an active party/project list.
// Real values replace these once data.json loads.
function defaultDataFor(activeItems) {
  const labels = [...activeItems.map(p => p.name), 'Blancos', 'Nulos'];
  const colors = [...activeItems.map(p => p.color), '#FFFFFF', '#000000'];
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
}

export const listaDefaultData = () => defaultDataFor(getActiveParties('lista'));

export const supDefaultData = () => defaultDataFor(getActiveParties('sup'));

export const projectsDefaultData = () => defaultDataFor(getActiveProjects());
