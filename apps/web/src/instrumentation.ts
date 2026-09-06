import { getSetting } from "./lib/db";
import { gmailConnected, syncGmail } from "./lib/gmail";

declare global {
  // eslint-disable-next-line no-var
  var __jobtrackrGmailScheduler: NodeJS.Timeout | undefined;
}

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs" || globalThis.__jobtrackrGmailScheduler) return;
  const tick = async () => {
    try {
      if (!gmailConnected()) return;
      const interval = getSetting<number>("syncIntervalMinutes") ?? 30;
      const lastSync = getSetting<number>("gmailLastSyncAt") ?? 0;
      if (Date.now() - lastSync * 1000 < interval * 60_000) return;
      const result = await syncGmail();
      console.info(`[gmail-scheduler] scanned=${result.scanned} classified=${result.classified} linked=${result.linked}`);
    } catch (error) {
      console.error("[gmail-scheduler] sync failed", error);
    }
  };
  globalThis.__jobtrackrGmailScheduler = setInterval(() => void tick(), 60_000);
  globalThis.__jobtrackrGmailScheduler.unref?.();
  void tick();
}
