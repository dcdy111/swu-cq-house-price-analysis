export interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
  trace_id: string;
}

export interface Pagination {
  page: number;
  page_size: number;
  total: number;
  pages: number;
  has_next?: boolean;
  has_prev?: boolean;
}

export interface ListingItem {
  id: number;
  source: string;
  source_listing_id?: string;
  title: string;
  link: string;
  district: string;
  community?: string;
  address?: string;
  total_price?: number;
  unit_price?: number;
  area?: number;
  layout?: string;
  rooms?: number;
  halls?: number;
  orientation?: string;
  decoration?: string;
  floor_text?: string;
  floor_level?: string;
  build_year?: number;
  house_age?: number;
  tags: string[];
  data_quality_score: number;
  status: string;
  first_seen_at?: string;
  last_seen_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ListingQueryResult {
  items: ListingItem[];
  pagination: Pagination;
}

export interface ListingOptions {
  districts: string[];
  sources: string[];
}

export interface CrawlSource {
  key: string;
  name: string;
  enabled: boolean;
  description: string;
  districts: string[];
}

export interface CrawlLog {
  id: number;
  task_id: number;
  level: "INFO" | "WARN" | "ERROR";
  message: string;
  url?: string;
  district?: string;
  page?: number;
  created_at: string;
}

export interface CrawlTask {
  id: number;
  name: string;
  source: string;
  mode: string;
  districts: string[];
  max_pages: number;
  max_workers: number;
  status: string;
  total_pages: number;
  success_pages: number;
  failed_pages: number;
  total_found: number;
  inserted_count: number;
  updated_count: number;
  unchanged_count: number;
  snapshot_count: number;
  progress: number;
  error_message?: string;
  started_at?: string;
  finished_at?: string;
  created_at: string;
  updated_at: string;
  logs?: CrawlLog[];
}

export interface CrawlTaskList {
  items: CrawlTask[];
  pagination: Pagination;
  summary: {
    running: number;
    success: number;
    failed: number;
    partial_failed: number;
    pending: number;
    canceled: number;
    cancel_requested: number;
    total_found: number;
  };
}

export interface AuthUser {
  username: string;
  role: string;
}

export interface LoginResponse {
  token: string;
  token_type: "Bearer";
  expires_in: number;
  user: AuthUser;
}

export interface SystemSettings {
  crawler: {
    max_workers: number;
    request_timeout: number;
    interval_min: number;
    interval_max: number;
    sources: Record<string, { enabled: boolean }>;
  };
  scheduler: {
    enabled: boolean;
    timezone: string;
    quality_report_job_enabled: boolean;
    quality_report_interval_hours: number;
    incremental_crawl_job_enabled: boolean;
    incremental_crawl_interval_hours: number;
    incremental_crawl_source: string;
    incremental_crawl_districts: string;
    incremental_crawl_max_pages: number;
    incremental_crawl_max_workers: number;
  };
  deepseek: {
    enabled: boolean;
    base_url: string;
    model: string;
    timeout: number;
    api_key?: string;
    clear_api_key?: boolean;
    api_key_configured?: boolean;
    api_key_masked?: string | null;
  };
}

export interface QualityOverview {
  total_count: number;
  distinct_fingerprint: number;
  distinct_link: number;
  legacy_count: number;
  new_standard_count: number;
  analysis_ready_count: number;
  strict_new_standard_count: number;
  snapshot_count: number;
  avg_quality: number;
  extreme_count: number;
  missing_count: number;
  low_quality_count: number;
  recommended_mode: string;
  recommended_mode_label: string;
}

export interface SourceLayer {
  source: string;
  layer: "cold_start_baseline" | "new_standard_crawl";
  layer_label: string;
  sample_count: number;
  usable_count: number;
  avg_quality: number;
  missing_count: number;
  extreme_count: number;
  district_count: number;
  min_unit_price?: number | null;
  max_unit_price?: number | null;
  recommended_usage: string;
}

export interface QualityBucket {
  bucket: string;
  count: number;
}

export interface CleaningStep {
  name: string;
  description: string;
}

export interface AnalysisPolicy {
  min_quality_score: number;
  default_filters: string[];
  source_rules: string[];
  current_mode: string;
}

export interface QualityReport {
  overview: QualityOverview;
  source_layers: SourceLayer[];
  quality_buckets: QualityBucket[];
  abnormal_samples: (ListingItem & { reason: string })[];
  cleaning_steps: CleaningStep[];
  analysis_policy: AnalysisPolicy;
}

export interface AnalysisResult {
  id: number;
  job_id: number;
  result_type: "eda" | "regression" | "cluster" | "anomaly" | string;
  model_name: string;
  summary?: string;
  metrics: Record<string, any>;
  artifacts: Record<string, any>;
  evidence: Record<string, any>;
  created_at?: string;
}

export interface AnalysisJob {
  id: number;
  job_type: string;
  status: string;
  sample_count: number;
  train_count: number;
  test_count: number;
  error_message?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  results: AnalysisResult[];
}

export interface LatestAnalysisJob {
  job: AnalysisJob | null;
  results: AnalysisResult[];
}

export interface AgentToolCall {
  id: number;
  session_id: string;
  question: string;
  tool_name: string;
  tool_args: Record<string, any>;
  tool_result: Record<string, any>;
  status: "success" | "error";
  duration_ms: number;
  error_message?: string | null;
  created_at?: string | null;
}

export interface GeneratedReport {
  id: number;
  session_id: string;
  title: string;
  question: string;
  content: string;
  evidence: Record<string, any>;
  created_at?: string | null;
}

export interface AgentChatResponse {
  session_id: string;
  answer: string;
  tool_calls: AgentToolCall[];
  report?: GeneratedReport | null;
  thinking: string;
  model: string;
}

export interface DashboardKpis {
  total_count: number;
  active_count: number;
  avg_unit_price: number;
  avg_total_price: number;
  avg_quality: number;
  data_complete_rate: number;
  district_count: number;
  analysis_ready_count: number;
  recent_seen_count: number;
  snapshot_count: number;
  latest_updated_at?: string | null;
}

export interface DistrictPriceItem {
  rank: number;
  district: string;
  raw_districts: string[];
  listing_count: number;
  avg_unit_price: number;
  avg_total_price: number;
  avg_quality: number;
  min_unit_price?: number | null;
  max_unit_price?: number | null;
  change: number;
}

export interface SourceSummaryItem {
  source: string;
  listing_count: number;
  avg_unit_price: number;
  avg_quality: number;
}

export interface StatusSummaryItem {
  status: string;
  count: number;
}

export interface CrawlStatusSummary {
  running: number;
  success: number;
  failed: number;
  partial_failed: number;
  pending: number;
}

export interface CrawlStatusItem {
  id: number;
  name: string;
  source: string;
  status: string;
  progress: number;
  total_found: number;
  failed_pages: number;
  updated_at?: string | null;
}

export interface DashboardOverview {
  kpis: DashboardKpis;
  top_district?: DistrictPriceItem | null;
  source_summary: SourceSummaryItem[];
  status_summary: StatusSummaryItem[];
  crawl_status: {
    summary: CrawlStatusSummary;
    items: CrawlStatusItem[];
  };
}

export interface DistrictPriceResult {
  items: DistrictPriceItem[];
}

export interface DistrictMapItem {
  name: string;
  district: string;
  raw_districts: string[];
  avgPrice: number;
  avg_unit_price: number;
  avg_total_price: number;
  count: number;
  listing_count: number;
  quality: number;
  avg_quality: number;
  min_unit_price?: number | null;
  max_unit_price?: number | null;
  change: number;
  rank?: number;
}

export interface DistrictMapResult {
  items: DistrictMapItem[];
  total_count: number;
  district_count: number;
  latest_updated_at?: string | null;
  metric_fields: Record<string, string>;
}

export interface PriceDistributionItem {
  label: string;
  lower?: number | null;
  upper?: number | null;
  count: number;
  ratio: number;
}

export interface PriceDistributionResult {
  items: PriceDistributionItem[];
  total: number;
  metric: string;
}

export interface PriceTrendItem {
  month: string;
  avg_unit_price: number;
  avg_total_price: number;
  listing_count: number;
}

export interface PriceTrendResult {
  items: PriceTrendItem[];
}

export interface AreaPricePoint {
  id: number;
  title: string;
  district: string;
  raw_district: string;
  area: number;
  unit_price: number;
  total_price: number;
  quality: number;
}

export interface AreaPriceScatterResult {
  items: AreaPricePoint[];
}

export interface LayoutDistributionItem {
  name: string;
  count: number;
  value: number;
}

export interface LayoutDistributionResult {
  items: LayoutDistributionItem[];
  total: number;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const TOKEN_KEY = "swu-auth-token";
const USER_KEY = "swu-auth-user";

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function hasAuthToken() {
  return Boolean(getAuthToken());
}

export function clearAuthToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function saveAuth(payload: LoginResponse) {
  localStorage.setItem(TOKEN_KEY, payload.token);
  localStorage.setItem(USER_KEY, JSON.stringify(payload.user));
}

export function getStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

function toQuery(params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      query.set(key, String(value));
    }
  });
  const text = query.toString();
  return text ? `?${text}` : "";
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers || {}),
    },
    ...options,
  });
  const payload = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || payload.code !== 0) {
    throw new Error(payload.message || `请求失败: ${response.status}`);
  }
  return payload.data;
}

