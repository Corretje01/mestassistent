/**
 * stateManager.js
 * Centrale state voor mestplan applicatie
 */

export const StateManager = (() => {

  /**
   * Centrale applicatie state
   */
  const state = {
    mestTypes: {},          // alle mesttypes uit mestsoorten.json
    actieveMest: {},        // actieve mestsoorten met tonnage
    locks: {},              // lock status per slider-id
    standaardLimits: {},    // standaard sliders max waarden
    gebruiksruimte: { A: 0, B: 0, C: 0 }, // gebruiksruimte uit query params
    kunstmest: 0
  };

  return {
    /** Init mestsoorten data */
    setMestTypes(data) {
      state.mestTypes = data;
    },

    /** Stel gebruiksruimte in */
    setGebruiksruimte(A, B, C) {
      state.gebruiksruimte = { A, B, C };
    },

    /** Voeg mestsoort toe */
    addMestType(id, data) {
      state.actieveMest[id] = { ...data, ton: 0 };
    },

    /** Verwijder mestsoort */
    removeMestType(id) {
      delete state.actieveMest[id];
    },

    /** Update tonnage van mestsoort */
    setMestTonnage(id, ton) {
      if (!state.actieveMest[id]) return;
      state.actieveMest[id].ton = ton;
    },

    /** Set kunstmest hoeveelheid */
    setKunstmest(waarde) {
      state.kunstmest = waarde;
    },

    /** Get huidige kunstmest waarde */
    getKunstmest() {
      return state.kunstmest;
    },

    /** Lock status updaten */
    setLock(id, locked) {
      state.locks[id] = locked;
    },

    /** Lock status ophalen */
    isLocked(id) {
      return state.locks[id] === true;
    },

    /** Volledige state ophalen (read-only) */
    getState() {
      return JSON.parse(JSON.stringify(state)); // deep copy om mutatie te vermijden
    },

    /** Actieve mest ophalen */
    getActieveMest() {
      return state.actieveMest;
    },

    /** Gebruiksruimte ophalen */
    getGebruiksruimte() {
      return state.gebruiksruimte;
    }
  }

})();
