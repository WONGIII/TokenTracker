const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const {
  buildPortInUseHint,
  isPortUnavailableError,
  ensurePortFree,
  isTokenTrackerServeCommand,
  listenOnAvailablePort,
  NPM_PACKAGE_NAME,
  parseServeScriptPath,
  parseArgs,
  isRunningUnderWsl,
  resolveDefaultPort,
} = require("../src/commands/serve");

function mockPlatform(t, platform) {
  const original = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", { value: platform });
  t.after(() => Object.defineProperty(process, "platform", original));
}

test("serve port collision hint references the published npm package name", () => {
  assert.equal(NPM_PACKAGE_NAME, "tokentracker-cli");
  assert.equal(
    buildPortInUseHint(7681),
    "Port 7681 is still in use after cleanup. Try: npx tokentracker-cli serve --port 7682\n",
  );
});

test("serve treats Windows EACCES bind failures as port unavailable", () => {
  assert.equal(isPortUnavailableError({ code: "EACCES" }), true);
  assert.equal(isPortUnavailableError({ code: "EADDRINUSE" }), true);
  assert.equal(isPortUnavailableError({ code: "EINVAL" }), false);
});

test("serve default startup falls through to the next available port", async (t) => {
  let occupied = null;
  let occupiedPort = null;
  for (let attempt = 0; attempt < 20; attempt++) {
    occupied = http.createServer((_req, res) => res.end("occupied"));
    await new Promise((resolve) => occupied.listen(0, "127.0.0.1", resolve));
    occupiedPort = occupied.address().port;
    if (occupiedPort < 65535 && await canBind(occupiedPort + 1)) {
      break;
    }
    await closeServer(occupied);
    occupied = null;
    occupiedPort = null;
  }
  assert.ok(occupied, "expected to find a free adjacent fallback port");
  t.after(() => closeServer(occupied));

  const server = http.createServer((_req, res) => res.end("fallback"));
  t.after(() => closeServer(server));

  const selectedPort = await listenOnAvailablePort(server, occupiedPort, {
    allowFallback: true,
    maxAttempts: 3,
  });

  assert.equal(selectedPort, occupiedPort + 1);
});

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error && error.code !== "ERR_SERVER_NOT_RUNNING") reject(error);
      else resolve();
    });
  });
}

async function canBind(port) {
  const server = http.createServer();
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", resolve);
    });
    return true;
  } catch {
    return false;
  } finally {
    await closeServer(server).catch(() => {});
  }
}

test("serve respects explicit port from --port and PORT env", (t) => {
  mockPlatform(t, "darwin");
  assert.deepEqual(parseArgs([], { PORT: "7700" }), {
    port: 7700,
    portExplicit: true,
    wslDefaultPort: false,
    open: true,
    sync: true,
  });
  assert.deepEqual(parseArgs(["--port", "7701", "--no-open", "--no-sync"], { PORT: "7700" }), {
    port: 7701,
    portExplicit: true,
    wslDefaultPort: false,
    open: false,
    sync: false,
  });
  assert.deepEqual(parseArgs([], {}), {
    port: 17890,
    portExplicit: false,
    wslDefaultPort: false,
    open: true,
    sync: true,
  });
});

// #267: Windows Delivery Optimization (DoSvc) holds 0.0.0.0:7680 on the host,
// so under WSL the default port must move off 7680. Explicit --port / PORT
// always win.
test("serve default port moves to 17891 under WSL", (t) => {
  mockPlatform(t, "linux");
  const wslEnv = { WSL_DISTRO_NAME: "Ubuntu" };

  assert.equal(resolveDefaultPort(wslEnv), 17891);

  const opts = parseArgs([], wslEnv);
  assert.equal(opts.port, 17891);
  assert.equal(opts.portExplicit, false);
  assert.equal(opts.wslDefaultPort, true, "flags the WSL port shift for the startup notice");

  const explicit = parseArgs(["--port", "7680"], wslEnv);
  assert.equal(explicit.port, 7680, "--port 7680 is respected even under WSL");
  assert.equal(explicit.wslDefaultPort, false);

  const envPort = parseArgs([], { ...wslEnv, PORT: "7690" });
  assert.equal(envPort.port, 7690, "PORT env is respected even under WSL");
  assert.equal(envPort.wslDefaultPort, false);
});

