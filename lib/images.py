"""Photo handling: fix phone rotation, resize, make thumbnails."""
import io

from PIL import Image, ImageOps

try:  # Samsung/iPhone HEIC photos
    from pillow_heif import register_heif_opener

    register_heif_opener()
except Exception:  # pragma: no cover
    pass

FULL_SIZE = 2000   # long edge, pixels — sharp enough to zoom into fabric
THUMB_SIZE = 480   # grid thumbnails
AI_SIZE = 1280     # what we send to the AI for tagging


def open_image(data: bytes) -> Image.Image:
    img = Image.open(io.BytesIO(data))
    img = ImageOps.exif_transpose(img)  # phones store rotation separately
    if img.mode not in ("RGB", "L"):
        bg = Image.new("RGB", img.size, (255, 255, 255))
        if img.mode in ("RGBA", "LA", "P"):
            img = img.convert("RGBA")
            bg.paste(img, mask=img.split()[-1])
            img = bg
        else:
            img = img.convert("RGB")
    elif img.mode == "L":
        img = img.convert("RGB")
    return img


def _fit(img: Image.Image, long_edge: int) -> Image.Image:
    img = img.copy()
    img.thumbnail((long_edge, long_edge), Image.LANCZOS)
    return img


def to_jpeg(img: Image.Image, long_edge: int, quality: int = 88) -> bytes:
    out = io.BytesIO()
    _fit(img, long_edge).save(out, format="JPEG", quality=quality, optimize=True, progressive=True)
    return out.getvalue()


def prepare(data: bytes) -> dict:
    """Returns full, thumbnail and AI-sized JPEG bytes for one upload."""
    img = open_image(data)
    return {
        "full": to_jpeg(img, FULL_SIZE, 90),
        "thumb": to_jpeg(img, THUMB_SIZE, 82),
        "ai": to_jpeg(img, AI_SIZE, 85),
    }
