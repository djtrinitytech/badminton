import * as Ably from "ably";
export const CHANNEL = "vyuha:scores";
export function realtime() {
  if (!process.env.ABLY_API_KEY) return null;
  globalThis.__vyuhaAbly ||= new Ably.Rest(process.env.ABLY_API_KEY);
  return globalThis.__vyuhaAbly;
}
export async function publish(revision) {
  const client = realtime();
  if (!client) return false;
  try {
    await client.channels.get(CHANNEL).publish("updated", { revision });
    return true;
  } catch {
    console.error(
      "Realtime publish failed. Clients will recover via synchronization.",
    );
    return false;
  }
}
