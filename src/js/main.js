import $ from 'jquery';
import Chart from 'chart.js';
import { defaultObject } from './dataFetcher.js';
import { startLiveRefresh } from './liveRefresh.js';
import { defaultProjects } from './projectsArray.js';
import rivets from 'rivets';
import _ from 'underscore';
import { getActiveProjects, getActiveParties, getAllParties, getElectionType, setRuntimeData, colorFor } from './config.js';

import {
  defaultChartsOptions,
  listaDefaultData,
  supDefaultData,
  projectsDefaultData,
} from './chartVars.js';

// Chart.js global configuration. Slice borders follow the theme: light grey
// on light, a lighter grey on dark so navy/black slices keep their outline.
const ARC_BORDER = { light: '#ddd', dark: '#8b8f9c' };
const isDark = () => document.documentElement.classList.contains('dark');
Chart.defaults.global.elements.arc.borderWidth = 2;
Chart.defaults.global.elements.arc.borderColor = isDark() ? ARC_BORDER.dark : ARC_BORDER.light;

const getDefaults = (n) => Array(n).fill(100 / n);

// ✏️ EDITABLE: textos que aparecen en la página y se generan desde código.
// Puedes cambiar lo que está entre comillas. No borres las comillas, las
// comas ni los nombres de la izquierda (vivo, reconectando, etc.).
const TEXTOS = {
  vivo: '● En vivo · actualizado',          // + hora, ej. "● En vivo · actualizado 21:05:10"
  reconectando: '● Reconectando… · datos de', // + hora de los últimos datos buenos
  badgeAvanza: 'Avanza',                      // conteo terminado, 1° y 2° lugar
  badgeVa: 'Va',                              // conteo en curso: "Va 1°" / "Va 2°"
  badgeEmpate: 'Empate',                      // empate en el corte del 2° lugar
  errorCarga: 'No se pudo cargar data.json — verifica que corriste ' +
    '<code>npm run fetch-data</code>. Revisa la consola para detalles.',
};

