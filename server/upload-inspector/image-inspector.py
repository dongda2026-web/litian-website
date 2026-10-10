"""Single-job private image inspection; the caller must supply an OS sandbox."""

import hashlib
import io
import json
import os
import resource
import signal
import struct
import sys
import warnings
import zlib

MAX_BYTES = 5 * 1024 * 1024
MAX_PIXELS = 16_000_000
MAX_DIMENSION = 8192
MAX_SEGMENTS = 4096
MAX_METADATA_BYTES = 512 * 1024
MAX_INFLATED_BYTES = MAX_PIXELS * 8 + MAX_DIMENSION * 8
POLICY = "private-image-v1-pillow"
DECODER_VERSION = "12.3.0"
MIMES = {"image/png": "PNG", "image/jpeg": "JPEG"}


class InspectionError(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.code = code


def require(condition, code="image_content_not_allowed"):
    if not condition:
        raise InspectionError(code)


def enforce_limits():
    require(sys.platform == "linux" and os.geteuid() != 0, "image_inspection_unavailable")
    try:
        for kind, limits in [
            (resource.RLIMIT_AS, (256 * 1024 * 1024,) * 2),
            (resource.RLIMIT_CPU, (2, 3)),
            (resource.RLIMIT_FSIZE, (0, 0)),
            (resource.RLIMIT_CORE, (0, 0)),
            (resource.RLIMIT_NOFILE, (32, 32)),
            (resource.RLIMIT_NPROC, (1, 1)),
        ]:
            resource.setrlimit(kind, limits)
    except (OSError, ValueError):
        raise InspectionError("image_inspection_unavailable") from None


def check_png_envelope(data):
    require(data[:8] == b"\x89PNG\r\n\x1a\n")
    offset, segments, metadata = 8, 0, 0
    seen_idat, closed_idat = False, False
    pixel_chunks = []
    while offset + 12 <= len(data):
        length = struct.unpack_from(">I", data, offset)[0]
        kind = data[offset + 4:offset + 8]
        end = offset + 12 + length
        segments += 1
        require(segments <= MAX_SEGMENTS, "image_complexity_limit")
        require(end <= len(data) and all(65 <= byte <= 90 or 97 <= byte <= 122 for byte in kind))
        require(not kind[2] & 32)
        require(zlib.crc32(data[offset + 4:end - 4]) == struct.unpack_from(">I", data, end - 4)[0])
        if segments == 1:
            require(kind == b"IHDR" and length == 13)
        else:
            require(kind != b"IHDR")
        require(kind not in {b"acTL", b"fcTL", b"fdAT"})
        require(kind in {b"IHDR", b"PLTE", b"IDAT", b"IEND"} or bool(kind[0] & 32))
        if kind == b"IDAT":
            require(not closed_idat)
            seen_idat = True
            pixel_chunks.append(memoryview(data)[offset + 8:end - 4])
        elif seen_idat:
            closed_idat = True
        if kind != b"IDAT":
            metadata += length
            require(metadata <= MAX_METADATA_BYTES, "image_complexity_limit")
        if kind == b"IEND":
            require(length == 0 and seen_idat and end == len(data))
            check_png_compressed_stream(pixel_chunks)
            return
        offset = end
    raise InspectionError("image_content_not_allowed")


def check_png_compressed_stream(chunks):
    decoder, expanded = zlib.decompressobj(), 0
    for pending in chunks:
        if not pending:
            continue
        require(not decoder.eof)
        while pending:
            output = decoder.decompress(pending, 64 * 1024)
            expanded += len(output)
            require(expanded <= MAX_INFLATED_BYTES, "image_complexity_limit")
            require(not decoder.unused_data)
            pending = decoder.unconsumed_tail
    require(decoder.eof and not decoder.unused_data)


def check_jpeg_envelope(data):
    require(data[:2] == b"\xff\xd8")
    offset, segments, metadata, frames, scans = 2, 0, 0, 0, 0
    in_scan = False
    while offset < len(data):
        if in_scan:
            next_marker = data.find(b"\xff", offset)
            require(next_marker >= 0)
            offset = next_marker
        require(data[offset] == 255)
        while offset < len(data) and data[offset] == 255:
            offset += 1
        require(offset < len(data))
        marker = data[offset]
        offset += 1
        if in_scan and (marker == 0 or 0xD0 <= marker <= 0xD7):
            continue
        in_scan = False
        segments += 1
        require(segments <= MAX_SEGMENTS, "image_complexity_limit")
        if marker == 0xD9:
            require(frames == 1 and scans > 0 and offset == len(data))
            return
        require(marker not in {0, 0xD8, 0x01} and not 0xD0 <= marker <= 0xD7)
        require(offset + 2 <= len(data))
        length = struct.unpack_from(">H", data, offset)[0]
        require(length >= 2 and offset + length <= len(data))
        if 0xE0 <= marker <= 0xEF or marker == 0xFE:
            metadata += length - 2
            require(metadata <= MAX_METADATA_BYTES, "image_complexity_limit")
        elif marker in {0xC0, 0xC1, 0xC2}:
            frames += 1
            require(frames == 1)
        else:
            require(marker in {0xC4, 0xDA, 0xDB, 0xDD})
        if marker == 0xDA:
            require(frames == 1)
            scans += 1
            in_scan = True
        offset += length
    raise InspectionError("image_content_not_allowed")


def inspect_image(data, mime_type):
    require(mime_type in MIMES, "image_type_not_allowed")
    require(isinstance(data, bytes) and 0 < len(data) <= MAX_BYTES, "image_size_not_allowed")
    from PIL import Image, ImageFile, PngImagePlugin, __version__
    require(__version__ == DECODER_VERSION, "image_inspection_unavailable")
    Image.MAX_IMAGE_PIXELS = MAX_PIXELS
    ImageFile.LOAD_TRUNCATED_IMAGES = False
    PngImagePlugin.MAX_TEXT_CHUNK = 64 * 1024
    PngImagePlugin.MAX_TEXT_MEMORY = MAX_METADATA_BYTES
    (check_png_envelope if mime_type == "image/png" else check_jpeg_envelope)(data)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data), formats=[MIMES[mime_type]]) as image:
                width, height = image.size
                require(0 < width <= MAX_DIMENSION and 0 < height <= MAX_DIMENSION and width * height <= MAX_PIXELS, "image_complexity_limit")
                require(image.format == MIMES[mime_type] and getattr(image, "n_frames", 1) == 1)
                image.verify()
            # verify() does not decode the pixel stream; reopen the same immutable bytes and load fully.
            with Image.open(io.BytesIO(data), formats=[MIMES[mime_type]]) as image:
                image.load()
                require(image.size == (width, height) and getattr(image, "n_frames", 1) == 1)
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise InspectionError("image_complexity_limit") from None
    return {"ok": True, "policy": POLICY, "decoder": "Pillow " + DECODER_VERSION,
            "mimeType": mime_type, "size": len(data), "sha256": hashlib.sha256(data).hexdigest(),
            "width": width, "height": height, "frames": 1}


def main():
    code = 0
    try:
        enforce_limits()
        def deadline(_signal, _frame):
            raise InspectionError("image_inspection_timeout")
        signal.signal(signal.SIGALRM, deadline)
        signal.alarm(4)
        require(len(sys.argv) == 3 and sys.argv[1] == "--mime", "image_type_not_allowed")
        result = inspect_image(sys.stdin.buffer.read(MAX_BYTES + 1), sys.argv[2])
    except InspectionError as error:
        result = {"ok": False, "code": error.code}
        code = 3 if error.code in {"image_inspection_unavailable", "image_inspection_timeout"} else 2
    except (MemoryError, OverflowError):
        result, code = {"ok": False, "code": "image_complexity_limit"}, 2
    except Exception:
        result, code = {"ok": False, "code": "image_content_not_allowed"}, 2
    finally:
        signal.alarm(0)
    sys.stdout.write(json.dumps(result, separators=(",", ":")) + "\n")
    return code


if __name__ == "__main__":
    sys.exit(main())
