import { useCallback, useEffect, useMemo, useState } from "react";
import { useInsforgeAuth } from "../../contexts/InsforgeAuthContext.jsx";
import { resolveAuthAccessTokenWithRetry } from "../../lib/auth-token";
import { getPublicVisibility, setPublicVisibility } from "../../lib/api";
import { runCloudUsageSyncNow } from "../../lib/cloud-sync";
import {
  getCloudSyncEnabled,
  isLocalDashboardHost,
  setCloudSyncEnabled,
} from "../../lib/cloud-sync-prefs";
import { copy } from "../../lib/copy";
import { normalizeGithubProfileUrl, pickDisplayName, pickEmail } from "./AccountSectionUtils.js";

function warnSettingsAction(label, error) {
  console.warn(`[tokentracker] settings ${label}:`, error);
}

function useCloudSyncControl(getAccessToken, enabled, signedIn) {
  const [cloudSyncOn, setCloudSyncOn] = useState(() => getCloudSyncEnabled());
  const showLocalCloudSync = enabled && signedIn && isLocalDashboardHost();

  const handleCloudSyncToggle = useCallback(async () => {
    const next = !cloudSyncOn;
    setCloudSyncEnabled(next);
    setCloudSyncOn(next);
    if (!next) return;
    try {
      await runCloudUsageSyncNow(() => getAccessToken());
    } catch (error) {
      warnSettingsAction("cloud sync", error);
    }
  }, [cloudSyncOn, getAccessToken]);

  return { cloudSyncOn, handleCloudSyncToggle, showLocalCloudSync };
}

function useProfileState(user) {
  const [publicProfileOn, setPublicProfileOn] = useState(false);
  const [anonymousOn, setAnonymousOn] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [customDisplayName, setCustomDisplayName] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [showGithubOn, setShowGithubOn] = useState(false);
  const [githubUrl, setGithubUrl] = useState("");
  const [githubInput, setGithubInput] = useState("");
  const [editingGithub, setEditingGithub] = useState(false);
  const [githubError, setGithubError] = useState(null);
  // FORK: no OAuth means no provider-supplied avatar, so the user pastes an image
  // URL. Same inline-edit shape as the GitHub field next to it.
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarInput, setAvatarInput] = useState("");
  const [editingAvatar, setEditingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState(null);
  const displayName = useMemo(() => pickDisplayName(user), [user]);
  const email = useMemo(() => pickEmail(user), [user]);
  const userId = useMemo(() => (typeof user?.id === "string" ? user.id.trim() : ""), [user]);
  const loadSetters = useMemo(() => ({
    setAnonymousOn,
    setAvatarUrl,
    setCustomDisplayName,
    setGithubUrl,
    setProfileLoading,
    setPublicProfileOn,
    setShowGithubOn,
  }), []);

  return {
    anonymousOn,
    avatarError,
    avatarInput,
    avatarUrl,
    customDisplayName,
    displayName,
    // NOTE: every piece of state the props builders read must be listed here.
    // `editingAvatar` was set but not returned, so the field read `undefined`
    // and its editor never opened — the button looked dead while its handler ran.
    editingAvatar,
    editingGithub,
    editingName,
    email,
    githubError,
    githubInput,
    githubUrl,
    loadSetters,
    nameInput,
    profileLoading,
    profileSaving,
    publicProfileOn,
    setAnonymousOn,
    setAvatarError,
    setAvatarInput,
    setAvatarUrl,
    setCustomDisplayName,
    setEditingAvatar,
    setEditingGithub,
    setEditingName,
    setGithubError,
    setGithubInput,
    setGithubUrl,
    setNameInput,
    setProfileLoading,
    setProfileSaving,
    setPublicProfileOn,
    setShowGithubOn,
    showGithubOn,
    userId,
  };
}

