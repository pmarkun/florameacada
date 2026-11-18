#!/usr/bin/env python3
"""Index matched, openly licensed Deep Zoom sheets from the Reflora RB archive."""
import argparse
from collections import defaultdict
import csv
import io
import json
from pathlib import Path
import re
import unicodedata
from urllib.parse import parse_qs, urlsplit
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
HOST = "jbrj-public.s3-sa-east-1.amazonaws.com"
CC_BY = "https://creativecommons.org/licenses/by/4.0"
DZI_PATH = re.compile(r"DZI/rb/(?:[0-9]+/)+[0-9]+(?:[-_][0-9]+)?\.dzi")


def name_key(name):
    return " ".join(re.sub(r"[^\w ]", " ", unicodedata.normalize("NFKC", name).casefold()).split())


def catalogue_names():
    catalogue = json.loads((ROOT / "dist/catalogo.json").read_text())
    botany = json.loads((ROOT / "dist/botanica.json").read_text())["taxons"]
    names = defaultdict(set)
    for ident, name, *_ in catalogue:
        profile = botany.get(str(ident), {})
        for alias in (name, profile.get("nome"), *profile.get("sinonimos", [])):
            if alias:
                names[name_key(alias)].add(ident)
    return names, botany


def rows(archive, name):
    with archive.open(name + ".txt") as file:
        yield from csv.DictReader(io.TextIOWrapper(file, encoding="utf-8-sig"), delimiter="\t")


def media_entry(row, specimen):
    if row["format"].lower() != "dzi" or CC_BY not in row["license"]:
        return None
    identifier = row["identifier"]
    url = urlsplit(identifier if "://" in identifier else "https://" + identifier)
    path = parse_qs(url.query).get("source", [""])[0]
    figure_id = parse_qs(urlsplit(row["references"]).query).get("idFigura", [""])[0]
    if url.hostname != HOST or not DZI_PATH.fullmatch(path) or not figure_id.isdigit():
        return None
    _, _, barcode, _ = specimen
    return [path.removeprefix("DZI/rb/").removesuffix(".dzi"), barcode, figure_id]


def index(archive):
    lookup, botany = catalogue_names()
    specimens = {}
    for row in rows(archive, "occurrence"):
        name, author = row["scientificName"].strip(), row["scientificNameAuthorship"].strip()
        if author and name.endswith(" " + author):
            name = name[:-(len(author) + 1)]
        identities = lookup.get(name_key(name), set())
        if len(identities) == 1 and not row["identificationQualifier"].strip():
            ident = next(iter(identities))
            specimens[row["id"]] = (ident, name, row["catalogNumber"], row["typeStatus"])
    candidates = {}
    for row in rows(archive, "multimedia"):
        specimen = specimens.get(row["id"])
        if not specimen:
            continue
        entry = media_entry(row, specimen)
        if not entry:
            continue
        ident, name, barcode, type_status = specimen
        accepted = botany.get(str(ident), {}).get("nome", name)
        priority = (name_key(name) != name_key(accepted), not bool(type_status), barcode, entry[0])
        if ident not in candidates or priority < candidates[ident][0]:
            candidates[ident] = (priority, entry)
    return {ident: candidates[ident][1] for ident in sorted(candidates)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("--output", type=Path, default=ROOT / "dist/reflora-rb.json")
    args = parser.parse_args()
    with ZipFile(args.archive) as archive:
        data = index(archive)
    if not data:
        raise ValueError("O arquivo não retornou nenhum registro com URL e licença elegíveis.")
    args.output.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"{len(data)} fichas com uma exsicata indexada do Herbário RB.")


if __name__ == "__main__":
    main()
