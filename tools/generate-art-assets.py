#!/usr/bin/env python3
"""Generate responsive artwork and keep the service-worker list in sync."""

from __future__ import annotations

import argparse
import io
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ART_DIR = ROOT / 'art'
SW_PATH = ROOT / 'sw.js'
ART_BLOCK = re.compile(r'const ART = \[\r?\n[\s\S]*?\r?\n\];')
CACHE_VERSION = re.compile(r"const CACHE = 'talkboard-v(\d+)';")


def source_images() -> list[Path]:
    return sorted(path for path in ART_DIR.glob('*.webp') if not path.stem.lower().endswith('-128'))


def art_declaration(images: list[Path]) -> str:
    entries = ',\n'.join(f"  './art/{image.name}'" for image in images)
    return f'const ART = [\n{entries}\n];'


def check_assets(sw: str, images: list[Path]) -> None:
    variants = {path.name for path in ART_DIR.glob('*-128.webp')}
    expected = {image.stem + '-128.webp' for image in images}
    missing = sorted(expected - variants)
    orphaned = sorted(variants - expected)
    match = ART_BLOCK.search(sw)
    if not match:
        raise SystemExit('sw.js does not contain the expected ART list.')
    expected_declaration = art_declaration(images)
    if missing or orphaned or match.group(0) != expected_declaration:
        raise SystemExit(f'Asset check failed: missing variants={missing}, orphan variants={orphaned}, service-worker list in sync={match.group(0) == expected_declaration}')
    print(f'Asset check passed: {len(images)} originals, {len(expected)} responsive variants, service-worker list in sync.')


def generate_variants(images: list[Path]) -> tuple[bool, int]:
    try:
        from PIL import Image
    except ImportError as error:
        raise SystemExit('Pillow is required. Install it with: python -m pip install -r tools/requirements-art.txt') from error

    changed = False
    updated = 0
    for source in images:
        output = io.BytesIO()
        with Image.open(source) as image:
            image.thumbnail((128, 128), Image.Resampling.LANCZOS)
            image.save(output, 'WEBP', quality=84, method=6)
        target = source.with_name(source.stem + '-128.webp')
        data = output.getvalue()
        if not target.exists() or target.read_bytes() != data or source.stat().st_mtime_ns > target.stat().st_mtime_ns:
            target.write_bytes(data)
            changed = True
            updated += 1

    expected = {image.stem + '-128.webp' for image in images}
    for orphan in ART_DIR.glob('*-128.webp'):
        if orphan.name not in expected:
            orphan.unlink()
            changed = True
    return changed, updated


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='check source/variant/service-worker consistency without modifying files')
    args = parser.parse_args()

    images = source_images()
    if not images:
        raise SystemExit(f'No source WebP images found in {ART_DIR}')
    sw = SW_PATH.read_text(encoding='utf-8')
    if args.check:
        check_assets(sw, images)
        return

    changed, updated = generate_variants(images)
    expected_declaration = art_declaration(images)
    match = ART_BLOCK.search(sw)
    if not match:
        raise SystemExit('sw.js does not contain the expected ART list.')
    if match.group(0) != expected_declaration:
        sw = sw[:match.start()] + expected_declaration + sw[match.end():]
        changed = True

    if changed:
        version_match = CACHE_VERSION.search(sw)
        if not version_match:
            raise SystemExit('sw.js does not contain a versioned TalkBoard cache name.')
        current = int(version_match.group(1))
        sw = sw[:version_match.start()] + f"const CACHE = 'talkboard-v{current + 1}';" + sw[version_match.end():]
        SW_PATH.write_text(sw, encoding='utf-8')
        print(f'Updated artwork and service-worker cache to talkboard-v{current + 1}.')
    else:
        print('Artwork is already current; service-worker cache version unchanged.')
    print(f'Generated or refreshed {updated} responsive artwork variant(s).')
    check_assets(sw if changed else SW_PATH.read_text(encoding='utf-8'), images)


if __name__ == '__main__':
    main()
