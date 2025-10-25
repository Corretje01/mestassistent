// core/domain/statemanager.js
/**
 * statemanager.js
 * Centrale state voor mestplan applicatie (robuster + integers)
 */

export const StateManager = (() => {
  // ---------- interne helpers ----------
  const toInt = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n);
  };
  const nonNegInt = (v) => Math.max(0, toInt(v));

  const clone = (obj) => JSON.parse(JSON.stringify(obj));

  // ---------- state ----------
  const state = {
    mestTypes: {},           // alle mesttypes uit mestsoorten.json
    actieveMest: {},         // actieve mestsoorten met tonnage
    locks: {},               // lock status per slider-id (true = vergrendeld)
    gebruiksruimte: { A: 0, B: 0, C: 0 },
    kunstmest: 0
  };

  // ---------- publieke API (backwards compatible) ----------
  function setMestTypes(data) {
    // verwacht het JSON-object (vaste_mest/drijfmest/overig), geen validatie nodig
    state.mestTypes = data || {};
  }

  function setGebruiksruimte(A, B, C) {
    state.gebruiksruimte = {
      A: nonNegInt(A),
      B: nonNegInt(B),
      C: nonNegInt(C),
    };
  }

  function addMestType(id, data) {
    if (!id || !data) return;
    // ton start op 0 (int)
    state.actieveMest[id] = { ...data, ton: 0 };
  }

  function removeMestType(id) {
    if (!id) return;
    delete state.actieveMest[id];
    // lock op dit id laten we staan; UI kan dat eventueel opnieuw gebruiken.
  }

  function setMestTonnage(id, ton) {
    if (!state.actieveMest[id]) return;
    // forceer integer en ondergrens 0
    state.actieveMest[id].ton = nonNegInt(ton);
  }

  function setKunstmest(waarde) {
    state.kunstmest = nonNegInt(waarde);
  }

  function getKunstmest() {
    return state.kunstmest;
  }

  function setLock(id, locked) {
    if (!id) return;
    state.locks[id] = !!locked;
  }

  function isLocked(id) {
    return state.locks[id] === true;
  }

  // ------- extra helpers (niet verplicht, breken niets) -------
  function toggleLock(id) {
    if (!id) return;
    state.locks[id] = !state.locks[id];
  }

  function clearLocks() {
    state.locks = {};
  }

  function getLocks() {
    return { ...state.locks };
  }

  // Deep copy voor hypothetische berekeningen (sneller en netter dan overal JSON.stringify te doen)
  function getStateDeepCopy() {
    return clone(state);
  }

  function getState() {
    // behoud bestaande functie (sommige code verwacht deep copy)
    return clone(state);
  }

  function getActieveMest() {
    return state.actieveMest;
  }

  function getGebruiksruimte() {
    return state.gebruiksruimte;
  }

  function getMestTypes() {
    return state.mestTypes;
  }

  return {
    // bestaande API
    setMestTypes,
    setGebruiksruimte,
    addMestType,
    removeMestType,
    setMestTonnage,
    setKunstmest,
    getKunstmest,
    setLock,
    isLocked,
    getState,
    getActieveMest,
    getGebruiksruimte,

    // extra veilig/handig
    getStateDeepCopy,
    toggleLock,
    clearLocks,
    getLocks,
    getMestTypes
  };
})();

export default StateManager;
