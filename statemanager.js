/**
 * statemanager.js
 * Centrale state voor mestplan applicatie
 */

export const StateManager = (() => {

  const state = {
    mestTypes: {},          // alle mesttypes uit mestsoorten.json
    actieveMest: {},        // actieve mestsoorten met tonnage
    locks: {},              // lock status per slider-id
    gebruiksruimte: { A: 0, B: 0, C: 0 },
    kunstmest: 0
  };

  return {
    setMestTypes(data) {
      state.mestTypes = data;
    },

    setGebruiksruimte(A, B, C) {
      state.gebruiksruimte = { A, B, C };
    },

    addMestType(id, data) {
      state.actieveMest[id] = { ...data, ton: 0 };
    },

    removeMestType(id) {
      delete state.actieveMest[id];
    },
    
    setMestTonnage(id, ton) {
      if (!state.actieveMest[id]) return;
      state.actieveMest[id].ton = ton;
    },

    setKunstmest(waarde) {
      state.kunstmest = waarde;
    },

    getKunstmest() {
      return state.kunstmest;
    },

    setLock(id, locked) {
      state.locks[id] = locked;
    },

    isLocked(id) {
      return state.locks[id] === true;
    },

    getState() {
      return JSON.parse(JSON.stringify(state));
    },

    getActieveMest() {
      return state.actieveMest;
    },

    getGebruiksruimte() {
      return state.gebruiksruimte;
    }
  }

})();
