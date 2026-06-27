// Load .env into process.env BEFORE any service/Prisma module is imported.
// Node's built-in parser (no dotenv-expand) is used, so values with `$`/`%`
// are not mangled. In production the env comes from the container, so a missing
// .env is fine.
try {
  process.loadEnvFile();
} catch {
  // no .env file — environment is provided by the container
}
