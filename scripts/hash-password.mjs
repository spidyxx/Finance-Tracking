// Generate a bcrypt hash for the app login password.
// Usage:  npm run hash-password -- "your-password"
//   or:   npm run hash-password           (prompts on stdin)
import bcrypt from "bcryptjs";
import { createInterface } from "node:readline/promises";

const ROUNDS = 12;

async function getPassword() {
  const fromArg = process.argv[2];
  if (fromArg) return fromArg;
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const pw = await rl.question("Password to hash: ");
  rl.close();
  return pw;
}

const password = await getPassword();
if (!password) {
  console.error("No password provided.");
  process.exit(1);
}

const hash = await bcrypt.hash(password, ROUNDS);
console.log(hash);
console.error("\nSet this as APP_PASSWORD_HASH in your .env");
