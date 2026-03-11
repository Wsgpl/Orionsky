"""Mission export services for KML and TXT generation."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import re
from xml.sax.saxutils import escape

from app.schemas.mission_export import MissionExportKmlRequest, MissionExportTxtRequest
from app.schemas.mission_geometry import (
    MissionGeometry,
    MissionGeometryCoordinate,
    MissionLineStringGeometry,
    MissionPolygonGeometry,
)
from app.utils.mission_geometry import (
    build_mission_geometry_metrics,
    format_coordinate_pair_text,
)

KML_MEDIA_TYPE = "application/vnd.google-earth.kml+xml"
TXT_MEDIA_TYPE = "text/plain; charset=utf-8"


@dataclass(slots=True, frozen=True)
class MissionExportDocument:
    filename: str
    media_type: str
    content: str


def _format_number(value: float) -> str:
    text = f"{value:.10f}".rstrip("0").rstrip(".")
    return text if text else "0"


def _coordinate_to_kml_text(coordinate: MissionGeometryCoordinate) -> str:
    lon = _format_number(coordinate.lon)
    lat = _format_number(coordinate.lat)
    if coordinate.alt is None:
        return f"{lon},{lat}"
    return f"{lon},{lat},{_format_number(coordinate.alt)}"


def _coordinates_block(coordinates: list[MissionGeometryCoordinate]) -> str:
    return "\n".join(f"          {_coordinate_to_kml_text(coordinate)}" for coordinate in coordinates)


def _sanitize_filename(value: str) -> str:
    normalized = re.sub(r"[^A-Za-z0-9._-]+", "-", value.strip())
    normalized = normalized.strip("-.")
    return normalized or "mission"


def _document_name(geometry: MissionGeometry) -> str | None:
    if geometry.name is None:
        return None
    text = geometry.name.strip()
    return text or None


def _filename_for_geometry(geometry: MissionGeometry, extension: str) -> str:
    name = _document_name(geometry)
    if name is None:
        suffix = "route" if isinstance(geometry, MissionLineStringGeometry) else "polygon"
        return f"mission-{suffix}.{extension}"
    return f"{_sanitize_filename(name)}.{extension}"


def _exported_at_utc() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _build_kml_document(name: str | None, placemark_body: str) -> str:
    document_name = f"    <name>{escape(name)}</name>\n" if name is not None else ""
    placemark_name = f"      <name>{escape(name)}</name>\n" if name is not None else ""
    return (
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
        "<kml xmlns=\"http://www.opengis.net/kml/2.2\">\n"
        "  <Document>\n"
        f"{document_name}"
        "    <Placemark>\n"
        f"{placemark_name}"
        f"{placemark_body}"
        "    </Placemark>\n"
        "  </Document>\n"
        "</kml>\n"
    )


def _build_linestring_kml(geometry: MissionLineStringGeometry) -> str:
    placemark_body = (
        "      <LineString>\n"
        "        <tessellate>1</tessellate>\n"
        "        <coordinates>\n"
        f"{_coordinates_block(geometry.coordinates)}\n"
        "        </coordinates>\n"
        "      </LineString>\n"
    )
    return _build_kml_document(_document_name(geometry), placemark_body)


def _build_polygon_kml(geometry: MissionPolygonGeometry) -> str:
    placemark_body = (
        "      <Polygon>\n"
        "        <outerBoundaryIs>\n"
        "          <LinearRing>\n"
        "            <coordinates>\n"
        f"{_coordinates_block(geometry.coordinates)}\n"
        "            </coordinates>\n"
        "          </LinearRing>\n"
        "        </outerBoundaryIs>\n"
        "      </Polygon>\n"
    )
    return _build_kml_document(_document_name(geometry), placemark_body)


def generate_mission_kml_document(request: MissionExportKmlRequest) -> MissionExportDocument:
    geometry = request.normalized_geometry
    if isinstance(geometry, MissionLineStringGeometry):
        content = _build_linestring_kml(geometry)
    elif isinstance(geometry, MissionPolygonGeometry):
        content = _build_polygon_kml(geometry)
    else:
        raise ValueError(f"Unsupported mission geometry type: {geometry.type}")

    return MissionExportDocument(
        filename=_filename_for_geometry(geometry, "kml"),
        media_type=KML_MEDIA_TYPE,
        content=content,
    )


def _build_txt_lines(geometry: MissionGeometry) -> list[str]:
    metrics = build_mission_geometry_metrics(geometry)
    geometry_name = _document_name(geometry) or ""
    lines = [
        f"MISSION_NAME: {geometry_name}",
        f"TYPE: {geometry.type.upper()}",
        f"EXPORTED_AT_UTC: {_exported_at_utc()}",
    ]

    for index, coordinate in enumerate(geometry.coordinates, start=1):
        lines.append(f"POINT_{index}: {format_coordinate_pair_text(coordinate)}")

    lines.append(f"TOTAL_POINTS: {metrics.total_points}")

    if metrics.total_distance_km is not None:
        lines.append(f"TOTAL_DISTANCE_KM: {metrics.total_distance_km:.3f}")

    if metrics.area_sq_km is not None:
        lines.append(f"AREA_SQ_KM: {metrics.area_sq_km:.3f}")

    return lines


def generate_mission_txt_document(request: MissionExportTxtRequest) -> MissionExportDocument:
    geometry = request.normalized_geometry
    content = "\n".join(_build_txt_lines(geometry)) + "\n"
    return MissionExportDocument(
        filename=_filename_for_geometry(geometry, "txt"),
        media_type=TXT_MEDIA_TYPE,
        content=content,
    )
