// /core/services/storage/index.js
// Central storage factory. For now we force Supabase. Later you can switch to Zoho/WordPress via config.
import supabaseAdapter from './supabase.js';

export function makeStorage(cfg = {}){
  return supabaseAdapter(cfg.supabase || {});
}
