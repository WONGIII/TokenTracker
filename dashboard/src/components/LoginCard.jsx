import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useInsforgeAuth } from "../contexts/InsforgeAuthContext.jsx";
import { useLocale } from "../hooks/useLocale.js";
import { copy } from "../lib/copy";
import { cn } from "../lib/cn";

function resetTokenFromExchange(data) {
  if (typeof data === "string" && data.trim()) return data.trim();
  if (data && typeof data === "object") {
    if (typeof data.token === "string" && data.token.trim()) return data.token.trim();
    if (typeof data.otp === "string" && data.otp.trim()) return data.otp.trim();
  }
  return "";
}

export function LoginCard({
  title,
  subtitle,
  className = "",
  onSuccess,
  hideLogo = false,
  initialMode = "signin",
  tokenFromUrl = "",
  initialEmail = "",
  initialCode = "",
}) {
  useLocale();
  const {
    enabled,
    signedIn,
    refreshUser,
    signInWithPassword,
    signUp,
    getPublicAuthConfig,
    sendResetPasswordEmail,
    exchangeResetPasswordToken,
    resetPassword,
  } = useInsforgeAuth();

  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [banner, setBanner] = useState(null);
  const [complete, setComplete] = useState(false);
  const [passwordMinLength, setPasswordMinLength] = useState(8);

  // Sync initial state if they change externally (useful when ResetPasswordPage updates props)
  useEffect(() => {
    if (initialMode) setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (initialEmail) setEmail(initialEmail);
  }, [initialEmail]);

  useEffect(() => {
    if (initialCode) setCode(initialCode);
  }, [initialCode]);

  // Load auth config when component mounts
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    (async () => {
      const { data } = await getPublicAuthConfig();
      if (!active) return;
      // Only the password policy is consumed: this fork configures no OAuth
      // provider, so there is no provider list to render.
      if (typeof data?.passwordMinLength === "number" && data.passwordMinLength > 0) {
        setPasswordMinLength(data.passwordMinLength);
      }
    })();
    return () => {
      active = false;
    };
  }, [enabled, getPublicAuthConfig]);

  // Handle successful login
  useEffect(() => {
    if (signedIn && onSuccess) {
      onSuccess();
    }
  }, [signedIn, onSuccess]);

  const redirectTo = useMemo(() => {
    if (typeof window === "undefined") return "/reset-password";
    return `${window.location.origin}/reset-password`;
  }, []);

  const handleEmailAuth = useCallback(async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error: err } = await signUp({
          email: email.trim(),
          password,
          name: name.trim() || undefined,
        });
        if (err) {
          setError(err.message || String(err));
          return;
        }
        if (data?.requireEmailVerification) {
          setBanner(copy("login.verify_email_pending"));
          setMode("signin");
          return;
        }
        await refreshUser();
        return;
      }
      const { error: err } = await signInWithPassword({ email: email.trim(), password });
      if (err) {
        setError(err.message || String(err));
        return;
      }
      await refreshUser();
    } finally {
      setBusy(false);
    }
  }, [mode, email, password, name, signUp, signInWithPassword, refreshUser]);

  const handleResetRequest = useCallback(
    async (e) => {
      e.preventDefault();
      setError(null);
      setBusy(true);
      try {
        const trimmedEmail = email.trim();
        const { error: err } = await sendResetPasswordEmail({
          email: trimmedEmail,
          redirectTo,
        });
        if (err) {
          setError(err.message || String(err));
          return;
        }
        setEmail(trimmedEmail);
        setBanner(copy("reset_password.request.sent"));
        setMode("reset_confirm");
      } finally {
        setBusy(false);
      }
    },
    [email, redirectTo, sendResetPasswordEmail],
  );

  const handleResetPassword = useCallback(
    async (e) => {
      e.preventDefault();
      setError(null);
      if (password !== confirmPassword) {
        setError(copy("reset_password.error.password_mismatch"));
        return;
      }
      setBusy(true);
      try {
        let otp = tokenFromUrl;
        if (!otp) {
          const { data, error: exchangeErr } = await exchangeResetPasswordToken({
            email: email.trim(),
            code: code.trim(),
          });
          if (exchangeErr) {
            setError(exchangeErr.message || String(exchangeErr));
            return;
          }
          otp = resetTokenFromExchange(data);
          if (!otp) {
            setError(copy("reset_password.error.missing_token"));
            return;
          }
        }
        const { error: resetErr } = await resetPassword({
          newPassword: password,
          otp,
        });
        if (resetErr) {
          setError(resetErr.message || String(resetErr));
          return;
        }
        setComplete(true);
        setBanner(copy("reset_password.success"));
      } finally {
        setBusy(false);
      }
    },
    [code, confirmPassword, email, exchangeResetPasswordToken, password, resetPassword, tokenFromUrl],
  );

  if (!enabled) return null;

  const isResetMode = mode === "reset_email" || mode === "reset_confirm";

  return (
    <div className={cn("w-full bg-white dark:bg-oai-gray-950 p-6 transition-colors duration-200", className)}>
      {/* Back Button for reset flows */}
      {isResetMode && (
        <button
          type="button"
          onClick={() => {
            setMode("signin");
            setBanner(null);
            setError(null);
            setComplete(false);
            setPassword("");
            setConfirmPassword("");
          }}
          className="flex items-center gap-1.5 text-xs font-medium text-oai-gray-500 hover:text-oai-black dark:hover:text-white transition-colors mb-4 focus:outline-none"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {copy("reset_password.back_to_sign_in")}
        </button>
      )}

      {/* Header */}
      <div className={cn("mb-6", isResetMode ? "text-left" : "text-center")}>
        {!hideLogo && !isResetMode && (
          <div className="flex items-center justify-center gap-2 mb-2">
            <img src="/app-icon.png" alt="" width={28} height={28} className="rounded-md" />
            <span className="text-lg font-semibold text-oai-black dark:text-white font-oai tracking-tight">
              {copy("shared.app_name")}
            </span>
          </div>
        )}
        <h2 className={cn(
          "text-sm font-semibold text-oai-black dark:text-white tracking-tight mb-1",
          (hideLogo || isResetMode) && "text-base font-bold md:text-lg"
        )}>
          {isResetMode ? copy("reset_password.title") : (title || copy("login_modal.subtitle"))}
        </h2>
        {!isResetMode && subtitle && (
          <p className="text-xs text-oai-gray-500 dark:text-oai-gray-400 mt-1.5 leading-relaxed max-w-[320px] mx-auto">
            {subtitle}
          </p>
        )}
        {isResetMode && (
          <p className="text-xs text-oai-gray-500 dark:text-oai-gray-400 mt-1.5 leading-relaxed max-w-[320px]">
            {banner && mode === "reset_confirm" && !complete
              ? banner
              : copy("reset_password.subtitle")}
          </p>
        )}
      </div>

      {/* Banner */}
      {banner && (!isResetMode || complete) && (
        <div className="mb-4 rounded-lg border border-oai-gray-200 dark:border-oai-gray-800 bg-oai-gray-50 dark:bg-oai-gray-900/50 px-3 py-2 text-xs text-oai-gray-700 dark:text-oai-gray-300">
          {banner}
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="mb-4 text-sm text-red-500 dark:text-red-400 text-center" role="alert">
          {error}
        </p>
      )}

      {/* Render reset sub-flows */}
      {mode === "reset_email" && (
        <form onSubmit={handleResetRequest} className="space-y-3">
          <div>
            <label htmlFor="card-reset-email" className="block text-xs font-medium text-oai-gray-500 mb-1">
              {copy("login.field.email")}
            </label>
            <input
              id="card-reset-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-10 rounded-lg border border-oai-gray-200 dark:border-oai-gray-800 bg-oai-gray-50 dark:bg-oai-gray-900 px-3 text-sm text-oai-black dark:text-white placeholder-oai-gray-400 dark:placeholder-oai-gray-600 focus:outline-none focus:ring-2 focus:ring-oai-brand-500"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full h-10 rounded-lg bg-oai-gray-900 dark:bg-white text-white dark:text-oai-gray-950 text-sm font-semibold hover:bg-oai-gray-800 dark:hover:bg-oai-gray-100 transition-colors disabled:opacity-50"
          >
            {copy("reset_password.request.submit")}
          </button>
        </form>
      )}

      {mode === "reset_confirm" && (
        complete ? (
          <button
            type="button"
            onClick={() => {
              setMode("signin");
              setComplete(false);
              setBanner(null);
              setError(null);
              setPassword("");
              setConfirmPassword("");
            }}
            className="w-full h-10 rounded-lg bg-oai-gray-900 dark:bg-white text-white dark:text-oai-gray-950 text-sm font-semibold hover:bg-oai-gray-800 dark:hover:bg-oai-gray-100 transition-colors text-center shadow-sm"
          >
            {copy("reset_password.success_cta")}
          </button>
        ) : (
          <form onSubmit={handleResetPassword} className="space-y-3">
            {!tokenFromUrl && (
              <>
                <div>
                  <label htmlFor="card-reset-email-confirm" className="block text-xs font-medium text-oai-gray-500 mb-1">
                    {copy("login.field.email")}
                  </label>
                  <input
                    id="card-reset-email-confirm"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full h-10 rounded-lg border border-oai-gray-200 dark:border-oai-gray-800 bg-oai-gray-50 dark:bg-oai-gray-900 px-3 text-sm text-oai-black dark:text-white placeholder-oai-gray-400 dark:placeholder-oai-gray-600 focus:outline-none focus:ring-2 focus:ring-oai-brand-500"
                  />
                </div>
                <div>
                  <label htmlFor="card-reset-code" className="block text-xs font-medium text-oai-gray-500 mb-1">
                    {copy("reset_password.field.code")}
                  </label>
                  <input
                    id="card-reset-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full h-10 rounded-lg border border-oai-gray-200 dark:border-oai-gray-800 bg-oai-gray-50 dark:bg-oai-gray-900 px-3 text-sm text-oai-black dark:text-white placeholder-oai-gray-400 dark:placeholder-oai-gray-600 focus:outline-none focus:ring-2 focus:ring-oai-brand-500"
                  />
                </div>
              </>
            )}
            <div>
              <label htmlFor="card-reset-password" className="block text-xs font-medium text-oai-gray-500 mb-1">
                {copy("reset_password.field.new_password")}
              </label>
              <input
                id="card-reset-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-10 rounded-lg border border-oai-gray-200 dark:border-oai-gray-800 bg-oai-gray-50 dark:bg-oai-gray-900 px-3 text-sm text-oai-black dark:text-white placeholder-oai-gray-400 dark:placeholder-oai-gray-600 focus:outline-none focus:ring-2 focus:ring-oai-brand-500"
              />
            </div>
            <div>
              <label htmlFor="card-reset-password-confirm" className="block text-xs font-medium text-oai-gray-500 mb-1">
                {copy("reset_password.field.confirm_password")}
              </label>
              <input
                id="card-reset-password-confirm"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full h-10 rounded-lg border border-oai-gray-200 dark:border-oai-gray-800 bg-oai-gray-50 dark:bg-oai-gray-900 px-3 text-sm text-oai-black dark:text-white placeholder-oai-gray-400 dark:placeholder-oai-gray-600 focus:outline-none focus:ring-2 focus:ring-oai-brand-500"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full h-10 rounded-lg bg-oai-gray-900 dark:bg-white text-white dark:text-oai-gray-950 text-sm font-semibold hover:bg-oai-gray-800 dark:hover:bg-oai-gray-100 transition-colors disabled:opacity-50"
            >
              {copy("reset_password.reset.submit")}
            </button>
          </form>
        )
      )}

      {/* Render normal signin/signup flows */}
      {!isResetMode && (
        <>
          {/* Email + password only. This fork runs its own InsForge instance with
              no OAuth provider configured, so the provider buttons are gone
              rather than left in place to fail at click time. */}
          {(
            <>
              {/* Divider */}
              <div className="relative mb-5">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-oai-gray-200 dark:border-oai-gray-800" />
                </div>
                <div className="relative flex justify-center text-xs uppercase tracking-wider">
                  <span className="bg-white dark:bg-oai-gray-950 px-3 text-oai-gray-400 dark:text-oai-gray-600">
                    {copy("login_modal.divider_email")}
                  </span>
                </div>
              </div>

              {/* Sign in / Sign up toggle */}
              <div className="flex rounded-lg border border-oai-gray-200 dark:border-oai-gray-800 p-0.5 bg-oai-gray-50 dark:bg-oai-gray-900/50 mb-4">
                <button
                  type="button"
                  className={cn(
                    "flex-1 py-1.5 text-xs font-medium rounded-md transition-colors",
                    mode === "signin"
                      ? "bg-white dark:bg-oai-gray-800 text-oai-black dark:text-white shadow-sm"
                      : "text-oai-gray-500 hover:text-oai-gray-700 dark:hover:text-oai-gray-300",
                  )}
                  onClick={() => {
                    setMode("signin");
                    setError(null);
                  }}
                >
                  {copy("login.tab.sign_in")}
                </button>
                <button
                  type="button"
                  className={cn(
                    "flex-1 py-1.5 text-xs font-medium rounded-md transition-colors",
                    mode === "signup"
                      ? "bg-white dark:bg-oai-gray-800 text-oai-black dark:text-white shadow-sm"
                      : "text-oai-gray-500 hover:text-oai-gray-700 dark:hover:text-oai-gray-300",
                  )}
                  onClick={() => {
                    setMode("signup");
                    setError(null);
                  }}
                >
                  {copy("login.tab.sign_up")}
                </button>
              </div>

              {/* Email form */}
              <form onSubmit={handleEmailAuth} className="space-y-3">
                {mode === "signup" && (
                  <div>
                    <label htmlFor="card-name" className="block text-xs font-medium text-oai-gray-500 mb-1">
                      {copy("login.field.name")}
                    </label>
                    <input
                      id="card-name"
                      type="text"
                      autoComplete="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full h-10 rounded-lg border border-oai-gray-200 dark:border-oai-gray-800 bg-oai-gray-50 dark:bg-oai-gray-900 px-3 text-sm text-oai-black dark:text-white placeholder-oai-gray-400 dark:placeholder-oai-gray-600 focus:outline-none focus:ring-2 focus:ring-oai-brand-500"
                      placeholder={copy("login.field.name_placeholder")}
                    />
                  </div>
                )}
                <div>
                  <label htmlFor="card-email" className="block text-xs font-medium text-oai-gray-500 mb-1">
                    {copy("login.field.email")}
                  </label>
                  <input
                    id="card-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full h-10 rounded-lg border border-oai-gray-200 dark:border-oai-gray-800 bg-oai-gray-50 dark:bg-oai-gray-900 px-3 text-sm text-oai-black dark:text-white placeholder-oai-gray-400 dark:placeholder-oai-gray-600 focus:outline-none focus:ring-2 focus:ring-oai-brand-500"
                  />
                </div>
                <div>
                  <label htmlFor="card-password" className="block text-xs font-medium text-oai-gray-500 mb-1">
                    {copy("login.field.password")}
                  </label>
                  <input
                    id="card-password"
                    type="password"
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    required
                    minLength={mode === "signup" ? passwordMinLength : undefined}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full h-10 rounded-lg border border-oai-gray-200 dark:border-oai-gray-800 bg-oai-gray-50 dark:bg-oai-gray-900 px-3 text-sm text-oai-black dark:text-white placeholder-oai-gray-400 dark:placeholder-oai-gray-600 focus:outline-none focus:ring-2 focus:ring-oai-brand-500"
                  />
                  {mode === "signup" && (
                    <p className="mt-1 text-xs text-oai-gray-400 dark:text-oai-gray-600">
                      {copy("login.password_hint", { min: String(passwordMinLength) })}
                    </p>
                  )}
                  {mode === "signin" && (
                    <div className="mt-1 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setMode("reset_email");
                          setError(null);
                          setBanner(null);
                        }}
                        className="text-xs font-medium text-oai-gray-500 hover:text-oai-black dark:hover:text-white no-underline bg-transparent border-0 p-0 cursor-pointer focus:outline-none"
                      >
                        {copy("login.forgot_password")}
                      </button>
                    </div>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full h-10 rounded-lg bg-oai-gray-900 dark:bg-white text-white dark:text-oai-gray-950 text-sm font-semibold hover:bg-oai-gray-800 dark:hover:bg-oai-gray-100 transition-colors disabled:opacity-50"
                >
                  {mode === "signup" ? copy("login.submit.sign_up") : copy("login.submit.sign_in")}
                </button>
              </form>
            </>
          )}
        </>
      )}
    </div>
  );
}
