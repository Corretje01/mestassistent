// /core/services/storage/supabase.js
// Adapter die je bestaande supabaseClient.js gebruikt (geen breuken)

import { supabase } from '../../supabaseClient.js';

export default function supabaseAdapter(_cfg) {
  return {
    async listListings(filter = {}) {
      // Tabellaanname: 'listings' (kan later anders heten; code faalt niet hard)
      let q = supabase.from('listings').select('*').order('created_at', { ascending: false });
      if (filter.status) q = q.eq('status', filter.status);
      const { data, error } = await q;
      if (error) {
        // Zachte fallback: geen throw -> lege lijst, plus console waarschuwing
        console.warn('listListings error or table missing:', error);
        return [];
      }
      return data || [];
    },

    async createListing(payload) {
      const { data, error } = await supabase.from('listings').insert(payload).select('id').single();
      if (error) throw error;
      return { id: data.id };
    },

    async getListing(id) {
      const { data, error } = await supabase.from('listings').select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },

    async updateListing(id, payload) {
      const { error } = await supabase.from('listings').update(payload).eq('id', id);
      if (error) throw error;
    },

    async deleteListing(id) {
      const { error } = await supabase.from('listings').delete().eq('id', id);
      if (error) throw error;
    },
  };
}