test("isRunningUnderWsl detection matrix", (t) => {
  mockPlatform(t, "linux");
  assert.equal(isRunningUnderWsl({ WSL_DISTRO_NAME: "Ubuntu" }), true, "WSL_DISTRO_NAME env");
  assert.equal(isRunningUnderWsl({ WSL_INTEROP: "/run/WSL/1_interop" }), true, "WSL_INTEROP env");
  assert.equal(
    isRunningUnderWsl({}, () => "Linux version 5.15.167.4-microsoft-standard-WSL2"),
    true,
    "/proc/version fingerprint",
  );
  assert.equal(
    isRunningUnderWsl({}, () => "Linux version 6.1.0-generic (gcc ...)"),
    false,
    "plain Linux stays on the standard default",
  );
  assert.equal(
    isRunningUnderWsl({}, () => { throw new Error("EACCES"); }),
    false,
    "unreadable /proc/version fails safe",
  );
  assert.equal(resolveDefaultPort({}, () => "Linux version 6.1.0-generic"), 17890);
});

test("isRunningUnderWsl is false off Linux regardless of env", (t) => {
  mockPlatform(t, "darwin");
  assert.equal(isRunningUnderWsl({ WSL_DISTRO_NAME: "Ubuntu" }), false);
  assert.equal(resolveDefaultPort({ WSL_DISTRO_NAME: "Ubuntu" }), 17890);
});

test("serve-command parsing survives ps output quirks", () => {
  // `ps -o command=` joins argv with spaces and drops all quoting, so the
  // script path is only unambiguous relative to the `serve` argument after it.
  assert.equal(
    parseServeScriptPath("node /home/u/Token Tracker/bin/tracker.js serve"),
    "/home/u/Token Tracker/bin/tracker.js",
  );
  assert.equal(
    parseServeScriptPath("/opt/app/node /opt/app/tokentracker/bin/tracker.js serve --no-open"),
    "/opt/app/tokentracker/bin/tracker.js",
  );

  // `serve` can occur inside the install path as well as being the subcommand,
  // so the delimiter is chosen by which prefix is actually a tracker entry.
  // Taking the first boundary would parse this as "/home/u/my".
  assert.equal(
    parseServeScriptPath("node /home/u/my serve dir/bin/tracker.js serve --port 7680"),
    "/home/u/my serve dir/bin/tracker.js",
  );
  // ...and equally, a later `serve` among the arguments must not win.
  assert.equal(
    parseServeScriptPath("node /opt/tt/bin/tracker.js serve --dir /my serve/x"),
    "/opt/tt/bin/tracker.js",
  );

  // Not a node `serve` invocation at all.
  assert.equal(parseServeScriptPath("python3 /usr/lib/tokentracker/bin/tracker.js serve"), null);
  assert.equal(parseServeScriptPath("node /usr/lib/tokentracker/bin/tracker.js sync"), null);
  assert.equal(parseServeScriptPath("/usr/bin/postgres -D /var/lib/pgsql serve"), null);
  assert.equal(parseServeScriptPath("nginx: worker process"), null);
  // ps prints nothing once the pid is gone; never treat that as a match.
  assert.equal(parseServeScriptPath(""), null);
});

