-- 数据质量报告物理表
-- 使用 `python -m flask --app Backend.app init-db` 可由 SQLAlchemy 自动创建。

CREATE TABLE IF NOT EXISTS data_quality_reports (
  id INT NOT NULL AUTO_INCREMENT,
  report_type VARCHAR(32) NOT NULL DEFAULT 'daily',
  total_count INT NOT NULL DEFAULT 0,
  valid_count INT NOT NULL DEFAULT 0,
  analysis_ready_count INT NOT NULL DEFAULT 0,
  avg_quality DOUBLE NOT NULL DEFAULT 0,
  missing_count INT NOT NULL DEFAULT 0,
  extreme_count INT NOT NULL DEFAULT 0,
  low_quality_count INT NOT NULL DEFAULT 0,
  snapshot_count INT NOT NULL DEFAULT 0,
  summary_json LONGTEXT NULL,
  detail_json LONGTEXT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_quality_report_created (created_at),
  KEY idx_quality_report_type (report_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
