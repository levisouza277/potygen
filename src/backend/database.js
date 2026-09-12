const SUPABASE_URL = "https://xjzydvtcqywnwmrltzkr.supabase.co";

const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhqenlkdnRjcXl3bndtcmx0emtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMDkyMzEsImV4cCI6MjA5NDg4NTIzMX0.QCvTBvVCjxu4Wa65hitMQLsgEkNL4pXUNgmu__o8PCE";

const supabaseClient = supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);