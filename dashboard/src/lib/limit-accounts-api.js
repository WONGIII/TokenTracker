import { getLocalApiAuthHeaders } from "./local-api-auth";

// Usage-limit accounts: one adapter, several logins. Local CLI only — the list
// lives in ~/.tokentracker/tracker/config.json on the machine running the
// server; there is no cloud counterpart (the accounts authenticate the quota
// reads, which happen locally).

async function payload(response) {
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || `Limit accounts request failed with HTTP ${response.status}`);
  }
  return data;
}

/** @returns {Promise<{accounts: object[], providers: object[]}>} */
export async function listLimitAccounts() {
  const response = await fetch("/functions/tokentracker-limit-accounts", {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const data = await payload(response);
  return {
    accounts: Array.isArray(data.accounts) ? data.accounts : [],
    providers: Array.isArray(data.providers) ? data.providers : [],
  };
}

async function mutate(body) {
  const auth = await getLocalApiAuthHeaders();
  return payload(await fetch("/functions/tokentracker-limit-accounts", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", ...auth },
    cache: "no-store",
    body: JSON.stringify(body),
  }));
}

export function saveLimitAccount(account) {
  return mutate({ action: "add", account });
}

export function removeLimitAccount(id) {
  return mutate({ action: "remove", id });
}
