"""Mission export API endpoints."""
from __future__ import annotations

import logging
from urllib.parse import quote

from fastapi import APIRouter, Response

from app.core.dependencies import CurrentUser
from app.schemas.mission_export import MissionExportKmlRequest, MissionExportTxtRequest
from app.services.mission_export_service import (
    KML_MEDIA_TYPE,
    TXT_MEDIA_TYPE,
    generate_mission_kml_document,
    generate_mission_txt_document,
)

router = APIRouter(prefix="/mission-export", tags=["Mission Export"])
logger = logging.getLogger(__name__)


@router.post(
    "/kml",
    response_class=Response,
    responses={
        200: {
            "content": {
                KML_MEDIA_TYPE: {},
            },
            "description": "Downloadable KML mission export.",
        }
    },
)
async def export_mission_kml(
    request: MissionExportKmlRequest,
    _: CurrentUser,
) -> Response:
    mission = request.normalized_mission
    geometry = mission.geometry
    logger.info(
        "Mission KML export request",
        extra={
            "geometry_type": geometry.type,
            "coordinate_count": len(geometry.coordinates),
            "mission_name": mission.metadata.name,
        },
    )
    document = generate_mission_kml_document(request)
    content_disposition = (
        f'attachment; filename="{document.filename}"; '
        f"filename*=UTF-8''{quote(document.filename)}"
    )
    logger.info(
        "Mission KML export response",
        extra={
            "geometry_type": geometry.type,
            "coordinate_count": len(geometry.coordinates),
            "export_filename": document.filename,
        },
    )
    return Response(
        content=document.content,
        media_type=document.media_type,
        headers={"Content-Disposition": content_disposition},
    )


@router.post(
    "/txt",
    response_class=Response,
    responses={
        200: {
            "content": {
                TXT_MEDIA_TYPE: {},
            },
            "description": "Downloadable TXT mission export.",
        }
    },
)
async def export_mission_txt(
    request: MissionExportTxtRequest,
    _: CurrentUser,
) -> Response:
    mission = request.normalized_mission
    geometry = mission.geometry
    logger.info(
        "Mission TXT export request",
        extra={
            "geometry_type": geometry.type,
            "coordinate_count": len(geometry.coordinates),
            "mission_name": mission.metadata.name,
        },
    )
    document = generate_mission_txt_document(request)
    content_disposition = (
        f'attachment; filename="{document.filename}"; '
        f"filename*=UTF-8''{quote(document.filename)}"
    )
    logger.info(
        "Mission TXT export response",
        extra={
            "geometry_type": geometry.type,
            "coordinate_count": len(geometry.coordinates),
            "export_filename": document.filename,
        },
    )
    return Response(
        content=document.content,
        media_type=document.media_type,
        headers={"Content-Disposition": content_disposition},
    )
