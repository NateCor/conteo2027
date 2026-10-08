import { getActiveParties, getActiveProjects } from './config.js';

export const defaultChartsOptions = {
  responsive: true,
  legend: {
    display: false,
  },
  tooltips: {
    callbacks: {
      // Pie data are vote counts (see updateChartData in main.js)
      label: function (tooltipItem, data) {
        const ds = data.datasets[tooltipItem.datasetIndex];
        const lab = data.labels[tooltipItem.index];
        if (ds.placeholder) return `${lab}: sin votos aún`;
        const val = ds.data[tooltipItem.index] || 0;
        return `${lab}: ${val.toLocaleString('es-CL')} votos`;
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
