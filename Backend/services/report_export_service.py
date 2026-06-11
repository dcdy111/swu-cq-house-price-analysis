from __future__ import annotations

import json
from io import BytesIO
from textwrap import wrap

from Backend.models.agent import GeneratedReport


class ReportExportService:
    @staticmethod
    def to_pdf(report: GeneratedReport) -> bytes:
        try:
            return ReportExportService._to_pdf_reportlab(report)
        except Exception:
            return ReportExportService._to_pdf_minimal(report)

    @staticmethod
    def _to_pdf_reportlab(report: GeneratedReport) -> bytes:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import mm
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.cidfonts import UnicodeCIDFont
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer

        pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=18 * mm,
            leftMargin=18 * mm,
            topMargin=16 * mm,
            bottomMargin=16 * mm,
            title=report.title,
        )
        styles = getSampleStyleSheet()
        base = ParagraphStyle(
            "ChineseBody",
            parent=styles["BodyText"],
            fontName="STSong-Light",
            fontSize=10.5,
            leading=17,
            spaceAfter=6,
        )
        h1 = ParagraphStyle(
            "ChineseH1",
            parent=base,
            fontSize=18,
            leading=24,
            textColor="#163A70",
            spaceAfter=12,
        )
        h2 = ParagraphStyle(
            "ChineseH2",
            parent=base,
            fontSize=13,
            leading=19,
            textColor="#1F4E8C",
            spaceBefore=8,
            spaceAfter=6,
        )
        small = ParagraphStyle("ChineseSmall", parent=base, fontSize=9, leading=14, textColor="#6B7280")

        story = [Paragraph(ReportExportService._escape(report.title), h1)]
        story.append(Paragraph(f"报告编号：#{report.id}　生成时间：{report.created_at}", small))
        story.append(Paragraph("价格口径：所有价格均为二手房挂牌价/报价，不代表真实成交价。", small))
        story.append(Spacer(1, 6))

        for line in report.content.splitlines():
            stripped = line.strip()
            if not stripped:
                story.append(Spacer(1, 4))
            elif stripped.startswith("# "):
                story.append(Paragraph(ReportExportService._escape(stripped[2:]), h1))
            elif stripped.startswith("## "):
                story.append(Paragraph(ReportExportService._escape(stripped[3:]), h2))
            elif stripped.startswith("- "):
                story.append(Paragraph("• " + ReportExportService._escape(stripped[2:]), base))
            else:
                story.append(Paragraph(ReportExportService._escape(stripped), base))

        evidence = report.evidence or {}
        if evidence:
            story.append(Spacer(1, 8))
            story.append(Paragraph("工具证据摘要", h2))
            for key, value in evidence.items():
                summary = ReportExportService._summarize_evidence(value)
                story.append(Paragraph(ReportExportService._escape(f"{key}: {summary}"), small))

        doc.build(story)
        return buffer.getvalue()

    @staticmethod
    def _to_pdf_minimal(report: GeneratedReport) -> bytes:
        text = "\n".join(
            [
                report.title,
                f"报告编号：#{report.id}",
                "价格口径：所有价格均为二手房挂牌价/报价，不代表真实成交价。",
                "",
                report.content,
                "",
                "工具证据摘要：",
                json.dumps(report.evidence, ensure_ascii=False, default=str)[:2000],
            ]
        )
        safe_lines = []
        for line in text.splitlines():
            safe_lines.extend(wrap(line, 72) or [""])
        escaped = "\\n".join(line.encode("latin-1", errors="replace").decode("latin-1") for line in safe_lines)
        stream = f"BT /F1 10 Tf 50 780 Td ({ReportExportService._pdf_escape(escaped)}) Tj ET"
        objects = [
            "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
            "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
            "3 0 obj << /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 595 842] /Contents 5 0 R >> endobj",
            "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
            f"5 0 obj << /Length {len(stream.encode('latin-1'))} >> stream\n{stream}\nendstream endobj",
        ]
        body = "%PDF-1.4\n"
        offsets = [0]
        for obj in objects:
            offsets.append(len(body.encode("latin-1")))
            body += obj + "\n"
        xref_pos = len(body.encode("latin-1"))
        body += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n"
        body += "".join(f"{offset:010d} 00000 n \n" for offset in offsets[1:])
        body += f"trailer << /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF"
        return body.encode("latin-1")

    @staticmethod
    def _summarize_evidence(value) -> str:
        if isinstance(value, dict):
            if "overview" in value:
                overview = value.get("overview") or {}
                return f"有效样本 {overview.get('active_count', 0)}，均价 {overview.get('avg_unit_price', 0)}"
            if "job" in value:
                job = value.get("job") or {}
                return f"分析任务 #{job.get('id', '暂无')}，状态 {job.get('status', 'unknown')}"
            if "report" in value:
                return f"报告 #{(value.get('report') or {}).get('id', '暂无')}"
        return json.dumps(value, ensure_ascii=False, default=str)[:160]

    @staticmethod
    def _escape(text: str) -> str:
        return (
            str(text)
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
        )

    @staticmethod
    def _pdf_escape(text: str) -> str:
        return str(text).replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)").replace("\n", ") Tj T* (")
