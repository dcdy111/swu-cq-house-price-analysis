ALTER TABLE listings
  ADD COLUMN total_floors INT NULL COMMENT '总楼层数',
  ADD COLUMN metro_distance INT NULL COMMENT '最近地铁距离(米)',
  ADD COLUMN building_type VARCHAR(64) NULL COMMENT '建筑类型：板楼/塔楼/别墅/洋房等',
  ADD COLUMN has_elevator TINYINT(1) NULL COMMENT '是否有电梯';

ALTER TABLE crawl_tasks
  ADD COLUMN run_id VARCHAR(64) NULL COMMENT '每次任务运行唯一编号',
  ADD COLUMN evidence_json LONGTEXT NULL COMMENT '任务证据回放 JSON';
