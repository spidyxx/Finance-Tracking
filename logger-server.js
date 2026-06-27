// Production entrypoint for the web container. Tees all stdout/stderr to a
// daily-rotating log file (kept for 30 days) in LOG_DIR, then starts the
// Next.js standalone server. Mirrors the Discord bot's TimedRotatingFileHandler
// (when="midnight", backupCount=30).
//
// Logging is best-effort: if the log file can't be written, the app keeps
// running and just logs to the console — a logging failure never crashes it.
const fs = require("node:fs");
const { createStream } = require("rotating-file-stream");

const LOG_DIR = process.env.LOG_DIR || "/app/logs";

// Capture the real console writers before we patch them.
const origStdout = process.stdout.write.bind(process.stdout);
const origStderr = process.stderr.write.bind(process.stderr);

const pad = (n) => String(n).padStart(2, "0");
// Current file is "app.log"; rotated files become "app-YYYY-MM-DD.log".
const filename = (time) =>
  !time
    ? "app.log"
    : `app-${time.getFullYear()}-${pad(time.getMonth() + 1)}-${pad(time.getDate())}.log`;

let stream = null;
try {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  stream = createStream(filename, {
    path: LOG_DIR,
    interval: "1d", // rotate daily at midnight (local time / TZ)
    maxFiles: 30, // retention: keep 30 rotated files
  });
  stream.on("error", (err) => {
    // Disable file logging on error; keep the app alive on console logging.
    stream = null;
    origStderr(`[logger] file logging disabled: ${err.message}\n`);
  });
} catch (err) {
  origStderr(`[logger] could not init file logging: ${err.message}\n`);
}

for (const channel of ["stdout", "stderr"]) {
  const original = channel === "stdout" ? origStdout : origStderr;
  process[channel].write = (chunk, encoding, callback) => {
    if (stream) {
      try {
        const enc = typeof encoding === "string" ? encoding : "utf8";
        stream.write(typeof chunk === "string" ? chunk : chunk.toString(enc));
      } catch {
        // ignore — console write below still happens
      }
    }
    return original(chunk, encoding, callback);
  };
}

// Start the Next.js standalone server (it begins listening on import).
require("./server.js");
