// /core/services/storage/supabase.js
// Adapter that uses your existing supabaseClient.js (kept at project root for now).
import { supabase } from '../../../supabaseClient.js';

export default function supabaseAdapter(_cfg){
  return {
    // --- Market (preview) ---
    async listListings(filter = {}){
      let q = supabase.from('listings').select('*').order('created_at', { ascending: false });
      if (filter.status) q = q.eq('status', filter.status);
      const { data, error } = await q;
      if (error){ console.warn('listListings error:', error); return []; }
      return data || [];
    },
    async getListing(id){
      const { data, error } = await supabase.from('listings').select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },
    async createListing(payload){
      const { data, error } = await supabase.from('listings').insert(payload).select('id').single();
      if (error) throw error;
      return { id: data.id };
    },
    async updateListing(id, payload){
      const { error } = await supabase.from('listings').update(payload).eq('id', id);
      if (error) throw error;
    },
    async deleteListing(id){
      const { error } = await supabase.from('listings').delete().eq('id', id);
      if (error) throw error;
    },

    // --- Analyses/Mestplan (extend later) ---
    async listAnalyses(filter = {}){
      let q = supabase.from('analyses').select('*');
      if (filter.type) q = q.eq('type', filter.type);
      const { data, error } = await q;
      if (error){ console.warn('listAnalyses error:', error); return []; }
      return data || [];
    },
    async savePlan(plan){
      const { data, error } = await supabase.from('plans').insert(plan).select('id').single();
      if (error) throw error;
      return { id: data.id };
    },
  };
}
