import { initialState, RuleError } from "./tournament.mjs";
function check(error) {
  if (error) {
    console.error("Supabase API request failed:", error.code || "unknown");
    throw new RuleError(
      "Supabase could not read or save the tournament. Check the API environment variables and run supabase/setup.sql.",
      503,
    );
  }
}
// Callbacks can run again after a storage conflict; mutate only the supplied state.
// storage_version changes on every write, including scoring-lease heartbeats.
export function createSupabaseStore(client) {
  async function readRecord() {
    const { data, error } = await client
      .from("vyuha_state")
      .select("data, storage_version")
      .eq("id", 1)
      .maybeSingle();
    check(error);
    if (data) return data;
    const initialized = await client.rpc("vyuha_initialize", {
      p_seed: initialState(),
    });
    check(initialized.error);
    return initialized.data;
  }
  return {
    async readState() {
      return (await readRecord()).data;
    },
    async mutate(fn) {
      for (let attempt = 0; attempt < 16; attempt++) {
        const record = await readRecord(),
          state = record.data,
          result = await fn(state);
        if (result?.duplicate) return { state, result };
        const committed = await client.rpc("vyuha_commit", {
          p_expected_version: record.storage_version,
          p_next: state,
        });
        check(committed.error);
        if (committed.data === true) return { state, result };
      }
      throw new RuleError(
        "Other devices are updating the tournament. Please retry your last action.",
        409,
      );
    },
    async loginAttempt(key) {
      const response = await client.rpc("vyuha_login_attempt", { p_key: key });
      check(response.error);
      return response.data === true;
    },
  };
}
