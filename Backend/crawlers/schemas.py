from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class PageCrawlResult:
    source: str
    district: str
    page: int
    url: str
    ok: bool
    listings: list[dict] = field(default_factory=list)
    message: str = ""
    final_url: str | None = None
    status_code: int | None = None
    elapsed_ms: int | None = None
    html_bytes: int | None = None
    attempts: int = 1
