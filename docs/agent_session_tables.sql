CREATE TABLE IF NOT EXISTS agent_sessions (
    session_id VARCHAR(64) PRIMARY KEY,
    title VARCHAR(255) NOT NULL DEFAULT '新的市场问数',
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    INDEX idx_agent_session_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS agent_turns (
    id INT AUTO_INCREMENT PRIMARY KEY,
    turn_id VARCHAR(64) NOT NULL,
    session_id VARCHAR(64) NOT NULL,
    question TEXT NOT NULL,
    answer LONGTEXT NULL,
    thinking_summary TEXT NULL,
    model_name VARCHAR(128) NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'running',
    tool_call_ids_json TEXT NULL,
    report_id INT NULL,
    created_at DATETIME NOT NULL,
    finished_at DATETIME NULL,
    CONSTRAINT uq_agent_turn_id UNIQUE (turn_id),
    CONSTRAINT fk_agent_turn_session FOREIGN KEY (session_id)
        REFERENCES agent_sessions(session_id) ON DELETE CASCADE,
    INDEX idx_agent_turn_session (session_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
