// Runs once when the Node server boots (Next.js instrumentation hook).
// Starts the recurring-entry scheduler: a catch-up pass on startup plus a daily
// run just after midnight. Single container => exactly one scheduler, so no
// duplicate generation. Uses a plain timer (no external cron dependency).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Guard against double-scheduling across dev hot-reloads.
  const g = globalThis as unknown as { __financeSchedulerStarted?: boolean };
  if (g.__financeSchedulerStarted) return;
  g.__financeSchedulerStarted = true;

  const { generateDue } = await import("@/services/recurring");

  const run = async (reason: string) => {
    try {
      const n = await generateDue();
      if (n > 0) {
        console.log(`[recurring] generated ${n} occurrence(s) (${reason})`);
      }
    } catch (e) {
      console.error(`[recurring] generation failed (${reason}):`, e);
    }
  };

  const msUntilNextRun = () => {
    const now = new Date();
    const next = new Date(now);
    next.setHours(0, 5, 0, 0); // 00:05 local time
    if (next <= now) next.setDate(next.getDate() + 1);
    return next.getTime() - now.getTime();
  };

  const scheduleNext = () => {
    setTimeout(async () => {
      await run("daily");
      scheduleNext();
    }, msUntilNextRun()).unref?.();
  };

  await run("startup catch-up");
  scheduleNext();
  console.log("[recurring] scheduler started");
}
