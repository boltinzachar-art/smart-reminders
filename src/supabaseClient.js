import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://rdwjxndbuefhtmclifwn.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkd2p4bmRidWVmaHRtY2xpZnduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMzODk2NjgsImV4cCI6MjA3ODk2NTY2OH0.dfpBOPWBjewtgP53pYa06J2-s5bidEHVmw5gcg8sDJ4'

export const supabase = createClient(supabaseUrl, supabaseKey)