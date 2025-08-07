// supabaseClient.js

// 1) ESM-import uit de npm-package
import { createClient } from '@supabase/supabase-js';

// 2) Jouw project-gegevens
const SUPABASE_URL  = 'https://joxzxtdkjenyayddtwmn.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpveHp4dGRramVueWF5ZGR0d21uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMwOTI4NTEsImV4cCI6MjA2ODY2ODg1MX0.4gHFI3jPjiVxLVTlgOsvhoa-i6XDkzcQP22FTPcaHm4';  // je anon/public key

// 3) Één instantie, overal hergebruiken
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);
