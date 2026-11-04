"""Describe closet items that were saved without an AI description."""
from concurrent.futures import ThreadPoolExecutor

from lib import ai, db, images

BATCH = 12
WORKERS = 4


def run_batch(items, style_names):
    """Describes up to BATCH items. Returns (ok_count, [(item_id, friendly_error), ...])."""
    # Fetch shared clients here, on the app's own thread (they're cached by Streamlit).
    client, bucket, sb = ai._client(), db._bucket(), db.client()

    def one(item):
        try:
            data = bucket.download(item["image_path"])
            jpeg = images.to_jpeg(images.open_image(data), images.AI_SIZE, 85)
            fields = ai.tag_item(jpeg, style_names, client=client)
            row = {k: v for k, v in fields.items() if k in db.ITEM_FIELDS}
            # keep anything she already filled in by hand
            for k in ("name", "notes", "brand", "size"):
                if (item.get(k) or "").strip() and item.get(k) != "New item":
                    row.pop(k, None)
            row["updated_at"] = db._now()
            sb.table("items").update(row).eq("id", item["id"]).execute()
            return item["id"], None
        except Exception as e:
            return item["id"], ai.friendly_error(e)

    with ThreadPoolExecutor(WORKERS) as pool:
        results = list(pool.map(one, items[:BATCH]))
    ok = sum(1 for _, err in results if err is None)
    return ok, [(i, err) for i, err in results if err]
