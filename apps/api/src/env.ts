// Imported first by main.ts so process.env is populated before modules read it at decoration time.
// Real environment variables win; .env (cwd = apps/api) only fills gaps.
try {
  process.loadEnvFile();
} catch {
  // no .env file: rely on the real environment
}

if (process.env.NODE_ENV === 'production') {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === 'change-me' || secret.length < 32) {
    throw new Error('JWT_SECRET must be set to a random value of at least 32 characters in production');
  }
}
