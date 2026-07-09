import { writeFile } from 'node:fs/promises';
import { lookup } from 'node:dns/promises';

const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
const output = process.argv[2] || 'config.js';

if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(supabaseUrl)) {
  throw new Error('SUPABASE_URL must be a valid https://*.supabase.co URL');
}
if (supabaseAnonKey.length < 40) {
  throw new Error('SUPABASE_ANON_KEY is missing or invalid');
}

try {
  await lookup(new URL(supabaseUrl).hostname);
} catch {
  throw new Error(`SUPABASE_URL host cannot be resolved: ${new URL(supabaseUrl).hostname}`);
}

const config = { supabaseUrl, supabaseAnonKey };
await writeFile(output, `window.__PMO_CONFIG__ = ${JSON.stringify(config, null, 2)};\n`, 'utf8');
console.log(`Generated ${output}`);
