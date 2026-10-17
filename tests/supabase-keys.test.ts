import test from 'node:test';
import assert from 'node:assert/strict';
import { getSupabasePublicKey } from '../src/lib/supabase/keys.ts';
import { getSupabaseSecretKey } from '../src/lib/supabase/server-keys.ts';

const envNames = [
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

function withSyntheticKeys(run: () => void) {
  const before = new Map(envNames.map((name) => [name, process.env[name]]));
  try {
    for (const name of envNames) delete process.env[name];
    run();
  } finally {
    for (const [name, value] of before) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test('Supabase key selectors prefer current API key names and keep legacy fallbacks', () => {
  withSyntheticKeys(() => {
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_synthetic';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_synthetic';
    process.env.SUPABASE_SECRET_KEY = 'sb_secret_synthetic';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_synthetic';
    assert.equal(getSupabasePublicKey(), 'sb_publishable_synthetic');
    assert.equal(getSupabaseSecretKey(), 'sb_secret_synthetic');
  });
  withSyntheticKeys(() => {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_synthetic';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_synthetic';
    assert.equal(getSupabasePublicKey(), 'anon_synthetic');
    assert.equal(getSupabaseSecretKey(), 'service_role_synthetic');
  });
});
