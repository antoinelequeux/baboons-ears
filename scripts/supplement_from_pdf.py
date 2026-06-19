#!/usr/bin/env python3

import json
import re
import shutil
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "data" / "individuals.json"
IMAGES_DIR = ROOT / "images"
PDF_PATH = Path("/Users/antoinelequeux/Downloads/Tsaobis IDs (5).pdf")
TMP_DIR = ROOT / ".tmp_pdf_extract"
TEXT_PATH = TMP_DIR / "tsaobis_ids.txt"


HEADERS = {"name", "right ear", "left ear", "mother", "right ear", "right ear"}
CATEGORY_RE = re.compile(r"^(ADULT|JUVENILE|SUB ?ADULT)\s+", re.I)


def normalize(value: str) -> str:
    return re.sub(r"\s+", "", value).lower()


def run_exports() -> tuple[dict[int, list[Path]], list[str]]:
    TMP_DIR.mkdir(exist_ok=True)

    subprocess.run(["pdftotext", str(PDF_PATH), str(TEXT_PATH)], check=True)
    subprocess.run(["pdfimages", "-all", str(PDF_PATH), str(TMP_DIR / "extract")], check=True)

    list_output = subprocess.check_output(["pdfimages", "-list", str(PDF_PATH)], text=True)
    all_files = sorted(TMP_DIR.glob("extract-*"))
    by_page: dict[int, list[Path]] = {}
    file_index = 0

    for line in list_output.splitlines()[2:]:
        parts = line.split()
        if not parts or not parts[0].isdigit():
            continue
        page = int(parts[0])
        if file_index >= len(all_files):
            break
        by_page.setdefault(page, []).append(all_files[file_index])
        file_index += 1

    pages = TEXT_PATH.read_text(errors="ignore").split("\f")
    return by_page, pages


def parse_rows(page_text: str) -> list[dict]:
    lines = [line.strip() for line in page_text.splitlines() if line.strip()]
    lines = [line for line in lines if line.lower() not in HEADERS]

    rows = []
    index = 0
    while index < len(lines):
        line = lines[index]
        if CATEGORY_RE.match(line):
            rows.append({"type": "category", "label": line})
            index += 1
            continue

        mother = ""
        if index + 1 < len(lines) and not CATEGORY_RE.match(lines[index + 1]):
            mother = lines[index + 1]
            index += 2
        else:
            index += 1

        rows.append({"type": "entry", "name": line, "mother": mother})

    return rows


def build_row_image_map(rows: list[dict], page_images: list[Path]) -> dict[str, list[Path]]:
    entry_names = [row["name"] for row in rows if row["type"] == "entry"]
    result: dict[str, list[Path]] = {}

    if not page_images:
        return result

    if len(page_images) % 2 == 0:
        with_images = len(page_images) // 2
        image_index = 0
        for name in entry_names[:with_images]:
            result[name] = [page_images[image_index], page_images[image_index + 1]]
            image_index += 2
        return result

    # Page 20 is the only odd-image case in this PDF section we need for missing cards.
    if entry_names == ["Eczema inf24", "Mumps inf24", "Sarcomainf24", "Gout"]:
        result["Sarcomainf24"] = [page_images[0]]
        result["Gout"] = [page_images[1], page_images[2]]
        return result

    return result


def ensure_slots(card: dict, source_images: list[Path]) -> bool:
    changed = False
    current_slots = [image["slot"] for image in card["images"]]

    for index, source_path in enumerate(source_images):
        slot = "image" if index == 0 else f"image{index + 1}"
        if slot in current_slots:
            continue

        target_name = f"{card['id']}-{slot}.jpg"
        target_path = IMAGES_DIR / target_name
        shutil.copy2(source_path, target_path)
        card["images"].append(
            {
                "slot": slot,
                "src": f"images/{target_name}",
                "blobId": f"pdf:{PDF_PATH.name}:{source_path.name}",
            }
        )
        changed = True

    card["images"] = sorted(card["images"], key=lambda image: image["slot"])
    return changed


def main() -> None:
    payload = json.loads(DATA_PATH.read_text())
    cards = payload["cards"]
    by_subject = {normalize(card["subject"]): card for card in cards}

    page_images, pages = run_exports()
    updated = []

    for page_number, page_text in enumerate(pages, start=1):
        rows = parse_rows(page_text)
        row_map = build_row_image_map(rows, page_images.get(page_number, []))
        for row_name, images in row_map.items():
            card = by_subject.get(normalize(row_name))
            if not card:
                continue
            if ensure_slots(card, images):
                updated.append(card["subject"])

    DATA_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    print(f"Updated {len(updated)} cards from PDF supplements.")
    if updated:
        print(", ".join(sorted(updated)))


if __name__ == "__main__":
    main()
