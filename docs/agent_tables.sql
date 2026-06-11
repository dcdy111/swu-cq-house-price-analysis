-- D8 DeepSeek Agent 工具调用与报告表结构补充
-- 使用 `python -m flask --app Backend.app init-db` 可由 SQLAlchemy 自动创建。
-- 生产库手动迁移时可参考以下 MySQL 8.x DDL。

CREATE TABLE IF NOT EXISTS agent_tool_calls (
  id INT NOT NULL AUTO_INCREMENT,
  session_id VARCHAR(64) NOT NULL,
  question TEXT NOT NULL,
  tool_name VARCHAR(64) NOT NULL,
  tool_args_json LONGTEXT NULL,
  tool_result_json LONGTEXT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'success',
  duration_ms INT NOT NULL DEFAULT 0,
  error_message TEXT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_agent_tool_call_session (session_id),
  KEY idx_agent_tool_call_name (tool_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS generated_reports (
  id INT NOT NULL AUTO_INCREMENT,
  session_id VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  question TEXT NOT NULL,
  content LONGTEXT NOT NULL,
  evidence_json LONGTEXT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_generated_report_session (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
