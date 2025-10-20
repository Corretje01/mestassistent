// /core/services/storage/index.js
// Centrale factory voor data-opslag (nu supabase; later Zoho/WordPress mogelijk)

import supabaseAdapter from './supabase.js';

export function makeStorage(cfg = {}) {
  // Voor nu forceren we supabase (cfg voor later)
  return supabaseAdapter(cfg.supabase || {});
}