function useProfileLoad(getAccessToken, signedIn, state) {
  useEffect(() => {
    if (!signedIn) return undefined;
    let active = true;
    state.setProfileLoading(true);
    (async () => {
      try {
        const token = await resolveAuthAccessTokenWithRetry({ getAccessToken });
        if (!active || !token) return;
        const data = await getPublicVisibility({ accessToken: token });
        if (!active) return;
        state.setPublicProfileOn(Boolean(data?.enabled));
        state.setAnonymousOn(Boolean(data?.anonymous));
        if (data?.display_name) state.setCustomDisplayName(data.display_name);
        state.setShowGithubOn(Boolean(data?.show_github_url));
        state.setGithubUrl(data?.github_url || "");
        state.setAvatarUrl(data?.avatar_url || "");
      } catch (error) {
        warnSettingsAction("load public profile", error);
      } finally {
        if (active) state.setProfileLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [getAccessToken, signedIn, state]);
}

function useProfileMutation(getAccessToken, state) {
  return useCallback(async (payload, { label, onError, onSuccess } = {}) => {
    if (state.profileSaving) return false;
    state.setProfileSaving(true);
    try {
      const token = await resolveAuthAccessTokenWithRetry({ getAccessToken });
      if (!token) return false;
      const response = await setPublicVisibility({ accessToken: token, ...payload });
      onSuccess?.(response);
      return true;
    } catch (error) {
      if (onError) onError(error);
      else warnSettingsAction(label || "mutate profile", error);
      return false;
    } finally {
      state.setProfileSaving(false);
    }
  }, [getAccessToken, state]);
}

function buildNameProps(state, actions) {
  return {
    anonymousOn: state.anonymousOn,
    customDisplayName: state.customDisplayName,
    displayName: state.displayName,
    editingName: state.editingName,
    handleAnonymousToggle: actions.handleAnonymousToggle,
    handleSaveName: actions.handleSaveName,
    nameInput: state.nameInput,
    profileLoading: state.profileLoading,
    profileSaving: state.profileSaving,
    setEditingName: state.setEditingName,
    setNameInput: state.setNameInput,
    startEditingName: actions.startEditingName,
  };
}

function buildAvatarProps(state, actions) {
  return {
    avatarError: state.avatarError,
    avatarInput: state.avatarInput,
    avatarUrl: state.avatarUrl,
    editingAvatar: state.editingAvatar,
    handleSaveAvatar: actions.handleSaveAvatar,
    profileLoading: state.profileLoading,
    profileSaving: state.profileSaving,
    setAvatarError: state.setAvatarError,
    setAvatarInput: state.setAvatarInput,
    setEditingAvatar: state.setEditingAvatar,
    startEditingAvatar: actions.startEditingAvatar,
  };
}

function useAvatarActions(state, mutateProfile) {
  const handleSaveAvatar = useCallback(async () => {
    const raw = state.avatarInput.trim();
    if (raw && !/^https?:\/\//i.test(raw)) {
      state.setAvatarError(copy("settings.account.avatarInvalid"));
      return;
    }
    await mutateProfile({ avatar_url: raw || null }, {
      label: "save avatar url",
      onSuccess: (response) => {
        state.setAvatarUrl(response?.avatar_url || raw);
        state.setEditingAvatar(false);
        state.setAvatarError(null);
      },
    });
  }, [mutateProfile, state]);

  const startEditingAvatar = useCallback(() => {
    state.setAvatarInput(state.avatarUrl || "");
    state.setEditingAvatar(true);
  }, [state]);

  return { handleSaveAvatar, startEditingAvatar };
}

function buildGithubProps(state, actions) {
  return {
    editingGithub: state.editingGithub,
    githubError: state.githubError,
    githubInput: state.githubInput,
    githubUrl: state.githubUrl,
    handleSaveGithub: actions.handleSaveGithub,
    handleShowGithubToggle: actions.handleShowGithubToggle,
    profileLoading: state.profileLoading,
    profileSaving: state.profileSaving,
    setEditingGithub: state.setEditingGithub,
    setGithubError: state.setGithubError,
    setGithubInput: state.setGithubInput,
    showGithubOn: state.showGithubOn,
    startEditingGithub: actions.startEditingGithub,
  };
}

function useVisibilityActions(state, mutateProfile) {
  const handlePublicProfileToggle = useCallback(async () => {
    const next = !state.publicProfileOn;
    await mutateProfile(
      { enabled: next },
      { label: "toggle public profile", onSuccess: () => state.setPublicProfileOn(next) },
    );
  }, [mutateProfile, state]);

  const handleAnonymousToggle = useCallback(async () => {
    const next = !state.anonymousOn;
    await mutateProfile(
      { anonymous: next },
      { label: "toggle anonymous", onSuccess: () => state.setAnonymousOn(next) },
    );
  }, [mutateProfile, state]);

  return { handleAnonymousToggle, handlePublicProfileToggle };
}

function useNameActions(state, mutateProfile, refreshDisplayName) {
  const handleSaveName = useCallback(async () => {
    const trimmed = state.nameInput.trim().slice(0, 50);
    if (!trimmed) return;
    await mutateProfile({ display_name: trimmed }, {
      label: "save display name",
      onSuccess: () => {
        state.setCustomDisplayName(trimmed);
        state.setEditingName(false);
        // Propagate to the shared auth-context displayName so the sidebar
        // avatar/name updates immediately, without a full page reload. The
        // leaderboard self-name comes from a server snapshot and updates on
        // its own refresh cadence.
        refreshDisplayName?.();
      },
    });
  }, [mutateProfile, state, refreshDisplayName]);

  const startEditingName = useCallback(() => {
    state.setNameInput(state.customDisplayName || state.displayName);
    state.setEditingName(true);
  }, [state]);

  return { handleSaveName, startEditingName };
}

function useGithubActions(state, mutateProfile) {
  const handleShowGithubToggle = useCallback(async () => {
    if (!state.showGithubOn && !state.githubUrl) {
      state.setEditingGithub(true);
      state.setGithubInput("");
      state.setGithubError(null);
      return;
    }
    const next = !state.showGithubOn;
    await mutateProfile(
      { show_github_url: next },
      { label: "toggle GitHub profile", onSuccess: () => state.setShowGithubOn(next) },
    );
  }, [mutateProfile, state]);

  const handleSaveGithub = useCallback(async () => {
    const normalizedUrl = normalizeGithubProfileUrl(state.githubInput);
    if (state.githubInput.trim() && !normalizedUrl) {
      state.setGithubError(copy("settings.account.githubUrlInvalid"));
      return;
    }
    state.setGithubError(null);
    await mutateProfile(
      { github_url: normalizedUrl, show_github_url: Boolean(normalizedUrl) },
      {
        label: "save GitHub profile",
        onError: (error) => state.setGithubError(error?.message || copy("settings.account.githubUrlInvalid")),
        onSuccess: (response) => {
          state.setGithubUrl(response?.github_url || normalizedUrl || "");
          state.setShowGithubOn(Boolean(normalizedUrl));
          state.setEditingGithub(false);
        },
      },
    );
  }, [mutateProfile, state]);

  const startEditingGithub = useCallback(() => {
    state.setGithubInput(state.githubUrl);
    state.setGithubError(null);
    state.setEditingGithub(true);
  }, [state]);

  return { handleSaveGithub, handleShowGithubToggle, startEditingGithub };
}

export function useAccountProfileSettings() {
  const auth = useInsforgeAuth();
  const state = useProfileState(auth.user);
  const cloudSync = useCloudSyncControl(auth.getAccessToken, auth.enabled, auth.signedIn);
  useProfileLoad(auth.getAccessToken, auth.signedIn, state.loadSetters);
  const mutateProfile = useProfileMutation(auth.getAccessToken, state);
  const visibilityActions = useVisibilityActions(state, mutateProfile);
  const nameActions = useNameActions(state, mutateProfile, auth.refreshDisplayName);
  const githubActions = useGithubActions(state, mutateProfile);
  const avatarActions = useAvatarActions(state, mutateProfile);

  return {
    ...auth,
    ...cloudSync,
    email: state.email,
    handlePublicProfileToggle: visibilityActions.handlePublicProfileToggle,
    userId: state.userId,
    name: buildNameProps(state, { ...visibilityActions, ...nameActions }),
    avatar: buildAvatarProps(state, avatarActions),
    github: buildGithubProps(state, githubActions),
    profileLoading: state.profileLoading,
    profileSaving: state.profileSaving,
    publicProfileOn: state.publicProfileOn,
  };
}
