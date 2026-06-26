const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PLAYWRIGHT_PATH = path.join(ROOT, ".codex-run", "pw", "node_modules", "playwright");
const { chromium } = require(PLAYWRIGHT_PATH);

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const FRONTEND = argValue("--frontend", "http://127.0.0.1:5178");
const BACKEND = argValue("--backend", "http://127.0.0.1:5050");
const OUT_DIR = path.join(ROOT, "output", "playwright");
const RESULT_PATH = path.join(ROOT, ".codex-run", "ui_acceptance_result.json");

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(path.dirname(RESULT_PATH), { recursive: true });

async function loginToken() {
  const response = await fetch(`${BACKEND}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "swu@2026" }),
  });
  const payload = await response.json();
  if (!response.ok || payload.code !== 0) {
    throw new Error(`login api failed: ${JSON.stringify(payload)}`);
  }
  return payload.data.token;
}

async function api(token, pathName, options = {}) {
  const response = await fetch(`${BACKEND}${pathName}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const payload = await response.json();
  if (!response.ok || payload.code !== 0) {
    throw new Error(`${pathName} failed: ${JSON.stringify(payload)}`);
  }
  return payload.data;
}

async function fangTotal(token) {
  const data = await api(token, "/api/listings?source=fang&page=1&page_size=1");
  return data.pagination.total;
}

async function waitForTask(token, taskName) {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const data = await api(token, "/api/crawl/tasks");
    const task = data.items.find(item => item.name === taskName);
    if (task && !["running", "pending", "cancel_requested"].includes(task.status)) {
      return task;
    }
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  throw new Error(`task ${taskName} did not finish in time`);
}

async function createDuplicateTaskViaApi(token, name) {
  const created = await api(token, "/api/crawl/tasks", {
    method: "POST",
    body: JSON.stringify({
      name,
      source: "fang",
      districts: ["渝中"],
      max_pages: 1,
      max_workers: 1,
      mode: "manual",
      run_now: true,
    }),
  });
  return created;
}

async function main() {
  const token = await loginToken();
  const beforeTotal = await fangTotal(token);
  const beforeTasks = (await api(token, "/api/crawl/tasks")).pagination.total;
  const taskName = `UI去重验收-渝中1页-${Date.now()}`;
  const duplicateTaskName = `${taskName}-repeat`;
  const consoleErrors = [];
  const pageErrors = [];
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROME_EXECUTABLE || undefined,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 920 } });
  page.on("console", msg => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", err => pageErrors.push(err.message));

  try {
    await page.goto(FRONTEND, { waitUntil: "networkidle", timeout: 60000 });
    await page.getByRole("button", { name: /登\s*录/ }).click();
    await page.getByRole("heading", { name: "首页总览" }).waitFor({ timeout: 60000 });

    const topSearch = page.getByPlaceholder("搜索房源、区域...");
    await topSearch.fill("龙湖");
    await page.keyboard.press("Enter");
    await page.getByRole("heading", { name: "房源数据管理" }).waitFor({ timeout: 60000 });
    await page.getByPlaceholder("搜索标题、小区、地址、链接...").waitFor({ timeout: 30000 });
    const listingSearchValue = await page.getByPlaceholder("搜索标题、小区、地址、链接...").inputValue();
    if (listingSearchValue !== "龙湖") {
      throw new Error(`global search expected 龙湖, got ${listingSearchValue}`);
    }
    const topSearchAfterSubmit = await topSearch.inputValue();
    if (topSearchAfterSubmit !== "") {
      throw new Error(`top search should clear after submit, got ${topSearchAfterSubmit}`);
    }

    await topSearch.fill("龙湖");
    await page.keyboard.press("Enter");
    const listingSearchValue2 = await page.getByPlaceholder("搜索标题、小区、地址、链接...").inputValue();
    if (listingSearchValue2 !== "龙湖") {
      throw new Error(`repeat global search expected 龙湖, got ${listingSearchValue2}`);
    }

    await page.getByLabel("用户菜单").click();
    await page.getByText("退出登录").waitFor({ timeout: 30000 });
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "采集任务管理" }).click();
    await page.getByRole("heading", { name: "采集任务管理" }).waitFor({ timeout: 60000 });
    await page.getByRole("button", { name: /新建任务/ }).click();
    await page.getByRole("dialog").getByPlaceholder("例: 房天下渝中试采集").fill(taskName);
    await page.getByRole("dialog").getByPlaceholder("渝中,南岸").fill("渝中");
    const dialog = page.getByRole("dialog");
    await dialog.locator("input[type='number']").nth(0).fill("1");
    await dialog.locator("input[type='number']").nth(1).fill("1");
    await dialog.getByRole("button", { name: /创建任务|处理中/ }).click();
    await page.getByText(taskName).waitFor({ timeout: 120000 });
    const uiTask = await waitForTask(token, taskName);
    await page.getByRole("button", { name: /刷新/ }).click();
    await page.getByText(taskName).waitFor({ timeout: 30000 });
    const afterUiTotal = await fangTotal(token);
    if (uiTask.status !== "success") throw new Error(`crawl task status expected success, got ${uiTask.status}`);
    if (uiTask.failed_pages !== 0) throw new Error(`crawl task failed_pages expected 0, got ${uiTask.failed_pages}`);
    if (afterUiTotal - beforeTotal !== uiTask.inserted_count) {
      throw new Error(`listing delta ${afterUiTotal - beforeTotal} does not match inserted_count ${uiTask.inserted_count}`);
    }

    const duplicateTask = await createDuplicateTaskViaApi(token, duplicateTaskName);
    const afterDuplicateTotal = await fangTotal(token);
    if (duplicateTask.status !== "success") throw new Error(`duplicate task status expected success, got ${duplicateTask.status}`);
    if (duplicateTask.inserted_count !== 0) {
      throw new Error(`duplicate task expected inserted_count 0, got ${duplicateTask.inserted_count}`);
    }
    if (afterDuplicateTotal !== afterUiTotal) {
      throw new Error(`duplicate task changed total from ${afterUiTotal} to ${afterDuplicateTotal}`);
    }

    const crawlScreenshot = path.join(OUT_DIR, "crawl-ui-acceptance.png");
    await page.screenshot({ path: crawlScreenshot, fullPage: true });

    await page.getByRole("button", { name: "智能问答与报告" }).click();
    await page.getByPlaceholder("输入问题，例：近12月均价走势...").fill("帮我生成市场分析报告，说明当前样本量和整体均价");
    await page.keyboard.press("Enter");
    await page.getByText("query_market_stats").waitFor({ timeout: 120000 });
    await page.getByText("generate_report").waitFor({ timeout: 120000 });
    await page.getByText("报告 #").waitFor({ timeout: 30000 });
    const agentScreenshot = path.join(OUT_DIR, "agent-ui-acceptance.png");
    await page.screenshot({ path: agentScreenshot, fullPage: true });

    const agentResponse = await api(token, "/api/agent/chat", {
      method: "POST",
      body: JSON.stringify({ session_id: "api-acceptance", question: "重庆整体均价和样本量是多少？" }),
    });
    const toolNames = agentResponse.tool_calls.map(call => call.tool_name);
    if (!toolNames.includes("query_market_stats")) {
      throw new Error(`agent api did not call query_market_stats: ${toolNames.join(",")}`);
    }
    if (!agentResponse.answer.includes("关键证据")) {
      throw new Error("agent answer missing 关键证据 section");
    }
    if (pageErrors.length) {
      throw new Error(`page errors: ${pageErrors.join("\n")}`);
    }

    const result = {
      ok: true,
      frontend: FRONTEND,
      backend: BACKEND,
      beforeTotal,
      afterUiTotal,
      afterDuplicateTotal,
      beforeTasks,
      uiTask: {
        id: uiTask.id,
        name: uiTask.name,
        status: uiTask.status,
        total_found: uiTask.total_found,
        inserted_count: uiTask.inserted_count,
        updated_count: uiTask.updated_count,
        unchanged_count: uiTask.unchanged_count,
        failed_pages: uiTask.failed_pages,
      },
      duplicateTask: {
        id: duplicateTask.id,
        status: duplicateTask.status,
        inserted_count: duplicateTask.inserted_count,
        unchanged_count: duplicateTask.unchanged_count,
        failed_pages: duplicateTask.failed_pages,
      },
      search: { listingSearchValue, listingSearchValue2, topSearchAfterSubmit },
      userMenu: "退出登录 visible",
      agentUi: { checkedTools: ["query_market_stats", "generate_report"] },
      agentApi: {
        model: agentResponse.model,
        toolNames,
        answerPreview: agentResponse.answer.slice(0, 180),
      },
      screenshots: { crawlScreenshot, agentScreenshot },
      consoleErrors,
      pageErrors,
    };
    fs.writeFileSync(RESULT_PATH, JSON.stringify(result, null, 2), "utf-8");
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  const result = { ok: false, error: error.stack || error.message };
  fs.writeFileSync(RESULT_PATH, JSON.stringify(result, null, 2), "utf-8");
  console.error(error);
  process.exit(1);
});
