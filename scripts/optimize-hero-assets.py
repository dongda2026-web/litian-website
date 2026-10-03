from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
IMG_DIR = ROOT / "assets" / "img"
SOURCE = IMG_DIR / "litian-product-series-hero-20260722.png"
DESKTOP_WEBP = IMG_DIR / "litian-product-series-hero-20260722.webp"
MOBILE_WEBP = IMG_DIR / "litian-product-series-hero-20260722-mobile.webp"


def save_webp(image: Image.Image, path: Path, quality: int = 82) -> None:
    image.save(path, "WEBP", quality=quality, method=6)


def main() -> None:
    src = Image.open(SOURCE).convert("RGB")
    save_webp(src, DESKTOP_WEBP)

    target_ratio = 390 / 644
    crop_h = src.height
    crop_w = round(crop_h * target_ratio)
    center_x = round(src.width * 0.43)
    left = max(0, min(src.width - crop_w, center_x - crop_w // 2))
    mobile_crop = src.crop((left, 0, left + crop_w, crop_h))
    mobile = mobile_crop.resize((780, round(780 / target_ratio)), Image.Resampling.LANCZOS)
    save_webp(mobile, MOBILE_WEBP, quality=80)

    print(f"Wrote {DESKTOP_WEBP}")
    print(f"Wrote {MOBILE_WEBP}")


if __name__ == "__main__":
    main()
