const SUPABASE_URL   = 'https://joxzxtdkjenyayddtwmn.supabase.co';  // jouw projecten-URL
const SUPABASE_ANON  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpveHp4dGRramVueWF5ZGR0d21uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMwOTI4NTEsImV4cCI6MjA2ODY2ODg1MX0.4gHFI3jPjiVxLVTlgOsvhoa-i6XDkzcQP22FTPcaHm4';     // jouw public anon key

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
