// Public settings only. These two values are safe to put in the browser.
// Find them in Supabase: Project Settings > API (or "API Keys").
//   SUPABASE_URL      looks like https://abcdxyz.supabase.co
//   SUPABASE_ANON_KEY the key labelled "anon" / "public" / "publishable"
//
// NEVER paste the "service_role" or "secret" key here. Anyone can read this file.

const CONFIG = {
  SUPABASE_URL: "https://gfaqrrqahbpaylfqeciy.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdmYXFycnFhaGJwYXlsZnFlY2l5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzNDg4MjAsImV4cCI6MjEwNzkyNDgyMH0.zTzP3hE_QQHJ9VRGQ41Oi968_6JCgG-Ss8ebsIhIuLo",

  // Members sign in with a username. Supabase needs an email behind each
  // account, so the app builds a hidden one: username@<this domain>.
  // Nothing is ever sent to it. If sign-up says the email is not allowed,
  // tell me and we will change this one line.
  EMAIL_DOMAIN: "hostel-users.example.com",
};