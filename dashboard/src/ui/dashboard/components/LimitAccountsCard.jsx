import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { copy } from "../../../lib/copy";
import { Button, ConfirmModal, Input, Select } from "../../components";
import { limitProviderName } from "../../../lib/limits-providers.js";
import { ProviderIcon } from "./ProviderIcon.jsx";
import {
  listLimitAccounts,
  removeLimitAccount,
  saveLimitAccount,
} from "../../../lib/limit-accounts-api";

const EMPTY_FORM = { provider: "", label: "", plan: "", apiKey: "", home: "" };

/**
 * "Several accounts per adapter" editor, rendered inside the Limits header
 * popover (same pattern as the subscription card next to it).
 *
 * One adapter can be authenticated in two different ways, so the form shows the
 * field that adapter actually uses: an API key for kimi / opencodeGo /
 * commandCode, or a profile directory for the adapters whose quota comes from a
 * local CLI session. The server rejects anything else — this is only the UI
 * half of that contract (`limit-accounts.js` owns the validation).
 */
export function LimitAccountsCard({ onChanged }) {
  const [accounts, setAccounts] = useState([]);
  const [providers, setProviders] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const data = await listLimitAccounts();
      setAccounts(data.accounts);
      setProviders(data.providers);
    } catch (err) {
      setError(err?.message || String(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // The Select renders the *selected* item's label, so an empty list needs an
  // explicit placeholder entry or the trigger shows nothing but its chevron.
  const providerOptions = useMemo(
    () => [
      { value: "", label: copy("limits.accounts.provider") },
      ...providers.map((p) => ({ value: p.id, label: limitProviderName(p.id) })),
    ],
    [providers],
  );
  const selected = providers.find((p) => p.id === form.provider) || null;
  const needsHome = Boolean(selected && !selected.api_key && selected.home_env);

  // The account id is a stable slug derived from the adapter + label: it is the
  // React key and the config key, and re-adding the same label replaces it.
  const slugFor = (provider, label) => {
    const base = `${provider}-${label || "account"}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);
    return base || `${provider}-account`;
  };

  const submit = async () => {
    setError(null);
    if (!form.provider) {
      setError(copy("limits.accounts.error_provider"));
      return;
    }
    if (!form.label.trim()) {
      setError(copy("limits.accounts.error_label"));
      return;
    }
    if (needsHome ? !form.home.trim() : !form.apiKey.trim()) {
      setError(copy(needsHome ? "limits.accounts.error_home" : "limits.accounts.error_key"));
      return;
    }
    setBusy(true);
    try {
      await saveLimitAccount({
        id: slugFor(form.provider, form.label),
        provider: form.provider,
        label: form.label.trim(),
        plan: form.plan.trim(),
        apiKey: needsHome ? "" : form.apiKey.trim(),
        home: needsHome ? form.home.trim() : "",
      });
      setForm(EMPTY_FORM);
      await refresh();
      onChanged?.();
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      await removeLimitAccount(pendingDelete.id);
      setPendingDelete(null);
      await refresh();
      onChanged?.();
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-h-[70vh] w-[22rem] overflow-y-auto p-4">
      <div className="text-sm font-medium text-oai-black dark:text-white">
        {copy("limits.accounts.title")}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-oai-gray-500 dark:text-oai-gray-400">
        {copy("limits.accounts.subtitle")}
      </p>

      {accounts.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {accounts.map((account) => (
            <li
              key={account.id}
              className="flex items-center gap-2 rounded-md border border-oai-gray-200 px-2 py-1.5 dark:border-oai-gray-800"
            >
              <ProviderIcon source={account.provider} className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-xs text-oai-black dark:text-white">
                {account.label}
                {account.plan ? (
                  <span className="text-oai-gray-400 dark:text-oai-gray-500"> · {account.plan}</span>
                ) : null}
              </span>
              <button
                type="button"
                aria-label={copy("limits.accounts.delete")}
                title={copy("limits.accounts.delete")}
                onClick={() => setPendingDelete(account)}
                className="shrink-0 rounded p-1 text-oai-gray-400 hover:text-red-500 dark:hover:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-oai-gray-400 dark:text-oai-gray-500">
          {copy("limits.accounts.empty")}
        </p>
      )}

      <div className="mt-4 space-y-2 border-t border-oai-gray-200 pt-3 dark:border-oai-gray-800">
        <Select
          value={form.provider}
          onValueChange={(value) => setForm((prev) => ({ ...prev, provider: value, apiKey: "", home: "" }))}
          options={providerOptions}
          ariaLabel={copy("limits.accounts.provider")}
          className="h-9 w-full text-xs"
          matchTriggerWidth
        />
        <Input
          value={form.label}
          onChange={(event) => setForm((prev) => ({ ...prev, label: event.target.value }))}
          placeholder={copy("limits.accounts.label_placeholder")}
          aria-label={copy("limits.accounts.label")}
        />
        <Input
          value={form.plan}
          onChange={(event) => setForm((prev) => ({ ...prev, plan: event.target.value }))}
          placeholder={copy("limits.accounts.plan_placeholder")}
          aria-label={copy("limits.accounts.plan")}
        />
        {needsHome ? (
          <Input
            value={form.home}
            onChange={(event) => setForm((prev) => ({ ...prev, home: event.target.value }))}
            placeholder={selected?.home_env || copy("limits.accounts.home_placeholder")}
            aria-label={copy("limits.accounts.home")}
          />
        ) : (
          <Input
            type="password"
            value={form.apiKey}
            onChange={(event) => setForm((prev) => ({ ...prev, apiKey: event.target.value }))}
            placeholder={copy("limits.accounts.key_placeholder")}
            aria-label={copy("limits.accounts.api_key")}
          />
        )}
        {selected ? (
          <p className="text-[11px] leading-snug text-oai-gray-400 dark:text-oai-gray-500">
            {copy(needsHome ? "limits.accounts.home_hint" : "limits.accounts.key_hint", {
              env: selected.home_env || "",
            })}
          </p>
        ) : null}
        {error ? <p className="text-[11px] text-red-500 dark:text-red-400">{error}</p> : null}
        <Button size="sm" onClick={() => void submit()} disabled={busy || !form.provider}>
          <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
          {copy("limits.accounts.add")}
        </Button>
      </div>

      <ConfirmModal
        open={Boolean(pendingDelete)}
        title={copy("limits.accounts.delete_title")}
        description={copy("limits.accounts.delete_description", { label: pendingDelete?.label || "" })}
        confirmLabel={copy("limits.accounts.delete")}
        cancelLabel={copy("limits.accounts.cancel")}
        destructive
        busy={busy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
