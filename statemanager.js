/**
 * statemanager.js
 * Centrale state voor mestplan applicatie
 */

export const StateManager = (() => {
  const state = {
    mestTypes: {},          // Alle mesttypes uit mestsoorten.json
    actieveMest: {},        // Geselecteerde mestsoorten met tonnage
    locks: {},              // Vergrendelstatus per slider-id
    gebruiksruimte: { A: 0, B: 0, C: 0 }, // Gebruiksruimte (stikstof/fosfaat)
    kunstmest: 0            // Kunstmesthoeveelheid (kg N)
  };

  return {
    // Inladen mesttypes uit JSON
    setMestTypes(data) {
      state.mestTypes = data;
    },

    getMestTypes() {
      return state.mestTypes;
    },

    // Gebruikersruimte instellen
    setGebruiksruimte(A, B, C) {
      state.gebruiksruimte = { A, B, C };
    },

    getGebruiksruimte() {
      return { ...state.gebruiksruimte };
    },

    // Actieve mest beheren
    addMestType(id, data) {
      state.actieveMest[id] = { ...data, ton: 0 };
    },

    removeMestType(id) {
      delete state.actieveMest[id];
    },

    getActieveMest() {
      return state.actieveMest;
    },

    setMestTonnage(id, ton) {
      if (state.actieveMest[id]) {
        state.actieveMest[id].ton = ton;
      }
    },

    // Kunstmest beheren
    setKunstmest(waarde) {
      state.kunstmest = waarde;
    },

    getKunstmest() {
      return state.kunstmest;
    },

    // Locks beheren
    setLock(id, locked) {
      state.locks[id] = locked;
    },

    isLocked(id) {
      return state.locks[id] === true;
    },

    getLocks() {
      return { ...state.locks };
    },

    // Volledige kopie van de state
    getState() {
      return JSON.parse(JSON.stringify(state));
    }
  };
})();
