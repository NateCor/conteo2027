import $ from 'jquery';
import Chart from 'chart.js';
import { getData, defaultObject } from './dataFetcher.js';
import { defaultProjects } from './projectsArray.js';
import rivets from 'rivets';
import _ from 'underscore';
import { getActiveProjects, getActiveParties, getElectionType, setRuntimeData } from './config.js';

import {
  defaultChartsOptions,
  listaDefaultData,
  supDefaultData,
  projectsDefaultData,
} from './chartVars.js';

// Chart.js global configuration
Chart.defaults.global.elements.arc.borderWidth = 2;
Chart.defaults.global.elements.arc.borderColor = '#ddd';

const getDefaults = (n) => Array(n).fill(100 / n);

$(document).ready(() => {

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
  let mesasEscrutadas = { mesas: [], actual: 0, total: 0 };
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

  rivets.bind($('#bind-total-lista'), totalLista);
  rivets.bind($('#bind-total-sup'), totalSup);
  rivets.bind($('#bind-mesa-lista'), mesaLista);
  rivets.bind($('#bind-mesa-sup'), mesaSup);
  rivets.bind($('#bind-terri-sup'), terriSup);
  rivets.bind($('#bind-terri-lista'), terriLista);
  rivets.bind($('#bind-projects'), projects);
  rivets.bind($('#bind-mesas'), mesasEscrutadas);
  rivets.bind($('#bind-participacion'), participacion);
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

  function renderData() {
    getData()
      .then((object) => {
        setRuntimeData(object);
        mainData = object;
        updateMainDataElements('getData');
      })
      .catch((a) => {
        console.error(a);
        // Visible failure notice: a broken/missing data.json previously left
        // blank charts with no explanation.
        $('#header').after(
          '<div class="container"><div class="notification is-danger">' +
          'No se pudo cargar data.json — verifica que corriste ' +
          '<code>npm run fetch-data</code>. Revisa la consola para detalles.' +
          '</div></div>'
        );
      });
  }

  renderData();

  const updateMainDataElements = (sender) => {
    let diaTotal = $('input[name=total-dia]:checked').val();
    let diaMesa = $('input[name=mesa-dia]:checked').val();
    let diaTerri = $('input[name=terri-dia]:checked').val();
    let diaPpto = $('input[name=ppto-dia]:checked').val();

    let selectedMesa = $('form[name=selected-mesa] select').val();
    let selectedTerri = $('form[name=selected-terri] select').val();
    let selectedPpto = $('form[name=selected-ppto] select').val();

    const listaKeys = [...getActiveParties('lista').map(p => p.key + 'pc'), 'bpc', 'npc'];
    const supKeys = [...getActiveParties('sup').map(p => p.key + 'pc'), 'bpc', 'npc'];

    if (sender === 'getData') {
      // Update election type from runtime data (may differ from config fallback)
      headerData.electionType = getElectionType();
      headerData.isFirstRound = headerData.electionType === 'firstRound';

      // Update chart labels and colors from active parties (may differ from fallback)
      const activeLista = getActiveParties('lista');
      const activeSup = getActiveParties('sup');
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

      // Update header data with ranked parties
      const updateHeaderParties = (type) => {
        const parties = getActiveParties(type);
        const total = mainData.total[type].total;
        return parties.map(p => ({
          key: p.key,
          name: p.name,
          color: p.color,
          pc: total[`${p.key}pc`] || 0,
          votes: total[p.key] || 0,
          advances: false
        })).sort((a, b) => b.pc - a.pc);
      };

      // Mark top 2 as advancing in first round and add rank index
      const markAdvancing = (parties) => {
        if (headerData.electionType === 'firstRound') {
          parties[0].advances = true;
          parties[1].advances = true;
        }
        parties.forEach((p, i) => { p.index = i + 1; });
        return parties;
      };

      // Mutate arrays in-place so Rivets re-renders reliably
      const newLista = markAdvancing(updateHeaderParties('lista'));
      headerData.lista.parties.splice(0, headerData.lista.parties.length, ...newLista);
      const newSup = markAdvancing(updateHeaderParties('sup'));
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
