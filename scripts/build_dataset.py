#!/usr/bin/env python3

import json
import re
import shutil
from html import unescape
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
EXPORT_XML = ROOT / "tmp_baboons_export" / "BaboonsEars.xml"
EXPORT_BLOBS = ROOT / "tmp_baboons_export" / "blobs"
DATA_DIR = ROOT / "data"
IMAGES_DIR = ROOT / "images"


CARD_RE = re.compile(r"<card>(.*?)</card>")
TEXT_RE = re.compile(r"<text name='([^']+)'>(.*?)</text>")
IMAGE_RE = re.compile(r"<img name='([^']+)'>\s*(?:<img id=\"([^\"]+)\" type=\"([^\"]+)\" ?/>)?\s*</img>")


def slugify(value: str) -> str:
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-") or "card"


def parse_label(title: str) -> dict:
    if ":" in title:
        header, subject = title.split(":", 1)
        subject = subject.strip()
    else:
        header, subject = title, title

    parts = [part.strip() for part in header.split("_") if part.strip()]
    troop = parts[0] if parts else "Unknown"
    age_sex = " ".join(parts[1:]) if len(parts) > 1 else header.strip()

    return {
        "troop": troop,
        "ageSex": age_sex or "Unknown",
        "subject": subject,
    }


def parse_xml(text: str) -> list[dict]:
    cards = []

    for index, raw_card in enumerate(CARD_RE.findall(text), start=1):
        fields = {name: unescape(value).strip() for name, value in TEXT_RE.findall(raw_card)}
        images = {name: {"id": blob_id, "type": blob_type} for name, blob_id, blob_type in IMAGE_RE.findall(raw_card)}

        title = fields.get("Texte", f"Card {index}")
        subtitle = fields.get("Texte sous l'image", "")
        hint = fields.get("Texte2", "")

        label = parse_label(title)
        card_id = f"{index:03d}-{slugify(label['subject'])}"

        image_entries = []
        for slot in ("Image", "Image2"):
            image_meta = images.get(slot)
            if not image_meta or not image_meta["id"]:
                continue

            source = EXPORT_BLOBS / image_meta["id"]
            ext = (image_meta["type"] or "png").lower()
            target_name = f"{card_id}-{slot.lower()}.{ext}"
            target = IMAGES_DIR / target_name
            shutil.copy2(source, target)

            image_entries.append(
                {
                    "slot": slot.lower(),
                    "src": f"images/{target_name}",
                    "blobId": image_meta["id"],
                }
            )

        cards.append(
            {
                "id": card_id,
                "index": index,
                "title": title,
                "subtitle": subtitle,
                "hint": hint,
                "troop": label["troop"],
                "ageSex": label["ageSex"],
                "subject": label["subject"],
                "images": image_entries,
            }
        )

    return cards


def main() -> None:
    if not EXPORT_XML.exists():
        raise SystemExit(f"Missing export file: {EXPORT_XML}")

    DATA_DIR.mkdir(exist_ok=True)
    if IMAGES_DIR.exists():
        shutil.rmtree(IMAGES_DIR)
    IMAGES_DIR.mkdir(exist_ok=True)

    text = EXPORT_XML.read_text(encoding="utf-8")
    cards = parse_xml(text)

    payload = {
        "deckName": "Baboons Ears",
        "cardCount": len(cards),
        "generatedFrom": str(EXPORT_XML.name),
        "cards": cards,
    }

    (DATA_DIR / "individuals.json").write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    print(f"Built {len(cards)} cards and copied {sum(len(card['images']) for card in cards)} images.")


if __name__ == "__main__":
    main()
