from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlglot import exp, parse
from sqlglot.errors import ParseError

from Backend.extensions import db
from Backend.models.analysis import AnalysisJob, ModelResult
from Backend.models.crawl import CrawlLog, CrawlTask
from Backend.models.listing import Listing
from Backend.models.quality import DataQualityReport
from Backend.models.snapshot import ListingSnapshot


class ReadOnlySqlError(ValueError):
    pass


class ReadOnlySqlService:
    MAX_ROWS = 100
    MAX_SQL_LENGTH = 5000
    MAX_EXECUTION_TIME_MS = 5000
    ALLOWED_MODELS = (
        Listing,
        ListingSnapshot,
        CrawlTask,
        CrawlLog,
        DataQualityReport,
        AnalysisJob,
        ModelResult,
    )
    ALLOWED_TABLES = {model.__tablename__ for model in ALLOWED_MODELS}
    FORBIDDEN_NODE_NAMES = {
        "Alter",
        "Analyze",
        "Command",
        "Copy",
        "Create",
        "Delete",
        "Drop",
        "Execute",
        "Grant",
        "Insert",
        "Into",
        "LoadData",
        "Lock",
        "Merge",
        "Pragma",
        "Revoke",
        "Set",
        "Show",
        "Transaction",
        "TruncateTable",
        "Update",
        "Use",
    }
    FORBIDDEN_FUNCTIONS = {
        "BENCHMARK",
        "GET_LOCK",
        "IS_FREE_LOCK",
        "IS_USED_LOCK",
        "LOAD_FILE",
        "MASTER_POS_WAIT",
        "RELEASE_ALL_LOCKS",
        "RELEASE_LOCK",
        "SLEEP",
        "UUID_SHORT",
    }

    @classmethod
    def schema_prompt(cls) -> str:
        lines = ["MySQL 8.0，只允许查询以下表和字段："]
        for model in cls.ALLOWED_MODELS:
            columns = ", ".join(column.name for column in model.__table__.columns)
            lines.append(f"- {model.__tablename__}({columns})")
        lines.extend(
            [
                "价格字段：total_price 单位为万元，unit_price 单位为元/平方米。",
                "所有价格均为挂牌价/报价，不是成交价。",
                f"结果最多返回 {cls.MAX_ROWS} 行。",
            ]
        )
        return "\n".join(lines)

    @classmethod
    def validate_and_rewrite(cls, sql: str) -> str:
        text = str(sql or "").strip()
        if not text:
            raise ReadOnlySqlError("模型未生成 SQL")
        if len(text) > cls.MAX_SQL_LENGTH:
            raise ReadOnlySqlError("SQL 过长，已拒绝执行")

        try:
            statements = [statement for statement in parse(text, read="mysql") if statement is not None]
        except ParseError as exc:
            raise ReadOnlySqlError(f"SQL 解析失败：{exc}") from exc
        if len(statements) != 1:
            raise ReadOnlySqlError("只允许执行一条只读 SELECT 语句")

        expression = statements[0]
        if not isinstance(expression, (exp.Select, exp.Union, exp.Except, exp.Intersect)):
            raise ReadOnlySqlError("只允许 SELECT、CTE 和只读集合查询")

        cte_names = {str(cte.alias_or_name or "").lower() for cte in expression.find_all(exp.CTE)}
        referenced_tables: set[str] = set()
        for node in expression.walk():
            node_name = type(node).__name__
            if node_name in cls.FORBIDDEN_NODE_NAMES:
                raise ReadOnlySqlError(f"SQL 包含禁止操作：{node_name}")
            if isinstance(node, exp.Table):
                if node.db or node.catalog:
                    raise ReadOnlySqlError("禁止跨数据库或访问系统库")
                table_name = str(node.name or "").lower()
                if table_name in cte_names:
                    continue
                if table_name not in cls.ALLOWED_TABLES:
                    raise ReadOnlySqlError(f"数据表不在只读白名单中：{table_name or '未知表'}")
                referenced_tables.add(table_name)
            if isinstance(node, exp.Anonymous):
                function_name = str(node.name or "").upper()
                if function_name in cls.FORBIDDEN_FUNCTIONS:
                    raise ReadOnlySqlError(f"SQL 函数不在安全白名单中：{function_name}")

        if not referenced_tables:
            raise ReadOnlySqlError("查询必须读取至少一个业务白名单表")

        expression.limit(cls.MAX_ROWS, copy=False)
        return expression.sql(dialect="mysql")

    @classmethod
    def execute(cls, sql: str) -> dict[str, Any]:
        safe_sql = cls.validate_and_rewrite(sql)
        raw_connection = db.engine.raw_connection()
        cursor = raw_connection.cursor()
        try:
            cursor.execute(f"SET SESSION MAX_EXECUTION_TIME={cls.MAX_EXECUTION_TIME_MS}")
            cursor.execute("START TRANSACTION READ ONLY")
            cursor.execute(safe_sql)
            columns = [item[0] for item in cursor.description or []]
            raw_rows = cursor.fetchmany(cls.MAX_ROWS)
            rows = [
                {column: cls._json_value(value) for column, value in zip(columns, row)}
                for row in raw_rows
            ]
            raw_connection.rollback()
        except Exception:
            raw_connection.rollback()
            raise
        finally:
            try:
                cursor.execute("SET SESSION MAX_EXECUTION_TIME=0")
                raw_connection.commit()
            finally:
                cursor.close()
                raw_connection.close()

        return {
            "sql": safe_sql,
            "columns": columns,
            "rows": rows,
            "row_count": len(rows),
            "row_limit": cls.MAX_ROWS,
            "truncated": len(rows) >= cls.MAX_ROWS,
            "metric_note": "查询仅访问业务白名单表；所有价格均为挂牌价/报价，不代表成交价。",
        }

    @staticmethod
    def _json_value(value: Any) -> Any:
        if isinstance(value, Decimal):
            return float(value)
        if isinstance(value, (datetime, date)):
            return value.isoformat(sep=" ") if isinstance(value, datetime) else value.isoformat()
        if isinstance(value, bytes):
            return value.decode("utf-8", errors="replace")
        return value
