#!/usr/bin/env python3
"""Find openly licensed botanical plates and fallback images for the flora guide."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from urllib.error import HTTPError
from functools import lru_cache
from html import unescape
from pathlib import Path
from time import sleep
import json
import os
import re
from urllib.parse import urlencode, unquote, urlparse, urlsplit, urlunsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
AGENT = "FloraAmeacadaBrasil/1.0 (+https://flora-ameacada-2026.pmarkun.chatgpt.site/)"
MANIFEST = ROOT / "dist/pranchas.json"
LOOSE_TERMS = re.compile(r"\b(map|distribution|logo|stamp|fossil|cladogram|habitat|microscope|microscopy|dünnschliff|ai.generated|plaque|placa|envelope|wood sample|square blank)\b", re.I)
PLATE_TERMS = re.compile(
    r"\b(botanical illustration|illustration (?:of|from|by)|engraving|lithograph|gravura|"
    r"prancha botânica|ilustração botânica|botanical plate|botanische|flore des serres|"
    r"curtis.s botanical|flore médicale|köhler|brasiliana iconográfica|historia naturalis palmarum)\b", re.I
)
SPECIMEN_TERMS = re.compile(r"herbarium|exsicc|isotype|holotype|espécime|specimen sheet", re.I)
LICENSE = re.compile(r"^(cc0|pdm|cc-by(?:-sa)?)(?:[- ]([1-4]\.[05]))?$", re.I)


@dataclass(frozen=True)
class Image:
    kind: str
    source: str
    match: str
    image: str
    page: str
    credit: str
    license: str
    license_url: str


def plain(value):
    return " ".join(unescape(re.sub(r"<[^>]+>", " ", str(value or ""))).split())


def taxon_key(name):
    return re.sub(r"[\W_]+", " ", name.casefold()).strip()


def contains_name(value, name):
    return bool(re.search(r"\b" + re.escape(taxon_key(name)) + r"\b(?! (?:subsp|ssp|var|forma|f) )", taxon_key(plain(value))))


def https(value):
    if not isinstance(value, str) or not value.startswith("https://"):
        return ""
    url = urlparse(value)
    if not url.hostname or url.username or url.password:
        return ""
    return value


def rights(value, version=""):
    normalized = (value or "").strip().lower()
    link = re.fullmatch(r"https?://creativecommons\.org/(licenses/(by(?:-sa)?)/([1-4]\.[05])|publicdomain/(zero|mark)/1\.0)/?", normalized)
    if link:
        if link[4] == "zero":
            return "CC0", "https://creativecommons.org/publicdomain/zero/1.0/"
        if link[4] == "mark":
            return "Domínio público", "https://creativecommons.org/publicdomain/mark/1.0/"
        return "CC " + link[2].upper() + " " + link[3], "https://creativecommons.org/licenses/" + link[2] + "/" + link[3] + "/"
    normalized = normalized.replace(" ", "-")
    normalized = {"public-domain":"pdm", "cc-zero":"cc0", "pd":"pdm"}.get(normalized,normalized)
    match = LICENSE.fullmatch(normalized)
    if not match:
        return None
    code = match[1]
    ver = match[2] or version
    if code in {"cc0","pdm"}:
        return rights("https://creativecommons.org/publicdomain/" + ("zero" if code == "cc0" else "mark") + "/1.0/")
    if re.fullmatch(r"[1-4]\.[05]", ver):
        return rights("https://creativecommons.org/licenses/" + code[3:] + "/" + ver + "/")
    return None


def candidate(kind, source, match, url, page, credit, terms):
    url, page, credit = https(url), https(page), plain(credit)
    if not (url and page and credit and terms):
        return None
    return Image(kind,source,match,url,page,credit,*terms)


@lru_cache(maxsize=4096)
def get(endpoint, **params):
    url = endpoint + "?" + urlencode(params,doseq=True)
    request = Request(url,headers={"User-Agent":AGENT,"Accept":"application/json"})
    with urlopen(request,timeout=7) as response:
        return json.load(response)


def commons(name):
    payload = get("https://commons.wikimedia.org/w/api.php", action="query", format="json",
        generator="search", gsrnamespace=6, gsrsearch='intitle:"' + name + '"', gsrlimit=12,
        prop="imageinfo", iiprop="url|mime|size|extmetadata", iiurlwidth=1000)
    if payload.get("error"):
        raise ValueError("MediaWiki retornou erro")
    for page in payload.get("query",{}).get("pages",{}).values():
        info = next(iter(page.get("imageinfo",[])),{})
        meta = info.get("extmetadata",{})
        field = lambda key: meta.get(key,{}).get("value","")
        title = page.get("title","")
        if not contains_name(title,name) or LOOSE_TERMS.search(taxon_key(unquote(title))):
            continue
        if info.get("mime") not in {"image/jpeg","image/png","image/webp","image/tiff"}:
            continue
        if max(info.get("width",0), info.get("height",0)) < 450:
            continue
        context = " ".join(plain(v) for v in (title,field("ImageDescription"),field("Credit")))
        kind = "herbario" if SPECIMEN_TERMS.search(context) else "gravura" if PLATE_TERMS.search(context) else "foto"
        terms = rights(field("LicenseUrl")) or rights(field("LicenseShortName"))
        source = "BHL via Wikimedia Commons" if re.search(r"biodiversity heritage library",context + field("Categories"),re.I) else "Wikimedia Commons"
        url = urlsplit(info.get("thumburl") or info.get("url") or "")
        image = urlunsplit(url._replace(query="")) if url.hostname in {"thumb.wikimedia.org","upload.wikimedia.org"} else url.geturl()
        credit = field("Artist") or field("Attribution") or field("Credit")
        if plain(credit).casefold() in {"unknown","desconhecido","unknown author"}:
            credit = "Autoria desconhecida"
        yield candidate(kind, source, name, image, info.get("descriptionurl"), credit, terms)


def openverse(name):
    payload = get("https://api.openverse.org/v1/images/", q=name, page_size=15,
                  license="cc0,pdm,by,by-sa", size="medium")
    if "results" not in payload:
        raise ValueError("Openverse indisponível")
    for row in payload["results"]:
        title = row.get("title") or ""
        if not contains_name(title,name) or LOOSE_TERMS.search(taxon_key(unquote(title))):
            continue
        context = " ".join([title, row.get("creator") or "", row.get("provider") or ""])
        kind = "herbario" if SPECIMEN_TERMS.search(context) else "gravura" if PLATE_TERMS.search(context) else "foto"
        yield candidate(kind,"Openverse · " + plain(row.get("source")),name,row.get("thumbnail") or row.get("url"),
                        row.get("foreign_landing_url"),row.get("creator"),rights(row.get("license_url")))


def inaturalist(name):
    taxa = get("https://api.inaturalist.org/v1/taxa", q=name, per_page=10)["results"]
    exact = [row for row in taxa if taxon_key(row["name"]) == taxon_key(name)]
    if len(exact) != 1:
        return
    taxon_id = exact[0]["id"]
    rows = get("https://api.inaturalist.org/v1/observations", taxon_id=taxon_id, photos="true",
              quality_grade="research", photo_license="cc0,cc-by,cc-by-sa", per_page=10)["results"]
    for row in rows:
        if (row.get("taxon") or {}).get("id") != taxon_id or row.get("captive"):
            continue
        for photo in row.get("photos",[]):
            url = re.sub(r"/square(?=\.[a-zA-Z]+(?:\?|$))","/medium",photo.get("url") or "")
            yield candidate("foto","iNaturalist", name,url,f"https://www.inaturalist.org/observations/{row['id']}",
                            photo.get("attribution"),rights(photo.get("license_code"),"4.0"))


GBIF_COLLECTIONS = {
    "7a3679ef-5582-4aaa-81f0-8c2545cafc81": "Pl@ntNet via GBIF",
    "4300f8d5-1ae5-49e5-a101-63894b005868": "Herbário RB via GBIF",
    "e6694e54-1cd6-4527-a26e-387518ea550a": "Reflora · Herbário RBR via GBIF",
    "f9768501-2d57-4b8b-90a9-3ba5cf6dad3e": "Reflora · Herbário do Museu Nacional via GBIF",
}


def gbif(name, dataset_keys=()):
    match = get("https://api.gbif.org/v1/species/match", name=name, kingdom="Plantae", strict="true")
    if match.get("matchType") != "EXACT" or taxon_key(match.get("canonicalName","")) != taxon_key(name):
        return
    rows = get("https://api.gbif.org/v1/occurrence/search", taxon_key=match["usageKey"],
               media_type="StillImage", limit=18, dataset_key=dataset_keys)["results"]
    for row in rows:
        if taxon_key(row.get("acceptedScientificName","")) != taxon_key(name) and (
            not contains_name(row.get("scientificName",""),name) or
            row.get("taxonRank") != match.get("rank")
        ):
            continue
        basis = row.get("basisOfRecord")
        kind = "herbario" if basis in {"PRESERVED_SPECIMEN","MATERIAL_SAMPLE"} else "foto"
        for media in row.get("media",[]):
            if media.get("type") != "StillImage":
                continue
            credit = media.get("creator") or media.get("rightsHolder") or media.get("publisher")
            source = GBIF_COLLECTIONS.get(row.get("datasetKey")) or "GBIF · " + (row.get("institutionCode") or "acervo de ocorrências")
            yield candidate(kind,source,name,
                            media.get("identifier"),f"https://www.gbif.org/occurrence/{row['key']}",
                            credit,rights(media.get("license")))


def collections(name):
    return gbif(name, tuple(GBIF_COLLECTIONS))


def smithsonian(name):
    key = os.environ.get("SMITHSONIAN_API_KEY")
    if not key:
        raise ValueError("Chave do Smithsonian ausente")
    rows = get("https://api.si.edu/openaccess/api/v1.0/search", api_key=key,
               q='"' + name + '" AND online_media_type:Images', rows=20)["response"]["rows"]
    for row in rows:
        if not contains_name(row.get("title",""),name):
            continue
        metadata = row["content"]["descriptiveNonRepeating"]
        page = metadata.get("record_link") or metadata.get("guid") or ""
        if page.startswith("http://n2t.net/"):
            page = page.replace("http://","https://",1)
        kind = "herbario" if row.get("unitCode") == "NMNHBOTANY" else "foto"
        for media in metadata.get("online_media",{}).get("media",[]):
            if media.get("type") != "Images" or media.get("usage",{}).get("access") != "CC0":
                continue
            yield candidate(kind,"Smithsonian Open Access",name,media.get("thumbnail") or media.get("content"),
                            page,metadata.get("data_source") or "Smithsonian Institution",rights("cc0"))


PROVIDERS = {"commons":commons,"openverse":openverse,"inat":inaturalist,"gbif":gbif,"collections":collections,"smithsonian":smithsonian}
PRIORITY = {"gravura":0,"foto":1,"herbario":2}


def source_id(source):
    if source == "Herbário do Kew":
        return "kew-curated"
    if "Commons" in source:
        return "commons"
    if source.startswith("Openverse"):
        return "openverse"
    if source == "iNaturalist":
        return "inat"
    if source == "Smithsonian Open Access":
        return "smithsonian"
    return "gbif"


def search(names, sources, previous, unavailable):
    found, errors = {}, set()
    with ThreadPoolExecutor(max_workers=min(4,len(sources))) as pool:
        for index, name in enumerate(names):
            if index and any(media.kind == "gravura" for media in found.values()):
                break
            allowed = [
                provider for provider in sources
                if provider not in unavailable and (not found or provider in {"commons","openverse"})
            ]
            futures = {provider:pool.submit(lambda fn: list(fn(name)),PROVIDERS[provider]) for provider in allowed}
            for provider, result in futures.items():
                try:
                    for media in result.result():
                        if media:
                            found.setdefault((media.page,media.image.split("?")[0]),media)
                except HTTPError as exc:
                    errors.add(f"{provider}: HTTP {exc.code}")
                    if exc.code == 429 or (exc.code == 403 and provider == "openverse"):
                        unavailable.add(provider)
                except (OSError, ValueError, KeyError) as exc:
                    errors.add(f"{provider}: {type(exc).__name__}")
    errors.update(f"{provider}: indisponível nesta execução" for provider in unavailable)
    # Preserve prior records only when their source could not be refreshed.
    failed = {error.split(":",1)[0] for error in errors}
    for item in previous:
        media = Image(**item)
        provider = source_id(media.source)
        if provider == "gbif" and "collections" in sources and "gbif" not in sources:
            provider = "collections"
        if provider not in sources or provider in failed:
            found.setdefault((media.page,media.image.split("?")[0]),media)
    eligible = (item for item in found.values() if not (
        source_id(item.source) == "commons" and LOOSE_TERMS.search(taxon_key(unquote(item.page)))
    ))
    ordered = sorted(eligible,key=lambda item:(PRIORITY[item.kind],"Commons" not in item.source))
    return [asdict(item) for item in ordered[:8]], sorted(errors)


def read(path, fallback):
    return json.loads(path.read_text()) if path.exists() else fallback


def save(path,data):
    path.parent.mkdir(parents=True,exist_ok=True)
    temp = path.with_suffix(path.suffix+".tmp")
    temp.write_text(json.dumps(data,ensure_ascii=False,separators=(",",":"))+"\n")
    temp.replace(path)


def main():
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument("--id", type=int, action="append", help="Número no anexo. Pode repetir.")
    args.add_argument("--limit",type=int,default=25,help="Máximo de fichas a consultar nesta execução.")
    args.add_argument("--all",action="store_true",help="Processa todo o catálogo. Prefira lotes para respeitar os serviços.")
    args.add_argument("--refresh",action="store_true",help="Atualiza inclusive fichas já pesquisadas.")
    args.add_argument("--providers",nargs="+",choices=PROVIDERS,default=[name for name in PROVIDERS if name != "smithsonian" or os.environ.get("SMITHSONIAN_API_KEY")])
    args.add_argument("--state",type=Path,default=ROOT/".cache-pranchas.json")
    args.add_argument("--output",type=Path,default=MANIFEST,help="Destino do manifesto público.")
    options = args.parse_args()
    catalog = read(ROOT/"dist/catalogo.json",[])
    botany = read(ROOT/"dist/botanica.json",{}).get("taxons",{})
    state = read(options.state,{})
    public = read(options.output,{})

    entries = [row for row in catalog if not options.id or row[0] in options.id]
    if options.id and len(entries) != len(set(options.id)):
        args.error("Pelo menos um ID não pertence ao catálogo.")
    started = datetime.now(UTC)
    queried = 0
    unavailable = set()
    for ident, original, *_ in entries:
        key = str(ident)
        old = state.get(key,{})
        if old.get("checked") and not options.refresh and not options.id:
            age = started - datetime.fromisoformat(old["checked"])
            if age < timedelta(days=1 if old.get("errors") else 30):
                continue
        if not options.all and queried >= options.limit:
            break
        profile = botany.get(key,{})
        names = list(dict.fromkeys(filter(None,[profile.get("nome"),original,*profile.get("sinonimos",[])])))
        # Query accepted name and the published name before trying further recorded synonyms.
        images, errors = search(names[:4], options.providers, old.get("images") or ([public[key]] if key in public else []), unavailable)
        state[key] = {"checked":started.isoformat(),"errors":errors,"images":images}
        if images:
            public[key] = images[0]
        else:
            public.pop(key,None)
        save(options.state,state)
        save(options.output,public)
        queried += 1
        if not options.id:
            sleep(1)
        print(f"{ident:04d} {original}: {len(images)} candidatas" + (f"; {', '.join(errors)}" if errors else ""),flush=True)
    print(f"{queried} fichas buscadas. {len(public)} imagens no manifesto.",flush=True)


if __name__ == "__main__":
    main()

