"""cpp-dojo compile service. POST /run {"code": "..."} ->
{"compile": {"ok", "stderr"}, "run": {"stdout", "stderr", "exit"}}"""
import json
import resource
import subprocess
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

MAX_BODY = 256 * 1024
MAX_OUT = 64 * 1024
COMPILE_TIMEOUT = 20
RUN_TIMEOUT = 5


def limits():
    resource.setrlimit(resource.RLIMIT_CPU, (5, 5))
    resource.setrlimit(resource.RLIMIT_AS, (512 << 20, 512 << 20))
    resource.setrlimit(resource.RLIMIT_NPROC, (64, 64))
    resource.setrlimit(resource.RLIMIT_FSIZE, (10 << 20, 10 << 20))


def clip(s):
    return s[:MAX_OUT]


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
            code = json.loads(self.rfile.read(n)).get("code", "")
        except (json.JSONDecodeError, AttributeError):
            return self._json(400, {"error": "bad json"})
        if not code.strip():
            return self._json(400, {"error": "empty code"})

        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "main.cpp"
            src.write_text(code)
            prog = Path(tmp) / "prog"
            try:
                cc = subprocess.run(
                    ["g++", "-std=c++20", "-O0", "-fdiagnostics-color=never",
                     "-o", str(prog), str(src)],
                    capture_output=True, text=True, timeout=COMPILE_TIMEOUT, cwd=tmp)
            except subprocess.TimeoutExpired:
                return self._json(200, {
                    "compile": {"ok": False, "stderr": "compiler timed out"},
                    "run": {"stdout": "", "stderr": "", "exit": -1}})
            if cc.returncode != 0:
                return self._json(200, {
                    "compile": {"ok": False, "stderr": clip(cc.stderr)},
                    "run": {"stdout": "", "stderr": "", "exit": -1}})
            try:
                r = subprocess.run(
                    [str(prog)], capture_output=True, text=True,
                    timeout=RUN_TIMEOUT, cwd=tmp, stdin=subprocess.DEVNULL,
                    preexec_fn=limits)
                run = {"stdout": clip(r.stdout), "stderr": clip(r.stderr),
                       "exit": r.returncode}
            except subprocess.TimeoutExpired as e:
                run = {"stdout": clip(e.stdout or ""),
                       "stderr": "timed out after %ss" % RUN_TIMEOUT, "exit": -1}
            return self._json(200, {
                "compile": {"ok": True, "stderr": clip(cc.stderr)}, "run": run})


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8080), Handler).serve_forever()
