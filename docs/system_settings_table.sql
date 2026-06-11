-- 系统设置持久化表
-- 用途：保存数据源开关、采集并发、调度规则和 DeepSeek API Key 等后端配置。
-- 执行方式：
--   mysql -u root -p real_estate < docs/system_settings_table.sql

CREATE TABLE IF NOT EXISTS system_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  setting_key VARCHAR(64) NOT NULL,
  value_json LONGTEXT NULL,
  is_secret TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_system_settings_setting_key (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
