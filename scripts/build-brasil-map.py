"""Prepare the decorative Brazil map from the official IBGE UF 2025 archive.

Requires pyshp and shapely. Pass the downloaded BR_UF_2025.zip as the argument.
"""
import io
import json
from pathlib import Path
import sys
from zipfile import ZipFile

import shapefile
from shapely.geometry import shape
from shapely.ops import unary_union


def load_states(archive):
    with ZipFile(archive) as source:
        paths = {Path(item).suffix: item for item in source.namelist()}
        with shapefile.Reader(
            shp=io.BytesIO(source.read(paths[".shp"])),
            dbf=io.BytesIO(source.read(paths[".dbf"])),
            encoding="utf-8",
        ) as reader:
            return {
                row.record["SIGLA_UF"]: (row.record["NM_UF"], shape(row.shape.__geo_interface__))
                for row in reader.iterShapeRecords()
            }


def svg_path(geometry, bounds):
    west, south, east, north = bounds
    scale = 318 / max(east - west, north - south)
    xpad = (340 - (east - west) * scale) / 2
    ypad = (340 - (north - south) * scale) / 2

    def ring(coords):
        points = [f"{xpad + (x-west)*scale:.1f},{ypad + (north-y)*scale:.1f}" for x, y in coords]
        return "M" + " ".join(points[:-1]) + "Z"

    parts = [geometry] if geometry.geom_type == "Polygon" else geometry.geoms
    return "".join(
        ring(poly.exterior.coords) + "".join(ring(hole.coords) for hole in poly.interiors)
        for poly in parts if poly.area > 0.015
    )


if __name__ == "__main__":
    states = load_states(sys.argv[1])
    assert len(states) == 27
    outline = unary_union([geom.buffer(0) for _, geom in states.values()]).simplify(.055)
    bounds = outline.bounds
    data = {
        "outline": svg_path(outline, bounds),
        "paths": {code: svg_path(geom.simplify(.06), bounds) for code, (_, geom) in states.items()},
        "names": {code: name for code, (name, _) in states.items()},
    }
    path = Path(__file__).resolve().parents[1] / "dist/mapa-brasil.json"
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

