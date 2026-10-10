"""Private Unix-socket supervisor. Must run inside the documented OS sandbox."""

import hashlib
import json
import os
from pathlib import Path
import resource
import selectors
import signal
import socket
import stat
import struct
import subprocess
import sys
import threading
import time

MAX_BYTES = 5 * 1024 * 1024
MAX_RESPONSE = 1024
READ_SECONDS = 2
JOB_SECONDS = 6
WORKER = Path(__file__).with_name("image-inspector.py")
ERRORS = {"image_content_not_allowed", "image_type_not_allowed", "image_size_not_allowed",
          "image_complexity_limit", "image_inspection_unavailable", "image_inspection_timeout"}
SELF_TEST = bytes.fromhex("89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de"
                          "0000000c49444154789c63606060000000040001f61738550000000049454e44ae426082")


class ProtocolError(Exception):
    pass


def exact_json(data):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ProtocolError()
            result[key] = value
        return result
    try:
        result = json.loads(data, object_pairs_hook=unique)
        if not isinstance(result, dict):
            raise ProtocolError()
        return result
    except (ValueError, UnicodeError):
        raise ProtocolError() from None


def validate_result(result, data, mime):
    if result.get("ok") is False and set(result) == {"ok", "code"} and isinstance(result["code"], str) and result["code"] in ERRORS:
        return result
    keys = {"ok", "policy", "decoder", "mimeType", "size", "sha256", "width", "height", "frames"}
    if (set(result) != keys or result.get("ok") is not True
            or result["policy"] != "private-image-v1-pillow" or result["decoder"] != "Pillow 12.3.0"
            or result["mimeType"] != mime or type(result["size"]) is not int or result["size"] != len(data)
            or result["sha256"] != hashlib.sha256(data).hexdigest() or type(result["frames"]) is not int
            or result["frames"] != 1 or any(type(result[k]) is not int or not 0 < result[k] <= 8192 for k in ("width", "height"))
            or result["width"] * result["height"] > 16_000_000):
        raise ProtocolError()
    return result


def run_worker(data, mime):
    return supervise([sys.executable, "-I", "-B", str(WORKER), "--mime", mime], data, mime)