$(document).ready(() => {

  // Theme switch: light by default for everyone; the viewer's choice is
  // saved and restored. The OS dark setting is deliberately ignored.
  const applyTheme = (dark) => {
    document.documentElement.classList.toggle('dark', dark);
    // Switch shows its state (on = dark); the label always names the mode
    // it controls, so it reads the same in both themes.
    $('#theme-toggle').attr('aria-checked', dark ? 'true' : 'false');
    const border = dark ? ARC_BORDER.dark : ARC_BORDER.light;
    Chart.defaults.global.elements.arc.borderColor = border;
    Object.values(Chart.instances).forEach((c) => {
      c.options.elements.arc.borderColor = border;
      c.update(0);
    });
  };
  applyTheme(isDark());
  $('#theme-toggle').on('click', () => {
    const dark = !isDark();
    try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch (e) {}
    applyTheme(dark);
  });

  let mainData;

  const $ctxTotalLista = $('#total-lista');
  const $ctxTotalSup = $('#total-sup');
  const $ctxMesaLista = $('#mesa-lista');
  const $ctxMesaSup = $('#mesa-sup');
  const $ctxTerriLista = $('#terri-lista');
  const $ctxTerriSup = $('#terri-sup');
  const $ctxProjects = $('#ppto');

  const chartTotalLista = new Chart($ctxTotalLista, {
      type: 'pie',
      data: listaDefaultData(),
      options: defaultChartsOptions,
    });
  const chartTotalSup = new Chart($ctxTotalSup, {
      type: 'pie',
      data: supDefaultData(),
      options: defaultChartsOptions,
    });
  const chartMesaLista = new Chart($ctxMesaLista, {
      type: 'pie',
      data: listaDefaultData(),
      options: defaultChartsOptions,
    });
  const chartMesaSup = new Chart($ctxMesaSup, {
      type: 'pie',
      data: supDefaultData(),
      options: defaultChartsOptions,
    });
  const chartTerriLista = new Chart($ctxTerriLista, {
      type: 'pie',
      data: listaDefaultData(),
      options: defaultChartsOptions,
    });
  const chartTerriSup = new Chart($ctxTerriSup, {
      type: 'pie',
      data: supDefaultData(),
      options: defaultChartsOptions,
    });
  const chartProjects = new Chart($ctxProjects, {
      type: 'pie',
      data: projectsDefaultData(),
      options: defaultChartsOptions,
    });

  let totalLista = _.extend({}, defaultObject);
  let totalSup = _.extend({}, defaultObject);
  let mesaLista = _.extend({}, defaultObject);
  let mesaSup = _.extend({}, defaultObject);
  let terriLista = _.extend({}, defaultObject);
  let terriSup = _.extend({}, defaultObject);
  let projects = _.extend({ projects: defaultProjects }, defaultObject);
  let participacion = { terris: [] };
  let mesasEscrutadas = { mesas: [], actual: 0, total: 0, pc: 0 };
  // CT: per-territory candidates (day-aware display values)
  // CT pie holds raw votes (unlike the other pies which hold percentages),
  // so it needs its own tooltip: "Nombre: 382 votos (25.4%)".
  const chartCt = new Chart($('#ct'), {
    type: 'pie',
    data: listaDefaultData(),
    options: {
      ...defaultChartsOptions,
      tooltips: {
        callbacks: {
          label: function (tooltipItem, data) {
            const vals = data.datasets[tooltipItem.datasetIndex].data;
            const total = vals.reduce((s, v) => s + (v || 0), 0);
            const val = vals[tooltipItem.index];
            const lab = data.labels[tooltipItem.index];
            const pct = total > 0 ? fmtPc(Math.round((val / total) * 1000) / 10) : 0;
            return `${lab}: ${fmtNum(val)} votos (${pct}%)`;
          },
        },
      },
    },
  });
  let ctView = {
    candidates: [],
    votos: 0,
    votosve: 0,
    escrutada: false,
  };
  let headerData = { 
    electionType: getElectionType(),
    isFirstRound: getElectionType() === 'firstRound',
    lista: { parties: [] },
    sup: { parties: [] }
  };

  rivets.binders.width = function (el, value) {
    el.style.width = `${value}%`;
  };

  rivets.binders.addclass = function (el, value) {
    if (el.addedClass) {
      $(el).removeClass(el.addedClass);
      delete el.addedClass;
    }

    if (value) {
      $(el).addClass(value);
      el.addedClass = value;
    }
  };

  rivets.binders['style-background'] = function (el, value) {
    el.style.backgroundColor = value;
  };

  // Chilean number format: 4.142 votos, 12,5 %. Percentages switch to a
  // decimal comma too, or "4.142" and "12.5" would read ambiguously.
  const fmtNum = (v) => (Number(v) || 0).toLocaleString('es-CL', { maximumFractionDigits: 0 });
  const fmtPc = (v) => (Number(v) || 0).toLocaleString('es-CL', { maximumFractionDigits: 2 });
  rivets.formatters.num = fmtNum;
  rivets.formatters.pc = fmtPc;

  rivets.bind($('#bind-total-lista'), totalLista);
  rivets.bind($('#bind-progress'), mesasEscrutadas);
  rivets.bind($('#bind-total-sup'), totalSup);
  rivets.bind($('#bind-mesa-lista'), mesaLista);
  rivets.bind($('#bind-mesa-sup'), mesaSup);
  rivets.bind($('#bind-terri-sup'), terriSup);
  rivets.bind($('#bind-terri-lista'), terriLista);
  rivets.bind($('#bind-projects'), projects);
  rivets.bind($('#bind-mesas'), mesasEscrutadas);
  rivets.bind($('#bind-participacion'), participacion);
  rivets.bind($('#bind-ct'), ctView);
  rivets.bind($('#bind-header'), headerData);
  rivets.bind($('#bind-second-round'), headerData);

  // Show/hide header sections based on election type
  const updateHeaderVisibility = () => {
    $('#bind-header').toggle(headerData.isFirstRound);
    $('#bind-second-round').toggle(!headerData.isFirstRound);
  };

  // Show/hide PPTO section based on whether there are active projects
  const updatePptoVisibility = () => {
    $('#bind-ppto-section').toggle(getActiveProjects().length > 0);
  };

  // Shared chart update: pick the *pc keys, parse, fall back to equal slices
  // when every value is 0 (e.g. before data loads or for an unescrutada view).
  const updateChartData = (chart, dataObj, pcKeys) => {
    const newData = _.chain(dataObj)
      .pick(pcKeys)
      .map(parseFloat).value();
    if (_.any(newData, (n) => n > 0)) {
      chart.data.datasets[0].data = newData;
    } else {
      chart.data.datasets[0].data = getDefaults(pcKeys.length);
    }
    chart.update();
  };

  // Party list for first-round displays: the FULL configured list per contest
  // (every list that can run), merged with whatever the data detected, so the
  // headers always reflect the full party list. Second round shows only the
  // parties actually in the runoff.
  const displayParties = (type) => {
    const detected = getActiveParties(type);
    if (!headerData.isFirstRound) return detected;
    const byKey = {};
    getAllParties(type).forEach(p => { byKey[p.key] = p; });
    detected.forEach(p => { byKey[p.key] = p; });
    return Object.values(byKey);
  };

  updateHeaderVisibility();
  updatePptoVisibility();

  $(document).on(
    'change',
    'input[name=total-dia]',
    () => { if (mainData) { updateMainDataElements('total'); } }
  );

  $(document).on(
    'change',
    'input[name=mesa-dia], form[name=selected-mesa] select',
    () => { if (mainData) { updateMainDataElements('mesa'); } }
  );

  $(document).on(
    'change',
    'input[name=terri-dia], form[name=selected-terri] select',
    () => { if (mainData) { updateMainDataElements('terri'); } });

  $(document).on(
    'change',
    'input[name=ppto-dia], form[name=selected-ppto] select',
    () => { if (mainData) { updateMainDataElements('ppto'); } });

  $(document).on(
    'change',
    'input[name=ct-dia], form[name=selected-ct] select',
    () => { if (mainData && mainData.ct) { updateCtElements(); } });

  // Live mode: data.json is re-checked on an interval and the page re-renders
  // in place when it changes. Selections (day, mesa, territory, CT) are read
  // from the DOM on every render, so a refresh never resets what the viewer
  // is looking at.
  const applyData = (object) => {
    setRuntimeData(object);
    mainData = object;
    updateMainDataElements('getData');
    if (object.ct && object.ct.terriList && object.ct.terriList.length) {
      populateCtSelector();
      updateCtElements();
    }
    updateCtVisibility();
  };

  const $liveStatus = $('#live-status');
  const hhmmss = (d) => d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  let lastUpdatedAt = null;
  const showLoadError = (visible) => {
    let $banner = $('#data-error');
    if (visible && !$banner.length) {
      // Visible failure notice: a broken/missing data.json previously left
      // blank charts with no explanation.
      $('#header').after(
        '<div class="container" id="data-error"><div class="notification is-danger">' +
        TEXTOS.errorCarga +
        '</div></div>'
      );
    } else if (!visible) {
      $banner.remove();
    }
  };

  startLiveRefresh({
    onData: applyData,
    onStatus: ({ state, checkedAt, hasData }) => {
      if (checkedAt) lastUpdatedAt = checkedAt;
      if (state === 'live') {
        showLoadError(false);
        $liveStatus.removeClass('is-stale').addClass('is-live')
          .text(`${TEXTOS.vivo} ${lastUpdatedAt ? hhmmss(lastUpdatedAt) : ''}`);
      } else {
        if (!hasData) showLoadError(true);
        $liveStatus.removeClass('is-live').addClass('is-stale')
          .text(`${TEXTOS.reconectando} ${lastUpdatedAt ? hhmmss(lastUpdatedAt) : '—'}`);
      }
    },
  });

  // CT: fill the territory selector from the Excel's own territory names
  const populateCtSelector = () => {
    const $sel = $('form[name=selected-ct] select');
    const keep = $sel.val(); // live refresh must not reset the viewer's pick
    $sel.empty();
    $sel.append('<option value="total">Total Universidad</option>');
    mainData.ct.terriList.forEach((t) => {
      $sel.append(`<option value="${t.id}">${t.name}</option>`);
    });
    if (keep && $sel.find(`option[value="${keep}"]`).length) $sel.val(keep);
  };

  const updateCtVisibility = () => {
    const hasCt = !!(mainData && mainData.ct && mainData.ct.terriList && mainData.ct.terriList.length);
    $('#ct-section').toggle(hasCt);
  };

  // CT: render candidates for the selected territory/day
  const updateCtElements = () => {
    const dia = $('input[name=ct-dia]:checked').val() || 'total';
    const sel = $('form[name=selected-ct] select').val() || 'total';
    const ct = mainData.ct;
    const diaKey = dia === 'total' ? 'votos' : dia;

    // Aggregate the selected scope: one territory or the whole university
    const scope = sel === 'total' ? Object.values(ct.terri) : [ct.terri[sel]].filter(Boolean);
    const byCandidate = {};
    scope.forEach((t) => {
      t.candidates.forEach((c) => {
        const uid = `${t.id}|${c.id}`;
        if (!byCandidate[uid]) {
          byCandidate[uid] = {
            name: sel === 'total' ? `${c.name} (${t.name})` : c.name,
            key: c.key,
            votes: 0,
          };
        }
        byCandidate[uid].votes += c[diaKey] || 0;
      });
    });

    const list = Object.values(byCandidate).sort((a, b) => b.votes - a.votes);
    const validVotes = list.reduce((s, c) => s + c.votes, 0);
    list.forEach((c) => {
      c.pc = validVotes > 0 ? Math.round((c.votes / validVotes) * 100 * 100) / 100 : 0;
      c.votos = c.votes;
    });
    ctView.candidates.splice(0, ctView.candidates.length, ...list);

    let b = 0; let n = 0;
    scope.forEach((t) => {
      b += (dia === 'total' ? t.b.votos : t.b[dia]) || 0;
      n += (dia === 'total' ? t.n.votos : t.n[dia]) || 0;
    });
    ctView.votos = validVotes + b + n;
    ctView.votosve = validVotes;
    ctView.escrutada = ctView.votos > 0;

    // Pie: one slice per candidate, colored by their list
    const labels = [...list.map((c) => c.name)];
    const colors = [...list.map((c) => colorFor(c.key))];
    const data = [...list.map((c) => c.votes)];
    if (labels.length) {
      chartCt.data.labels = labels;
      chartCt.data.datasets[0].backgroundColor = colors;
      chartCt.data.datasets[0].data = data.some((v) => v > 0) ? data : getDefaults(labels.length);
      chartCt.update();
    }
  };

  const updateMainDataElements = (sender) => {
    let diaTotal = $('input[name=total-dia]:checked').val();
    let diaMesa = $('input[name=mesa-dia]:checked').val();
    let diaTerri = $('input[name=terri-dia]:checked').val();
    let diaPpto = $('input[name=ppto-dia]:checked').val();

    let selectedMesa = $('form[name=selected-mesa] select').val();
    let selectedTerri = $('form[name=selected-terri] select').val();
    let selectedPpto = $('form[name=selected-ppto] select').val();

    if (sender === 'getData') {
      // Update election type from runtime data (may differ from config fallback)
      headerData.electionType = getElectionType();
      headerData.isFirstRound = headerData.electionType === 'firstRound';

      // Update chart labels and colors from active parties (may differ from fallback)
      const activeLista = displayParties('lista');
      const activeSup = displayParties('sup');
      const activeProjs = getActiveProjects();
      const listaLabels = [...activeLista.map(p => p.name), 'Blancos', 'Nulos'];
      const listaColors = [...activeLista.map(p => p.color), '#FFFFFF', '#000000'];
      const supLabels = [...activeSup.map(p => p.name), 'Blancos', 'Nulos'];
      const supColors = [...activeSup.map(p => p.color), '#FFFFFF', '#000000'];
      const projLabels = [...activeProjs.map(p => p.name), 'Blancos', 'Nulos'];
      const projColors = [...activeProjs.map(p => p.color), '#FFFFFF', '#000000'];

      [chartTotalLista, chartMesaLista, chartTerriLista].forEach(c => {
        c.data.labels = listaLabels;
        c.data.datasets[0].backgroundColor = listaColors;
      });
      [chartTotalSup, chartMesaSup, chartTerriSup].forEach(c => {
        c.data.labels = supLabels;
        c.data.datasets[0].backgroundColor = supColors;
      });
      chartProjects.data.labels = projLabels;
      chartProjects.data.datasets[0].backgroundColor = projColors;

      // Rebuild projects array from active projects (may differ from config fallback)
      projects.projects = activeProjs.map(p => ({
        name: p.name,
        id: p.key,
        pc: 0
      }));

      // Hide PPTO section if no active projects
      updatePptoVisibility();

      // Counting progress per contest: one flag per mesa per day.
      const countProgress = (type) => {
        const ids = Object.keys(mainData.total[type].mesa);
        let done = 0;
        ids.forEach((id) => {
          if (mainData.dia1[type].mesa[id] && mainData.dia1[type].mesa[id].escrutada) done++;
          if (mainData.dia2[type].mesa[id] && mainData.dia2[type].mesa[id].escrutada) done++;
        });
        return { done, total: ids.length * 2 };
      };

      // Header ranking: by raw votes (rounded percentages can misorder two
      // close lists and hide a tie).
      const updateHeaderParties = (type) => {
        const parties = displayParties(type);
        const total = mainData.total[type].total;
        return parties.map(p => ({
          key: p.key,
          name: p.name,
          color: p.color,
          pc: total[`${p.key}pc`] || 0,
          votes: total[p.key] || 0,
          advances: false,
          tie: false,
          badge: '',
        })).sort((a, b) => b.votes - a.votes);
      };

      // First-round badges, at most two lists:
      //  - tie at the 2nd/3rd cutoff  -> "Empate" on every tied list
      //  - count complete             -> "Avanza"
      //  - count in progress          -> "Va 1°" / "Va 2°" (not a result yet)
      // Lists with 0 votes never get a badge. No "Gana" badge on purpose:
      // an absolute-majority call mid-count would mislead.
      const markAdvancing = (parties, type) => {
        parties.forEach((p, i) => { p.index = i + 1; });
        if (headerData.electionType !== 'firstRound') return parties;
        const prog = countProgress(type);
        const complete = prog.total > 0 && prog.done === prog.total;
        const cutoff = parties[1] ? parties[1].votes : 0;
        const tiedAtCutoff = cutoff > 0 && parties[2] && parties[2].votes === cutoff;
        parties.forEach((p, i) => {
          if (p.votes <= 0) return;
          if (tiedAtCutoff && p.votes === cutoff) {
            p.badge = TEXTOS.badgeEmpate;
            p.tie = true;
          } else if (i < 2) {
            p.badge = complete ? TEXTOS.badgeAvanza : `${TEXTOS.badgeVa} ${i + 1}°`;
            p.advances = true;
          }
        });
        return parties;
      };

      // Mutate arrays in-place so Rivets re-renders reliably
      const newLista = markAdvancing(updateHeaderParties('lista'), 'lista');
      headerData.lista.parties.splice(0, headerData.lista.parties.length, ...newLista);
      const newSup = markAdvancing(updateHeaderParties('sup'), 'sup');
      headerData.sup.parties.splice(0, headerData.sup.parties.length, ...newSup);

      updateHeaderVisibility();

      let escrutadasActual = 0;
      const mesaEntries = Object.values(mainData.total.lista.mesa);
      mesasEscrutadas.total = mesaEntries.length;
      mesasEscrutadas.mesas = [];
      
      mesaEntries.forEach((mesa) => {
        mesasEscrutadas.mesas.push({
          id: mesa.id,
          name: mesa.name,
          dia1: mainData.dia1.lista.mesa[mesa.id].escrutada,
          dia2: mainData.dia2.lista.mesa[mesa.id].escrutada,
        });

        if (mainData.dia1.lista.mesa[mesa.id].escrutada) {
          escrutadasActual++;
        }

        if (mainData.dia2.lista.mesa[mesa.id].escrutada) {
          escrutadasActual++;
        }
      });

      mesasEscrutadas.actual = escrutadasActual;
      // Multiply total by 2 because it's 2 days per mesa
      mesasEscrutadas.total = mesaEntries.length * 2; 
      mesasEscrutadas.pc = mesasEscrutadas.total
        ? Math.round((mesasEscrutadas.actual / mesasEscrutadas.total) * 1000) / 10
        : 0;

      _.each(mainData.total.lista.terri, (terri) => {
        let updatedTerri = {
          name: terri.name,
          pc: terri.participacion,
        };

        let oldTerri = _.findWhere(participacion.terris, { name: terri.name });
        if (oldTerri) {
          _.extend(oldTerri, updatedTerri);
        } else {
          participacion.terris.push(updatedTerri);
        }
      });

      participacion.terris.sort((a, b) => b.pc - a.pc);
    }

    // Computed AFTER the getData block refreshes isFirstRound, so these picks
    // always match the chart labels set above (runoff data must not inherit
    // the first-round full list).
    const listaKeys = [...displayParties('lista').map(p => p.key + 'pc'), 'bpc', 'npc'];
    const supKeys = [...displayParties('sup').map(p => p.key + 'pc'), 'bpc', 'npc'];

    if (sender !== 'mesa' && sender !== 'terri' && sender !== 'ppto') {
      totalLista = _.extendOwn(totalLista, mainData[diaTotal].lista.total);
      totalSup = _.extendOwn(totalSup, mainData[diaTotal].sup.total);

      updateChartData(chartTotalLista, totalLista, listaKeys);
      updateChartData(chartTotalSup, totalSup, supKeys);
    }

    if (sender !== 'total' && sender !== 'terri' && sender !== 'ppto') {
      mesaLista = _.extendOwn(
        mesaLista,
        mainData[diaMesa].lista.mesa[selectedMesa]
      );

      mesaSup = _.extendOwn(
        mesaSup,
        mainData[diaMesa].sup.mesa[selectedMesa]
      );

      updateChartData(chartMesaLista, mesaLista, listaKeys);
      updateChartData(chartMesaSup, mesaSup, supKeys);
    }

    if (sender !== 'total' && sender !== 'mesa' && sender !== 'ppto') {
      terriLista = _.extendOwn(
        terriLista,
        mainData[diaTerri].lista.terri[selectedTerri]
      );

      terriSup = _.extendOwn(
        terriSup,
        mainData[diaTerri].sup.terri[selectedTerri]
      );

      updateChartData(chartTerriLista, terriLista, listaKeys);
      updateChartData(chartTerriSup, terriSup, supKeys);
    }

    if (sender !== 'total' && sender !== 'mesa' && sender !== 'terri') {
      let extendObj = selectedPpto === 'total' ?
        mainData[diaPpto].ppto.total :
        mainData[diaPpto].ppto.terri[selectedPpto];

      projects = _.extendOwn(
        projects,
        extendObj
      );
      projects.projects.forEach((project) => {
        project.pc = extendObj[`${project.id}pc`];
      });

      const projectsKeys = [...getActiveProjects().map(p => p.key + 'pc'), 'bpc', 'npc'];
      updateChartData(chartProjects, extendObj, projectsKeys);

      projects.projects.sort((a, b) => b.pc - a.pc);
    };
  };
});
