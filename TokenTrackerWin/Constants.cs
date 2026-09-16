namespace TokenTrackerWin;

/// <summary>
/// Mirror of <c>TokenTrackerBar/Utilities/Constants.swift</c>. The local server
/// port and dashboard URL must match the CLI (<c>tracker serve</c> binds :7680).
/// </summary>
internal static class Constants
{
    // The live server URL is owned by ServerManager — it picks a free loopback
    // port at launch (the CLI default 7680 is unreliable on Windows: Delivery
    // Optimization holds it). Always IPv4 ("127.0.0.1"), never "localhost",
    // which would resolve to ::1 and hit DoSvc on 7680.

    /// <summary>Poll interval for the background health-check loop.</summary>
    public const int HealthCheckIntervalSeconds = 30;

    /// <summary>How long to wait for the server to answer after launch.</summary>
    public const int StartupTimeoutSeconds = 20;

    public const string AppDisplayName = "TokenTracker ZzH";
    public const string GitHubUrl = "https://github.com/WONGIII/TokenTrackerZzH";

    /// <summary>
    /// The %LOCALAPPDATA% subfolder holding this app's own state: native
    /// settings, theme, currency, update bookkeeping, the host log, and the
    /// WebView2 caches for the dashboard and the pet window.
    /// </summary>
    // FORK: upstream uses "TokenTracker". Sharing that folder meant installing
    // this build silently inherited the original app's settings, and the two
    // builds then fought over the same WebView2 cache (which is also why a
    // rebranded icon could keep showing the old one). One folder each.
    public const string AppDataFolderName = "TokenTrackerZzH";

    /// <summary>HKCU Run-key value name used for launch-at-startup.</summary>
    // FORK: distinct from upstream's "TokenTracker" so this build's
    // launch-at-startup entry cannot be overwritten by, or deleted together
    // with, an upstream install sharing the same HKCU Run key.
    public const string StartupRegistryValueName = "TokenTrackerZzH";
}