def supervise(command, data, mime):
    child = None
    try:
        child = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                 start_new_session=True, cwd="/scratch", env={"PATH": "/usr/local/bin:/usr/bin:/bin", "HOME": "/scratch", "TMPDIR": "/scratch"})
        output, errors, offset, deadline = bytearray(), bytearray(), 0, time.monotonic() + JOB_SECONDS
        with selectors.DefaultSelector() as selector:
            for stream, event in [(child.stdin, selectors.EVENT_WRITE), (child.stdout, selectors.EVENT_READ), (child.stderr, selectors.EVENT_READ)]:
                os.set_blocking(stream.fileno(), False)
                selector.register(stream, event)
            while selector.get_map():
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    return {"ok": False, "code": "image_inspection_timeout"}
                for key, _event in selector.select(min(remaining, 0.1)):
                    stream = key.fileobj
                    if stream is child.stdin:
                        try:
                            offset += os.write(stream.fileno(), memoryview(data)[offset:offset + 65536])
                        except BrokenPipeError:
                            offset = len(data)
                        if offset == len(data):
                            selector.unregister(stream)
                            stream.close()
                    else:
                        chunk = os.read(stream.fileno(), 1025)
                        target = output if stream is child.stdout else errors
                        target.extend(chunk)
                        if len(target) > MAX_RESPONSE:
                            raise ProtocolError()
                        if not chunk:
                            selector.unregister(stream)
                            stream.close()
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return {"ok": False, "code": "image_inspection_timeout"}
        status = child.wait(timeout=remaining)
        result = validate_result(exact_json(output), data, mime)
        if status != (0 if result["ok"] else 3 if result["code"] in {"image_inspection_timeout", "image_inspection_unavailable"} else 2):
            raise ProtocolError()
        return result
    except subprocess.TimeoutExpired:
        return {"ok": False, "code": "image_inspection_timeout"}
    except (OSError, ProtocolError, MemoryError):
        return {"ok": False, "code": "image_inspection_unavailable"}
    finally:
        if child is not None:
            if child.poll() is None:
                try:
                    os.killpg(child.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            child.wait()
            for stream in (child.stdin, child.stdout, child.stderr):
                if not stream.closed:
                    stream.close()


def read_exact(connection, length, deadline):
    data = bytearray()
    while len(data) < length:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise ProtocolError()
        connection.settimeout(remaining)
        chunk = connection.recv(min(length - len(data), 65536))
        if not chunk:
            raise ProtocolError()
        data.extend(chunk)
    return bytes(data)


def read_job(connection):
    deadline = time.monotonic() + READ_SECONDS
    length = struct.unpack(">I", read_exact(connection, 4, deadline))[0]
    if not 0 < length <= 256:
        raise ProtocolError()
    job = exact_json(read_exact(connection, length, deadline))
    if job == {"kind": "ready"}:
        data, mime = SELF_TEST, "image/png"
    elif (set(job) == {"kind", "size", "mimeType"} and job["kind"] == "inspect"
          and type(job["size"]) is int and 0 < job["size"] <= MAX_BYTES
          and isinstance(job["mimeType"], str) and job["mimeType"] in {"image/png", "image/jpeg"}):
        data, mime = read_exact(connection, job["size"], deadline), job["mimeType"]
    else:
        raise ProtocolError()
    connection.settimeout(max(0.001, deadline - time.monotonic()))
    if connection.recv(1):
        raise ProtocolError()
    return data, mime


def respond(connection, result):
    data = json.dumps(result, separators=(",", ":")).encode()
    if len(data) > MAX_RESPONSE:
        raise ProtocolError()
    connection.settimeout(1)
    connection.sendall(struct.pack(">I", len(data)) + data)


def handle(connection, slots):
    try:
        try:
            data, mime = read_job(connection)
            result = run_worker(data, mime)
        except (OSError, ProtocolError):
            result = {"ok": False, "code": "image_inspection_unavailable"}
            # Drain only already-buffered small protocol debris so an ordinary rejection can reach the caller.
            connection.setblocking(False)
            try:
                remaining = 65536
                while remaining:
                    chunk = connection.recv(min(remaining, 4096))
                    if not chunk:
                        break
                    remaining -= len(chunk)
            except OSError:
                pass
        respond(connection, result)
    except (OSError, ProtocolError):
        pass
    finally:
        connection.close()
        slots.release()


def start_handler(connection, slots):
    try:
        thread = threading.Thread(target=handle, args=(connection, slots))
        thread.start()
        return thread
    except RuntimeError:
        try:
            respond(connection, {"ok": False, "code": "image_inspection_unavailable"})
        except (OSError, ProtocolError):
            pass
        finally:
            connection.close()
            slots.release()
        return None


def serve(path):
    if sys.platform != "linux" or os.geteuid() == 0 or not path.is_absolute() or len(os.fsencode(path)) > 100:
        raise ProtocolError()
    directory = path.parent.lstat()
    if not stat.S_ISDIR(directory.st_mode) or directory.st_uid != os.geteuid() or directory.st_mode & 0o077:
        raise ProtocolError()
    if os.path.lexists(path):
        raise ProtocolError()
    # The child must still be able to apply its stricter 256 MiB hard limit after exec.
    resource.setrlimit(resource.RLIMIT_AS, (128 * 1024 * 1024, 256 * 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
    resource.setrlimit(resource.RLIMIT_NPROC, (24, 24))
    resource.setrlimit(resource.RLIMIT_FSIZE, (0, 0))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    slots, threads, stop = threading.BoundedSemaphore(2), set(), threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as server:
        server.bind(str(path))
        identity = path.lstat().st_ino
        os.chmod(path, 0o600)
        server.listen(8)
        server.settimeout(0.5)
        try:
            while not stop.is_set():
                try:
                    connection, _ = server.accept()
                except socket.timeout:
                    continue
                _pid, uid, _gid = struct.unpack("3i", connection.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
                if uid != os.geteuid():
                    connection.close()
                    continue
                if not slots.acquire(blocking=False):
                    try:
                        respond(connection, {"ok": False, "code": "image_inspection_busy"})
                    except OSError:
                        pass
                    connection.close()
                    continue
                threads = {thread for thread in threads if thread.is_alive()}
                thread = start_handler(connection, slots)
                if thread is not None:
                    threads.add(thread)
        finally:
            for thread in threads:
                thread.join(READ_SECONDS + JOB_SECONDS + 2)
            if path.lstat().st_ino == identity:
                path.unlink()


if __name__ == "__main__":
    try:
        if len(sys.argv) != 3 or sys.argv[1] != "--socket":
            raise ProtocolError()
        serve(Path(sys.argv[2]))
    except (OSError, ProtocolError, ValueError):
        sys.stderr.write("image_broker_unavailable\n")
        sys.exit(3)
