'use strict';
import _ from 'underscore';
import 'whatwg-fetch';

const DATA_URL = '/data.json';

export function getData() {
  return fetch(DATA_URL)
    .then((response) => {
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      return response.json();
    });
};

export function getServerData() {
  return Promise.resolve({});
}

export const defaultObject = {
  mg: 0,
  mgpc: 0,
  nau: 0,
  naupc: 0,
  sdd: 0,
  sddpc: 0,
  b: 0,
  bpc: 0,
  n: 0,
  npc: 0,
  votosve: 0,
  votos: 0,
  escrutada: false,
  participacion: 0,
  mapau: 0,
  mapaupc: 0,
  ani: 0,
  anipc: 0,
  tdicoll: 0,
  tdicollpc: 0,
  elp: 0,
  elppc: 0,
  tdicai: 0,
  tdicaipc: 0,
  caco: 0,
  cacopc: 0,
  spch: 0,
  spchpc: 0,
  jsf: 0,
  jsfpc: 0,
  clmun: 0,
  clmunpc: 0,
  proy: 0,
  proypc: 0,
};
