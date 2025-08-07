// supabaseClient.js

// 1) ESM-import uit de npm-package
import { createClient } from '@supabase/supabase-js';

// 2) Jouw project-gegevens
const SUPABASE_URL  = 'https://joxzxtdkjenyayddtwmn.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…';  // je anon/public key

// 3) Één instantie, overal hergebruiken
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);