test("port cleanup only targets a real TokenTracker package", (t) => {
  // Path shape alone is not identifying: unrelated projects ship a
  // `bin/tracker.js` too, so the entry must resolve into a genuine
  // tokentracker-cli package before anything is signalled.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tt-serve-id-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const install = (name, pkgName) => {
    const dir = path.join(root, name);
    fs.mkdirSync(path.join(dir, "bin"), { recursive: true });
    fs.writeFileSync(path.join(dir, "bin", "tracker.js"), "");
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: pkgName }));
    return path.join(dir, "bin", "tracker.js");
  };

  const ours = install("ours", NPM_PACKAGE_NAME);
  assert.equal(isTokenTrackerServeCommand(`node ${ours} serve --port 7680`), true);

  // Same layout, different package: someone else's tracker.
  const theirs = install("theirs", "some-other-tracker");
  assert.equal(isTokenTrackerServeCommand(`node ${theirs} serve`), false);

  // The npm bin shim is a symlink into the package; realpath must be followed.
  const shimDir = path.join(root, "node_modules", ".bin");
  fs.mkdirSync(shimDir, { recursive: true });
  const shim = path.join(shimDir, "tokentracker-cli");
  fs.symlinkSync(ours, shim);
  assert.equal(isTokenTrackerServeCommand(`node ${shim} serve`), true);

  // The same, end to end: a genuine package under a directory containing
  // " serve " must still be recognised, or its cleanup silently stops working.
  const oddDir = path.join(root, "my serve dir");
  fs.mkdirSync(path.join(oddDir, "bin"), { recursive: true });
  fs.writeFileSync(path.join(oddDir, "bin", "tracker.js"), "");
  fs.writeFileSync(path.join(oddDir, "package.json"), JSON.stringify({ name: NPM_PACKAGE_NAME }));
  assert.equal(
    isTokenTrackerServeCommand(`node ${path.join(oddDir, "bin", "tracker.js")} serve --port 7680`),
    true,
  );

  // A lookalike path that does not exist resolves to nothing, so it is never
  // signalled -- the case that made a bare path-shape check unsafe.
  assert.equal(isTokenTrackerServeCommand("node /srv/other/bin/tracker.js serve"), false);
  // tracker.js outside a bin/ directory is rejected before any filesystem work.
  assert.equal(isTokenTrackerServeCommand("node /srv/other/tracker.js serve"), false);
});

test("port scan is limited to listeners, not everything touching the port", () => {
  // `lsof -i tcp:<port>` matches a socket whose LOCAL *or REMOTE* port matches,
  // so without -sTCP:LISTEN a browser connected to the dashboard is reported
  // alongside the server it is talking to.
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "commands", "serve.js"), "utf8");
  assert.match(source, /"-sTCP:LISTEN"/);
});

// Proves ensurePortFree consults the identity check rather than merely owning
// one: a unit test of isTokenTrackerServeCommand alone still passes if the
// filter is deleted from the kill path.
test("ensurePortFree leaves an unrelated listener running", async (t) => {
  const cp = require("node:child_process");
  const hasLsof = (() => {
    try {
      cp.execFileSync("lsof", ["-v"], { stdio: "ignore", timeout: 5000 });
      return true;
    } catch (_e) {
      return false;
    }
  })();
  if (!hasLsof) return t.skip("ensurePortFree is a no-op without lsof");

  // A separate process, because ensurePortFree skips its own pid for free.
  const child = cp.spawn(
    process.execPath,
    [
      "-e",
      "const n=require('net');n.createServer(c=>c.on('error',()=>{}))" +
        ".listen(0,'127.0.0.1',function(){process.stdout.write(String(this.address().port))});" +
        "setInterval(()=>{},1000);",
    ],
    { stdio: ["ignore", "pipe", "ignore"] },
  );
  t.after(() => child.kill("SIGKILL"));

  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("listener never reported a port")), 10000);
    child.stdout.once("data", (chunk) => {
      clearTimeout(timer);
      resolve(Number(String(chunk).trim()));
    });
  });
  assert.ok(port > 0, "child should report its port");

  await ensurePortFree(port);

  assert.equal(child.exitCode, null, "an unrelated listener must survive port cleanup");
  assert.equal(child.signalCode, null, "an unrelated listener must not be signalled");
});
