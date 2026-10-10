import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import resource
import signal
import socket
import struct
import subprocess
import sys
import unittest
import zlib

from PIL import Image

WORKER = Path(__file__).with_name("image-inspector.py")
spec = importlib.util.spec_from_file_location("image_inspector", WORKER)
inspector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inspector)
ENV = {"HOME": "/scratch", "TMPDIR": "/scratch", "PATH": "/usr/local/bin:/usr/bin:/bin", "PYTHONDONTWRITEBYTECODE": "1"}


def generated(fmt="PNG", mode="RGB", size=(16, 12), **options):
    image = Image.new(mode, size, 1)
    output = io.BytesIO()
    image.save(output, format=fmt, **options)
    return output.getvalue()


def chunk(kind, data):
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))


def invoke(data, mime="image/png"):
    result = subprocess.run([sys.executable, str(WORKER), "--mime", mime], input=data,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=ENV, timeout=7)
    if len(result.stdout) > 1024 or result.stderr:
        raise AssertionError("Unbounded or unexpected decoder diagnostics")
    return result.returncode, json.loads(result.stdout)


class ImageInspectionTests(unittest.TestCase):
    def rejected(self, data, mime="image/png", code="image_content_not_allowed"):
        status, result = invoke(data, mime)
        self.assertEqual(status, 2)
        self.assertEqual(result, {"ok": False, "code": code})

    def test_static_png_jpeg_progressive_grayscale_rgba_and_cmyk_preserve_original_hash(self):
        for fmt, mode, options in [("PNG", "RGB", {}), ("PNG", "RGBA", {}), ("PNG", "L", {}),
                                   ("JPEG", "RGB", {}), ("JPEG", "RGB", {"progressive": True}), ("JPEG", "CMYK", {})]:
            with self.subTest(fmt=fmt, mode=mode, options=options):
                data = generated(fmt, mode, **options)
                status, result = invoke(data, "image/png" if fmt == "PNG" else "image/jpeg")
                self.assertEqual(status, 0)
                self.assertEqual(result, {"ok": True, "policy": inspector.POLICY, "decoder": "Pillow 12.3.0",
                                         "mimeType": "image/png" if fmt == "PNG" else "image/jpeg", "size": len(data),
                                         "sha256": hashlib.sha256(data).hexdigest(), "width": 16, "height": 12, "frames": 1})

    def test_existing_public_jpeg_decodes_without_rewriting(self):
        data = Path("/fixtures/cement-valve-bag.jpg").read_bytes()
        status, result = invoke(data, "image/jpeg")
        self.assertEqual(status, 0)
        self.assertEqual(result["sha256"], hashlib.sha256(data).hexdigest())
        self.assertEqual(result["size"], len(data))

    def test_common_twelve_megapixel_mobile_images_fit_the_worker_budget(self):
        for fmt, mime in [("PNG", "image/png"), ("JPEG", "image/jpeg")]:
            with self.subTest(fmt=fmt):
                data = generated(fmt, size=(4000, 3000))
                self.assertLess(len(data), inspector.MAX_BYTES)
                status, result = invoke(data, mime)
                self.assertEqual(status, 0)
                self.assertEqual((result["width"], result["height"]), (4000, 3000))
                self.assertEqual(result["sha256"], hashlib.sha256(data).hexdigest())

    def test_exact_pixel_ceiling_rgba_image_decodes_in_the_same_memory_budget(self):
        data = generated("PNG", "RGBA", size=(4000, 4000))
        status, result = invoke(data)
        self.assertEqual(status, 0)
        self.assertEqual(result["width"] * result["height"], inspector.MAX_PIXELS)
        self.assertEqual(result["sha256"], hashlib.sha256(data).hexdigest())

    def test_trailing_bytes_and_concatenated_images_are_rejected_not_relabelled_as_av_detection(self):
        for fmt, mime in [("PNG", "image/png"), ("JPEG", "image/jpeg")]:
            data = generated(fmt)
            for extra in [b"Synthetic trailing probe", b"\0", data, b"\xff\xd9"]:
                with self.subTest(fmt=fmt, extra=len(extra)):
                    self.rejected(data + extra, mime)

    def test_png_crc_and_truncation_are_rejected(self):
        data = generated()
        damaged = bytearray(data)
        damaged[29] ^= 1
        self.rejected(bytes(damaged))
        for truncated in [data[:8], data[:-1], data[:-12]]:
            self.rejected(truncated)

    def test_broken_pixel_stream_with_valid_crc_is_rejected_by_full_decode(self):
        header = struct.pack(">IIBBBBB", 16, 12, 8, 2, 0, 0, 0)
        # Valid compressed data, but too few pixel scanlines: envelope alone must not pass.
        data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(b"\x00\x00")) + chunk(b"IEND", b"")
        self.rejected(data)

    def test_wrong_format_empty_and_over_byte_limit_are_rejected(self):
        self.rejected(generated(), "image/jpeg")
        self.rejected(generated("JPEG"), "image/png")
        self.rejected(b"<svg>not raster</svg>")
        self.rejected(b"", code="image_size_not_allowed")
        self.rejected(b"x" * (inspector.MAX_BYTES + 1), code="image_size_not_allowed")
        self.rejected(generated(), "image/gif", "image_type_not_allowed")

    def test_png_idat_unused_bytes_and_second_compressed_stream_are_rejected(self):
        data = generated()
        offset = 8
        while data[offset + 4:offset + 8] != b"IDAT":
            offset += struct.unpack_from(">I", data, offset)[0] + 12
        length = struct.unpack_from(">I", data, offset)[0]
        compressed = data[offset + 8:offset + 8 + length]
        for extra in [b"Synthetic hidden trailing stream", zlib.compress(b"Synthetic second stream")]:
            self.rejected(data[:offset] + chunk(b"IDAT", compressed + extra) + data[offset + length + 12:])

    def test_png_expanded_stream_is_bounded_before_pixel_loading(self):
        header = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
        compressed = zlib.compress(b"x" * (inspector.MAX_INFLATED_BYTES + 1))
        data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", compressed) + chunk(b"IEND", b"")
        self.rejected(data, code="image_complexity_limit")

    def test_huge_dimensions_and_pixel_bombs_fail_before_full_decode(self):
        for width, height in [(8193, 1), (5000, 4000), (100000, 100000)]:
            header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
            data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(b"\0")) + chunk(b"IEND", b"")
            self.rejected(data, code="image_complexity_limit")

    def test_animation_and_unknown_critical_png_chunks_are_rejected(self):
        data = generated()
        self.rejected(data[:33] + chunk(b"acTL", struct.pack(">II", 1, 0)) + data[33:])
        self.rejected(data[:33] + chunk(b"ABCD", b"") + data[33:])

    def test_bounded_png_metadata_and_segments(self):
        data = generated()
        metadata = chunk(b"tEXt", b"Synthetic\0" + b"a" * inspector.MAX_METADATA_BYTES)
        self.rejected(data[:33] + metadata + data[33:], code="image_complexity_limit")
        self.rejected(data[:33] + chunk(b"teST", b"") * inspector.MAX_SEGMENTS + data[33:], code="image_complexity_limit")

    def test_jpeg_metadata_marker_bytes_are_not_confused_with_real_end_of_image(self):
        data = generated("JPEG")
        # An APP payload may legitimately contain the same byte pair as EOI.
        payload = b"Synthetic metadata \xff\xd9 marker"
        segment = b"\xff\xef" + struct.pack(">H", len(payload) + 2) + payload
        status, result = invoke(data[:2] + segment + data[2:], "image/jpeg")
        self.assertEqual(status, 0)
        self.assertTrue(result["ok"])
        self.rejected(data[:-2], "image/jpeg")

    def test_only_fixed_errors_leave_the_worker(self):
        self.rejected(b"private@example.test /private/customer-file.png")

    def test_linux_limits_are_effective_not_only_documented(self):
        code = "import importlib.util,json,resource; s=importlib.util.spec_from_file_location('w','/tool/image-inspector.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);m.enforce_limits();print(json.dumps([resource.getrlimit(k) for k in [resource.RLIMIT_AS,resource.RLIMIT_CPU,resource.RLIMIT_FSIZE,resource.RLIMIT_CORE,resource.RLIMIT_NOFILE,resource.RLIMIT_NPROC]]))"
        result = subprocess.run([sys.executable, "-c", code], env=ENV, capture_output=True, timeout=5, check=True)
        self.assertEqual(json.loads(result.stdout), [[268435456, 268435456], [2, 3], [0, 0], [0, 0], [32, 32], [1, 1]])

    def test_address_space_cap_rejects_large_allocation(self):
        code = "import importlib.util; s=importlib.util.spec_from_file_location('w','/tool/image-inspector.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);m.enforce_limits();\ntry: x=bytearray(300*1024*1024)\nexcept MemoryError: print('bounded')"
        result = subprocess.run([sys.executable, "-c", code], env=ENV, capture_output=True, timeout=5)
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout.strip(), b"bounded")

    def test_cpu_cap_terminates_disposable_busy_process(self):
        code = "import importlib.util; s=importlib.util.spec_from_file_location('w','/tool/image-inspector.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);m.enforce_limits();\nwhile True: pass"
        result = subprocess.run([sys.executable, "-c", code], env=ENV, capture_output=True, timeout=6)
        self.assertIn(result.returncode, [-signal.SIGXCPU, -signal.SIGKILL])
        self.assertEqual(result.stdout, b"")

    def test_wall_deadline_rejects_a_stalled_input_stream(self):
        process = subprocess.Popen([sys.executable, str(WORKER), "--mime", "image/png"], stdin=subprocess.PIPE,
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=ENV)
        try:
            process.wait(timeout=6)
            self.assertEqual(process.returncode, 3)
            self.assertEqual(json.loads(process.stdout.read()), {"ok": False, "code": "image_inspection_timeout"})
            self.assertEqual(process.stderr.read(), b"")
        finally:
            if process.poll() is None:
                process.kill()
            process.communicate(timeout=2)

    def test_os_sandbox_read_only_source_and_no_external_network(self):
        self.assertNotEqual(os.geteuid(), 0)
        with self.assertRaises(OSError):
            Path("/tool/forbidden-write").write_bytes(b"synthetic")
        with socket.socket() as connection:
            connection.settimeout(0.2)
            with self.assertRaises(OSError):
                connection.connect(("1.1.1.1", 443))


if __name__ == "__main__":
    unittest.main(verbosity=2)
