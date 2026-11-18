"""Build the guide's public botanical fields using the JBRJ Darwin Core Archive."""

import argparse
from datetime import date
from hashlib import sha256
from collections import Counter, defaultdict
import csv
import io
import json
from pathlib import Path
import re
import tempfile
import unicodedata
from urllib.request import Request, urlopen
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = "https://ipt.jbrj.gov.br/jbrj/archive.do?r=lista_especies_flora_brasil"
DATASET = "https://doi.org/10.15468/1mtkaw"
RANKS = {"ESPECIE", "SUBESPECIE", "VARIEDADE", "FORMA", "SUBVARIEDADE", "SUBFORMA"}


def key(value):
    normalized = unicodedata.normalize("NFKD", value).casefold()
    clean = "".join(char for char in normalized if not unicodedata.combining(char))
    clean = clean.replace("\u00ad", "").replace(".", "")
    clean = re.sub(r"\b(ssp|subspecies)\b", "subsp", clean)
    return " ".join(clean.split())


def bare(row):
    scientific = row["scientificName"].strip()
    authors = row["scientificNameAuthorship"].strip()
    if authors and scientific.endswith(" " + authors):
        return scientific[: -(len(authors) + 1)]
    return scientific


def records(archive, filename):
    with archive.open(filename + ".txt") as source:
        yield from csv.DictReader(io.TextIOWrapper(source, encoding="utf-8-sig"),
                                  delimiter="\t", quoting=csv.QUOTE_NONE)


def unpack_fields(archive, taxon_ids):
    fields = {ident: defaultdict(set) for ident in taxon_ids}
    for row in records(archive, "vernacularname"):
        ident = row["id"]
        name = row["vernacularName"].strip()
        if ident in fields and name and row["language"] == "PORTUGUES":
            fields[ident]["popular"].add(name)
    for row in records(archive, "distribution"):
        ident = row["id"]
        if ident not in fields or row["countryCode"] != "BR":
            continue
        # Publish only native distribution, in the resolution of states and domains.
        if row["establishmentMeans"] != "Nativa":
            continue
        state = re.fullmatch(r"BR-([A-Z]{2})", row["locationID"])
        if state:
            fields[ident]["uf"].add(state[1])
        detail = json.loads(row["occurrenceRemarks"] or "{}")
        for domain in detail.get("phytogeographicDomain") or []:
            if domain:
                fields[ident]["dominios"].add(domain)
        endemism = detail.get("endemism")
        if endemism:
            fields[ident]["endemismo"].add(endemism)
    for row in records(archive, "speciesprofile"):
        ident = row["id"]
        if ident not in fields:
            continue
        profile = json.loads(row["lifeForm"] or "{}")
        for source, target in (("lifeForm", "habito"), ("habitat", "substrato"),
                               ("vegetationType", "vegetacao")):
            for value in profile.get(source) or []:
                if value:
                    fields[ident][target].add(value)
    return fields


def build(archive):
    catalogue = json.loads((ROOT / "dist/catalogo.json").read_text())
    taxa = {}
    index = defaultdict(set)
    synonyms = defaultdict(set)
    for row in records(archive, "taxon"):
        if row["kingdom"] != "Plantae" or row["taxonRank"] not in RANKS:
            continue
        ident = row["id"]
        accepted = row["acceptedNameUsageID"] or (ident if row["taxonomicStatus"] == "NOME_ACEITO" else "")
        if not accepted:
            continue
        taxa[ident] = row
        index[key(bare(row)), key(row["family"])].add(accepted)
        if accepted != ident:
            synonyms[accepted].add(bare(row))
    matched = {}
    outcomes = Counter()
    for ident, name, family, *_ in catalogue:
        candidates = index[key(name), key(family)]
        if len(candidates) != 1:
            outcomes["ambiguo" if candidates else "sem_correspondencia_exata"] += 1
            continue
        accepted = next(iter(candidates))
        if accepted not in taxa or taxa[accepted]["taxonomicStatus"] != "NOME_ACEITO":
            outcomes["sem_nome_aceito"] += 1
            continue
        matched[ident] = accepted

    if len(matched) < 0.85 * len(catalogue):
        raise ValueError("Cobertura abaixo de 85%. Examine a fonte e o relatório antes de substituir os dados.")

    fields = unpack_fields(archive, set(matched.values()))
    profiles = {}
    for ident, accepted in matched.items():
        row = taxa[accepted]
        profiles[ident] = {
            "id": accepted,
            "nome": bare(row),
            "autoria": row["scientificNameAuthorship"],
            "sinonimos": sorted(synonyms[accepted], key=key),
            **{field: sorted(values, key=key) for field, values in fields[accepted].items()},
        }
    # Validate a well-known join and the distribution before emitting the public package.
    pau_brasil = profiles[1705]
    assert pau_brasil["id"] == "602728" and "Mata Atlântica" in pau_brasil["dominios"]
    data = {
        "fonte": DATASET,
        "licenca": "https://creativecommons.org/licenses/by/4.0/",
        "edicao": date(*archive.getinfo("taxon.txt").date_time[:3]).isoformat(),
        "resumo": {"catalogo": len(catalogue), "vinculados": len(matched), **outcomes,
                   "com_nome_popular": sum(bool(p.get("popular")) for p in profiles.values()),
                   "com_distribuicao_uf": sum(bool(p.get("uf")) for p in profiles.values()),
                   "com_dominio": sum(bool(p.get("dominios")) for p in profiles.values())},
        "taxons": profiles,
    }
    out = ROOT / "dist/botanica.json"
    temp = out.with_suffix(".tmp")
    temp.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    temp.replace(out)
    worker = ROOT / "dist/sw.js"
    worker_code = worker.read_text()
    version = sha256(b"".join(
        file.read_bytes() for file in sorted(out.parent.iterdir())
        if file.is_file() and file != worker
    )).hexdigest()[:12]
    worker.write_text(re.sub(r"flora-2026-[a-f0-9]{12}", "flora-2026-" + version, worker_code))
    print(json.dumps(data["resumo"], ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, help="Usa um Darwin Core Archive já baixado.")
    args = parser.parse_args()
    if args.archive:
        with ZipFile(args.archive) as archive:
            build(archive)
        return
    request = Request(ARCHIVE, headers={"User-Agent": "GuiaFloraBrasil/1.0 (importacao de dados abertos)"})
    with tempfile.TemporaryFile() as snapshot:
        with urlopen(request, timeout=60) as source:
            while chunk := source.read(1024 * 1024):
                snapshot.write(chunk)
        with ZipFile(snapshot) as archive:
            build(archive)


if __name__ == "__main__":
    main()

