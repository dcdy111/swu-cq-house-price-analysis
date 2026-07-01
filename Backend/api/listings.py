from __future__ import annotations

from flask import Blueprint, Response, request

from Backend.services.listing_service import ListingService
from Backend.utils.response import api_error, api_success

bp = Blueprint("listings", __name__, url_prefix="/api/listings")


@bp.get("")
def list_items():
    return api_success(ListingService.query_listings(request.args.to_dict()))


@bp.get("/options")
def options():
    return api_success(ListingService.listing_options())


@bp.get("/export")
def export_csv():
    csv_text = ListingService.export_csv(request.args.to_dict())
    return Response(
        "\ufeff" + csv_text,
        mimetype="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=listings.csv"},
    )


@bp.get("/<int:listing_id>")
def detail(listing_id: int):
    item = ListingService.get_listing(listing_id)
    if item is None:
        return api_error("房源不存在", status_code=404)
    return api_success(item.to_dict())
