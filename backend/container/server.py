"""cpp-dojo compile service. POST /run {"code": "..."} ->
{"compile": {"ok", "stderr"}, "run": {"stdout", "stderr", "exit"}}

Runs untrusted C++. Defenses:
- workload runs as unprivileged uid RUNNER (server stays root only to setuid
  down and to reap by uid)
- execution is serialized by a global lock, so UID-based reaping after each
  run can't hit another request's processes
- after every run, EVERY process owned by RUNNER is killed — this catches
  children that escaped their process group via setsid()
- compile step gets an address-space limit (bounds compile-time memory bombs);
  the run step does NOT (an AS limit breaks amd64 binaries under local Rosetta
  emulation — runtime memory is instead bounded by the wall-clock timeout)
"""
import json
import os
import resource
import signal
import subprocess
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

RUNNER = 1000                       # unprivileged uid/gid created in the image
MAX_BODY = 256 * 1024
MAX_OUT = 64 * 1024
COMPILE_TIMEOUT = 20
RUN_TIMEOUT = 5
COMPILE_AS_LIMIT = 2 << 30          # 2 GiB address space for g++

# Only one compile+run at a time per container: prevents concurrent bombs from
# stacking, and makes "kill everything owned by RUNNER" safe.
RUN_LOCK = threading.Lock()


def compile_preexec():
    resource.setrlimit(resource.RLIMIT_CPU, (COMPILE_TIMEOUT, COMPILE_TIMEOUT))
    resource.setrlimit(resource.RLIMIT_AS, (COMPILE_AS_LIMIT, COMPILE_AS_LIMIT))
    resource.setrlimit(resource.RLIMIT_FSIZE, (10 << 20, 10 << 20))
    os.setgid(RUNNER)
    os.setuid(RUNNER)


def run_preexec():
    # RLIMIT_CPU/FSIZE are safe to set before dropping privileges. RLIMIT_NPROC
    # is NOT set here: after setuid() to a non-root uid, execve() fails with
    # EAGAIN if an nproc limit is set. Instead the shell wrapper below applies
    # `ulimit -u` once it is already uid RUNNER (no uid change at that execve,
    # so the limit sticks and fork bombs are capped). No RLIMIT_AS — it breaks
    # amd64 binaries under local Rosetta emulation.
    resource.setrlimit(resource.RLIMIT_CPU, (RUN_TIMEOUT, RUN_TIMEOUT))
    resource.setrlimit(resource.RLIMIT_FSIZE, (10 << 20, 10 << 20))
    os.setgid(RUNNER)
    os.setuid(RUNNER)
    os.setsid()                     # own process group; we still reap by uid


# Cap uid RUNNER to 64 processes, then exec the command. `ulimit -u` runs
# after the shell is already RUNNER, so the exec has no uid change. `exec "$@"`
# handles both a bare binary (./prog) and interpreter+script (python3 main.py).
RUN_WRAPPER = 'ulimit -u 64 2>/dev/null; exec "$@"'


def reap(uid):
    """SIGKILL every process owned by uid, repeatedly — a single pass races a
    fork bomb that is still spawning, so loop until a pass finds nothing."""
    for _ in range(8):
        killed = 0
        for entry in os.listdir("/proc"):
            if not entry.isdigit():
                continue
            try:
                if os.stat("/proc/" + entry).st_uid == uid:
                    os.kill(int(entry), signal.SIGKILL)
                    killed += 1
            except (ProcessLookupError, FileNotFoundError, PermissionError):
                pass
        if killed == 0:
            return


def clip(s):
    return s[:MAX_OUT]


def _run(argv, tmp, env):
    """Run argv as the unprivileged RUNNER (sandboxed, reaped, output-capped)."""
    p = subprocess.Popen(
        ["/bin/sh", "-c", RUN_WRAPPER, "run"] + argv, stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        cwd=tmp, env=env, preexec_fn=run_preexec)
    try:
        out, errtext = p.communicate(timeout=RUN_TIMEOUT)
        return {"stdout": clip(out), "stderr": clip(errtext), "exit": p.returncode}
    except subprocess.TimeoutExpired:
        reap(RUNNER)
        try:
            out, errtext = p.communicate(timeout=2)
        except subprocess.TimeoutExpired:
            out, errtext = "", ""
        return {"stdout": clip(out or ""), "stderr": "timed out after %ss" % RUN_TIMEOUT, "exit": -1}
    finally:
        reap(RUNNER)


def compile_and_run(code, lang="cpp"):
    with tempfile.TemporaryDirectory() as tmp:
        os.chown(tmp, RUNNER, RUNNER)  # unprivileged workload writes here
        env = {"PATH": "/usr/bin:/bin", "HOME": tmp, "TMPDIR": tmp}

        with RUN_LOCK:
            if lang == "python":
                # interpreted — no compile step; run python3 directly
                src = Path(tmp) / "main.py"
                src.write_text(code)
                os.chown(src, RUNNER, RUNNER)
                run = _run(["python3", str(src)], tmp, env)
                return {"compile": {"ok": True, "stderr": ""}, "run": run}

            # C++ — compile with g++, then run the binary
            src = Path(tmp) / "main.cpp"
            src.write_text(code)
            os.chown(src, RUNNER, RUNNER)
            prog = Path(tmp) / "prog"
            try:
                cc = subprocess.run(
                    ["g++", "-std=c++20", "-O0", "-fdiagnostics-color=never",
                     "-o", str(prog), str(src)],
                    capture_output=True, text=True, timeout=COMPILE_TIMEOUT,
                    cwd=tmp, env=env, preexec_fn=compile_preexec)
            except subprocess.TimeoutExpired:
                reap(RUNNER)
                return {"compile": {"ok": False, "stderr": "compiler timed out"},
                        "run": {"stdout": "", "stderr": "", "exit": -1}}
            finally:
                reap(RUNNER)

            if cc.returncode != 0:
                return {"compile": {"ok": False, "stderr": clip(cc.stderr)},
                        "run": {"stdout": "", "stderr": "", "exit": -1}}

            run = _run([str(prog)], tmp, env)
            return {"compile": {"ok": True, "stderr": clip(cc.stderr)}, "run": run}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _json(self, status, obj):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            self._json(200, {"ok": True})
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/run":
            return self._json(404, {"error": "not found"})
        n = int(self.headers.get("Content-Length", 0))
        if n > MAX_BODY:
            return self._json(413, {"error": "body too large"})
        try:
            body = json.loads(self.rfile.read(n))
            code = body.get("code", "")
            lang = "python" if body.get("lang") == "python" else "cpp"
        except (json.JSONDecodeError, AttributeError):
            return self._json(400, {"error": "bad json"})
        if not code.strip():
            return self._json(400, {"error": "empty code"})
        self._json(200, compile_and_run(code, lang))


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8080), Handler).serve_forever()