export const api = {
  login(payload: { username: string; password: string }) {
    return request<LoginResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  me() {
    return request<{ user: AuthUser }>("/api/auth/me");
  },
  logout() {
    return request<{ status: string }>("/api/auth/logout", { method: "POST" });
  },
  getSettings() {
    return request<SystemSettings>("/api/settings");
  },
  updateSettings(payload: Partial<SystemSettings>) {
    return request<SystemSettings>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },
  testDeepSeek() {
    return request<{ ok: boolean; message: string; base_url?: string; model?: string }>("/api/settings/test-deepseek", {
      method: "POST",
    });
  },
  getOverview() {
    return request<DashboardOverview>("/api/overview");
  },
  getDistrictPriceChart(limit = 20) {
    return request<DistrictPriceResult>(`/api/charts/district-price?limit=${limit}`);
  },
  getDistrictMap() {
    return request<DistrictMapResult>("/api/charts/district-map");
  },
  getPriceDistributionChart() {
    return request<PriceDistributionResult>("/api/charts/price-distribution");
  },
  getPriceTrendChart(months = 12) {
    return request<PriceTrendResult>(`/api/charts/price-trend?months=${months}`);
  },
  getAreaPriceScatter(limit = 500) {
    return request<AreaPriceScatterResult>(`/api/charts/area-price-scatter?limit=${limit}`);
  },
  getLayoutDistribution(limit = 8) {
    return request<LayoutDistributionResult>(`/api/charts/layout-distribution?limit=${limit}`);
  },
  getListings(params: Record<string, string | number | undefined>) {
    return request<ListingQueryResult>(`/api/listings${toQuery(params)}`);
  },
  getListingOptions() {
    return request<ListingOptions>("/api/listings/options");
  },
  getCrawlSources() {
    return request<{ items: CrawlSource[] }>("/api/crawl/sources");
  },
  getCrawlTasks() {
    return request<CrawlTaskList>("/api/crawl/tasks");
  },
  createCrawlTask(payload: {
    name: string;
    source: string;
    districts: string[];
    max_pages: number;
    max_workers: number;
    mode: string;
    run_now?: boolean;
  }) {
    return request<CrawlTask>("/api/crawl/tasks", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  runCrawlTask(taskId: number) {
    return request<CrawlTask>(`/api/crawl/tasks/${taskId}/run`, { method: "POST" });
  },
  cancelCrawlTask(taskId: number) {
    return request<CrawlTask>(`/api/crawl/tasks/${taskId}/cancel`, { method: "POST" });
  },
  getCrawlLogs(limit = 100) {
    return request<{ items: CrawlLog[] }>(`/api/crawl/logs?limit=${limit}`);
  },
  getQualityReport() {
    return request<QualityReport>("/api/quality/report");
  },
  getLatestAnalysisJob() {
    return request<LatestAnalysisJob>("/api/analysis/jobs/latest");
  },
  createAnalysisJob(payload: { job_type: "all" | "eda" | "regression" | "cluster" | "anomaly"; max_samples?: number }) {
    return request<AnalysisJob>("/api/analysis/jobs", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  getAnalysisJob(jobId: number) {
    return request<AnalysisJob>(`/api/analysis/jobs/${jobId}`);
  },
  chatAgent(payload: { session_id?: string; question: string }) {
    return request<AgentChatResponse>("/api/agent/chat", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  getReport(reportId: number) {
    return request<GeneratedReport>(`/api/reports/${reportId}`);
  },
};

export function listingsExportUrl(params: Record<string, string | number | undefined>) {
  return `${API_BASE}/api/listings/export${toQuery({ ...params, access_token: getAuthToken() })}`;
}

export function reportPdfUrl(reportId: number) {
  return `${API_BASE}/api/reports/${reportId}/export.pdf${toQuery({ access_token: getAuthToken() })}`;
}
