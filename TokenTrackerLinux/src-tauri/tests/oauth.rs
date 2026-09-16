use std::path::Path;

use tokentracker_linux::oauth::{
    appimage_desktop_entry, callback_url, is_allowed_oauth_url, parse_auth_callback,
    PendingAuthCode,
};

#[test]
fn parses_only_the_expected_auth_callback() {
    assert_eq!(
        parse_auth_callback("ttzzh://auth/callback?insforge_code=abc%2F123"),
        Some("abc/123".to_string())
    );

    for invalid in [
        // Wrong scheme.
        "https://auth/callback?insforge_code=abc",
        "http://auth/callback?insforge_code=abc",
        "tokentracker2://auth/callback?insforge_code=abc",
        // Wrong host.
        "ttzzh://open/callback?insforge_code=abc",
        "ttzzh://Auth.evil.com/callback?insforge_code=abc",
        // Wrong path.
        "ttzzh://auth/done?insforge_code=abc",
        "ttzzh://auth/callback/extra?insforge_code=abc",
        "ttzzh://auth/?insforge_code=abc",
        // Missing or empty code.
        "ttzzh://auth/callback",
        "ttzzh://auth/callback?insforge_code=",
        "ttzzh://auth/callback?other=abc",
        // Ambiguous: refuse rather than guess which code is authoritative.
        "ttzzh://auth/callback?insforge_code=one&insforge_code=two",
        "ttzzh://auth/callback?insforge_code=one&other=x&insforge_code=two",
        // A fragment can hide a second value from `query_pairs`.
        "ttzzh://auth/callback#insforge_code=abc",
        "ttzzh://auth/callback?insforge_code=abc#extra",
        // Not a URL at all.
        "",
        "not a url",
        "ttzzh://",
    ] {
        assert_eq!(parse_auth_callback(invalid), None, "accepted {invalid}");
    }
}

#[test]
fn callback_url_rejects_anything_but_a_bare_loopback_base() {
    for invalid in [
        // Non-loopback or non-http bases would send the code off-machine.
        "https://127.0.0.1:17680",
        "http://localhost:17680",
        "http://0.0.0.0:17680",
        "http://example.com:17680",
        "http://[::1]:17680",
        // A missing port would target the default HTTP port, not our server.
        "http://127.0.0.1",
        // The base must be bare: an existing path/query/fragment means the
        // caller passed something other than the dashboard origin.
        "http://127.0.0.1:17680/dashboard",
        "http://127.0.0.1:17680/?next=/evil",
        "http://127.0.0.1:17680/#frag",
        "not a url",
        "",
    ] {
        assert_eq!(
            callback_url(invalid, "code"),
            None,
            "accepted base {invalid}"
        );
    }
}

#[test]
fn callback_url_percent_encodes_hostile_codes() {
    // The code is attacker-influenced text; it must never be able to introduce
    // another query parameter or escape into the fragment.
    let url = callback_url("http://127.0.0.1:17680", "a&app=0#x").expect("valid base");

    assert_eq!(
        url,
        "http://127.0.0.1:17680/auth/callback?insforge_code=a%26app%3D0%23x&app=1"
    );
    assert!(!url.contains("app=0"), "must not inject a second parameter");
    assert!(!url.contains('#'), "must not introduce a fragment");
}

#[test]
fn callback_url_accepts_a_fallback_port() {
    // `pick_available_port` falls back to an OS-assigned port, so the builder
    // must not be hardcoded to 17680.
    assert_eq!(
        callback_url("http://127.0.0.1:39215", "abc").as_deref(),
        Some("http://127.0.0.1:39215/auth/callback?insforge_code=abc&app=1")
    );
}

#[test]
fn opens_only_absolute_https_oauth_urls() {
    assert!(is_allowed_oauth_url(
        "https://auth.example.com/oauth?client_id=1"
    ));

    for invalid in [
        "http://auth.example.com/oauth",
        "file:///tmp/token",
        "javascript:alert(1)",
        "data:text/plain,secret",
        "/relative/oauth",
        "https://",
    ] {
        assert!(!is_allowed_oauth_url(invalid), "accepted {invalid}");
    }
}

#[test]
fn builds_a_loopback_callback_url_with_an_encoded_code() {
    assert_eq!(
        callback_url("http://127.0.0.1:17680", "a/b+c?d").as_deref(),
        Some("http://127.0.0.1:17680/auth/callback?insforge_code=a%2Fb%2Bc%3Fd&app=1")
    );
    assert_eq!(callback_url("https://example.com", "code"), None);
}

#[test]
fn pending_auth_code_is_consumed_once_and_latest_wins() {
    let pending = PendingAuthCode::default();
    pending.store("first".to_string());
    pending.store("second".to_string());

    assert_eq!(pending.take().as_deref(), Some("second"));
    assert_eq!(pending.take(), None);
}

#[test]
fn appimage_desktop_entry_registers_the_callback_and_quotes_the_path() {
    let entry = appimage_desktop_entry(Path::new(
        "/home/dev/Token Tracker 100%/$`\"\\/TokenTracker-linux.AppImage",
    ))
    .expect("valid AppImage path");

    assert!(entry.contains(
        "Exec=\"/home/dev/Token Tracker 100%%/\\$\\`\\\"\\\\/TokenTracker-linux.AppImage\" %u"
    ));
    assert!(entry.contains("MimeType=x-scheme-handler/ttzzh;"));
    assert!(entry.contains("X-AppImage-Integrate=false"));
}

#[test]
fn appimage_desktop_entry_rejects_control_characters() {
    assert_eq!(
        appimage_desktop_entry(Path::new("/tmp/bad\nname.AppImage")),
        None
    );
}
