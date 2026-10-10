"""Bounded Linux-only broker acceptance. Run only in the documented container."""

import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import random
import socket
import stat
import struct
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch
import zlib
from PIL import Image

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("broker", ROOT / "image-broker.py")
broker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(broker)


def framed(value):
    data = value if isinstance(value, bytes) else json.dumps(value, separators=(",", ":")).encode()
    return struct.pack(">I", len(data)) + data


def response(connection):
    result = bytearray()
    connection.settimeout(9)
    while True:
        part = connection.recv(1029)
        if not part:
            break
        result.extend(part)
        if len(result) > 1028:
            raise AssertionError("Unbounded response")
    if len(result) < 5 or struct.unpack_from(">I", result)[0] != len(result) - 4:
        raise AssertionError("Invalid response framing")
    return json.loads(result[4:])


class BrokerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if sys.platform != "linux" or os.geteuid() == 0:
            raise RuntimeError("An unprivileged Linux sandbox is required")
        cls.directory = tempfile.TemporaryDirectory(dir="/scratch")
        cls.path = str(Path(cls.directory.name) / "image.sock")
        cls.start()

    @classmethod
    def start(cls):
        cls.process = subprocess.Popen([sys.executable, "-I", "-B", str(ROOT / "image-broker.py"), "--socket", cls.path],
                                       cwd="/scratch", env={"PATH": "/usr/local/bin:/usr/bin:/bin", "HOME": "/scratch", "TMPDIR": "/scratch"},
                                       stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        deadline = time.monotonic() + 3
        while not Path(cls.path).exists():
            if cls.process.poll() is not None or time.monotonic() > deadline:
                raise AssertionError("Broker startup failed")
            time.sleep(0.02)

    @classmethod
    def stop(cls):
        cls.process.terminate()
        cls.process.wait(timeout=10)
        cls.process.stderr.close()

    @classmethod
    def tearDownClass(cls):
        if cls.process.poll() is None:
            cls.stop()
        cls.directory.cleanup()

    def connect(self):
        connection = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        connection.settimeout(9)
        connection.connect(self.path)
        self.addCleanup(connection.close)
        return connection

    def exchange(self, header, data=b""):
        connection = self.connect()
        connection.sendall(framed(header) + data)
        connection.shutdown(socket.SHUT_WR)
        return response(connection)

    def inspect(self, data, mime="image/png"):
        return self.exchange({"kind": "inspect", "mimeType": mime, "size": len(data)}, data)

    def test_01_readiness_really_decodes_the_fixed_image(self):
        result = self.exchange({"kind": "ready"})
        self.assertEqual(result, broker.run_worker(broker.SELF_TEST, "image/png"))
        self.assertTrue(result["ok"])
        self.assertEqual(result["sha256"], hashlib.sha256(broker.SELF_TEST).hexdigest())
        self.assertEqual((result["width"], result["height"]), (1, 1))

    def test_02_original_png_jpeg_and_cmyk_hashes(self):
        for mode, format_, mime in [("RGBA", "PNG", "image/png"), ("RGB", "JPEG", "image/jpeg"), ("CMYK", "JPEG", "image/jpeg")]:
            with self.subTest(mode=mode):
                output = io.BytesIO()
                Image.new(mode, (48, 32)).save(output, format=format_)
                data = output.getvalue()
                result = self.inspect(data, mime)
                self.assertTrue(result["ok"])
                self.assertEqual(result["sha256"], hashlib.sha256(data).hexdigest())
                self.assertEqual(result["size"], len(data))
                self.assertEqual((result["width"], result["height"]), (48, 32))

    def test_03_corrupt_and_trailing_images_fail_then_recover(self):
        for data in [broker.SELF_TEST + b"extra", broker.SELF_TEST[:-3], broker.SELF_TEST[:40] + b"broken"]:
            self.assertEqual(self.inspect(data), {"ok": False, "code": "image_content_not_allowed"})
        self.assertTrue(self.inspect(broker.SELF_TEST)["ok"])

    def test_04_invalid_header_mime_size_and_duplicate_keys(self):
        cases = [{"kind": "inspect", "mimeType": "application/pdf", "size": 1}, {"kind": "inspect", "mimeType": [], "size": 1},
                 {"kind": "inspect", "mimeType": "image/png", "size": True}, {"kind": "inspect", "mimeType": "image/png", "size": broker.MAX_BYTES + 1},
                 {"kind": "ready", "filename": "do-not-return.png"}, b'{"kind":"ready","kind":"inspect"}', [], b"not JSON"]
        for header in cases:
            with self.subTest(header=header):
                self.assertEqual(self.exchange(header), {"ok": False, "code": "image_inspection_unavailable"})

    def test_05_missing_trailing_and_oversized_framing(self):
        for wire in [struct.pack(">I", 257), framed({"kind": "ready"}) + b"extra", framed({"kind": "inspect", "mimeType": "image/png", "size": 50}) + b"short"]:
            connection = self.connect()
            connection.sendall(wire)
            connection.shutdown(socket.SHUT_WR)
            self.assertEqual(response(connection), {"ok": False, "code": "image_inspection_unavailable"})

    def test_06_stalled_input_has_total_deadline_and_releases_slots(self):
        connection = self.connect()
        connection.sendall(framed({"kind": "inspect", "mimeType": "image/png", "size": 50}))
        start = time.monotonic()
        self.assertEqual(response(connection), {"ok": False, "code": "image_inspection_unavailable"})
        self.assertLess(time.monotonic() - start, 3)
        self.assertTrue(self.exchange({"kind": "ready"})["ok"])

    def test_07_two_slots_bound_concurrency_and_busy_recovers(self):
        first, second = self.connect(), self.connect()
        first.sendall(b"\0")
        second.sendall(b"\0")
        time.sleep(0.1)
        third = self.connect()
        self.assertEqual(response(third), {"ok": False, "code": "image_inspection_busy"})
        first.shutdown(socket.SHUT_WR)
        second.shutdown(socket.SHUT_WR)
        response(first)
        response(second)
        time.sleep(0.05)
        self.assertTrue(self.exchange({"kind": "ready"})["ok"])

    def test_08_disconnect_and_wrong_mime_do_not_disable_readiness(self):
        connection = self.connect()
        connection.sendall(framed({"kind": "inspect", "size": len(broker.SELF_TEST), "mimeType": "image/png"}) + broker.SELF_TEST[:10])
        connection.close()
        self.assertEqual(self.inspect(broker.SELF_TEST, "image/jpeg"), {"ok": False, "code": "image_content_not_allowed"})
        self.assertTrue(self.exchange({"kind": "ready"})["ok"])

    def test_09_socket_private_permissions_and_preexisting_path_not_replaced(self):
        inode = Path(self.path).stat().st_ino
        self.assertEqual(stat.S_IMODE(Path(self.path).stat().st_mode), 0o600)
        duplicate = subprocess.run([sys.executable, "-I", "-B", str(ROOT / "image-broker.py"), "--socket", self.path],
                                   cwd="/scratch", env={"PATH": "/usr/local/bin:/usr/bin:/bin"}, capture_output=True, timeout=2)
        self.assertEqual(duplicate.returncode, 3)
        self.assertEqual(duplicate.stderr, b"image_broker_unavailable\n")
        self.assertEqual(Path(self.path).stat().st_ino, inode)

    def test_10_worker_crash_output_flood_and_malformed_proof_are_bounded(self):
        scripts = ["import os;os.kill(os.getpid(),9)", "print('x'*10000)", "import sys;sys.stderr.write('x'*10000)",
                   "print('{}')", "print('{\"ok\":false,\"code\":[]}')", "print('{\"ok\":false,\"code\":\"image_content_not_allowed\"}')"]
        for script in scripts:
            with self.subTest(script=script):
                result = broker.supervise([sys.executable, "-I", "-c", script], broker.SELF_TEST, "image/png")
                self.assertEqual(result, {"ok": False, "code": "image_inspection_unavailable"})

    def test_11_supervisor_terminates_timeout_and_reaps_child(self):
        previous = broker.JOB_SECONDS
        broker.JOB_SECONDS = 0.1
        try:
            start = time.monotonic()
            result = broker.supervise([sys.executable, "-I", "-c", "import time;time.sleep(20)"], broker.SELF_TEST, "image/png")
            self.assertEqual(result, {"ok": False, "code": "image_inspection_timeout"})
            self.assertLess(time.monotonic() - start, 1)
        finally:
            broker.JOB_SECONDS = previous
        self.assertTrue(self.exchange({"kind": "ready"})["ok"])

    def test_12_graceful_stop_removes_only_owned_socket_and_restart_works(self):
        self.stop()
        self.assertFalse(Path(self.path).exists())
        self.start()
        self.assertTrue(self.exchange({"kind": "ready"})["ok"])

    def test_13_exact_byte_ceiling_uses_a_valid_full_decoded_png_not_trailing_padding(self):
        output = io.BytesIO()
        Image.frombytes("RGBA", (1024, 1278), random.Random(12).randbytes(1024 * 1278 * 4)).save(output, format="PNG", compress_level=0)
        data = output.getvalue()
        padding = broker.MAX_BYTES - len(data) - 12
        self.assertGreater(padding, 2)
        text = b"q\0" + b"x" * (padding - 2)
        chunk = struct.pack(">I", len(text)) + b"tEXt" + text + struct.pack(">I", zlib.crc32(b"tEXt" + text))
        data = data[:33] + chunk + data[33:]
        self.assertEqual(len(data), broker.MAX_BYTES)
        result = self.inspect(data)
        self.assertTrue(result["ok"])
        self.assertEqual(result["size"], broker.MAX_BYTES)
        self.assertEqual(result["sha256"], hashlib.sha256(data).hexdigest())
        self.assertEqual(self.exchange({"kind": "inspect", "mimeType": "image/png", "size": broker.MAX_BYTES + 1}),
                         {"ok": False, "code": "image_inspection_unavailable"})


    def test_14_thread_creation_failure_closes_connection_releases_slot_and_recovers(self):
        slots = broker.threading.BoundedSemaphore(1)
        self.assertTrue(slots.acquire(blocking=False))
        client, connection = socket.socketpair()
        self.addCleanup(client.close)
        with patch.object(broker.threading.Thread, "start", side_effect=RuntimeError("Synthetic resource exhaustion")):
            self.assertIsNone(broker.start_handler(connection, slots))
        self.assertEqual(response(client), {"ok": False, "code": "image_inspection_unavailable"})
        self.assertEqual(connection.fileno(), -1)
        self.assertTrue(slots.acquire(blocking=False))
        recovered, connection = socket.socketpair()
        self.addCleanup(recovered.close)
        thread = broker.start_handler(connection, slots)
        self.assertIsNotNone(thread)
        recovered.sendall(framed({"kind": "ready"}))
        recovered.shutdown(socket.SHUT_WR)
        self.assertTrue(response(recovered)["ok"])
        thread.join(timeout=9)
        self.assertFalse(thread.is_alive())
        self.assertTrue(slots.acquire(blocking=False))


if __name__ == "__main__":
    unittest.main(verbosity=2)
