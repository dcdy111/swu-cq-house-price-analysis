-- D7 分析建模表结构补充
-- 若使用 `python -m flask --app Backend.app init-db`，SQLAlchemy 会自动创建。
-- 生产库手动迁移时可参考以下 MySQL 8.x DDL。

CREATE TABLE IF NOT EXISTS analysis_jobs (
  id INT NOT NULL AUTO_INCREMENT,
  job_type VARCHAR(32) NOT NULL DEFAULT 'all',
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  sample_count INT NOT NULL DEFAULT 0,
  train_count INT NOT NULL DEFAULT 0,
  test_count INT NOT NULL DEFAULT 0,
  error_message TEXT NULL,
  started_at DATETIME NULL,
  finished_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_analysis_job_status (status),
  KEY idx_analysis_job_type (job_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS model_results (
  id INT NOT NULL AUTO_INCREMENT,
  job_id INT NOT NULL,
  result_type VARCHAR(32) NOT NULL,
  model_name VARCHAR(128) NOT NULL,
  summary TEXT NULL,
  metrics_json TEXT NULL,
  artifacts_json LONGTEXT NULL,
  evidence_json TEXT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_model_result_job_type (job_id, result_type),
  KEY idx_model_result_type (result_type),
  CONSTRAINT fk_model_results_job_id
    FOREIGN KEY (job_id) REFERENCES analysis_jobs(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
