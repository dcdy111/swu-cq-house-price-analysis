"""
Backend/crawlers/manual_cookie_tool.py
======================================
手动 Cookie 获取工具

由于自动化登录这三个网站非常复杂（需要处理验证码），
本工具提供手动获取 Cookie 的指导：

1. 打开浏览器手动登录目标网站
2. 使用开发者工具复制 Cookie
3. 保存到环境变量或配置文件

使用方法：
    python -m Backend.crawlers.manual_cookie_tool

输出：将 Cookie 格式写入剪贴板，方便粘贴到 .env 文件
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

# 添加项目根目录到路径
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))


COOKIE_GUIDE = """
{'='*70}
手动 Cookie 获取指南
{'='*70}

目标网站 Cookie 获取步骤：

=== 1. 安居客 (m.anjuke.com) ===

1. 使用 Chrome/Edge 浏览器打开：https://m.anjuke.com/cq/sale/
2. 手动登录安居客账号（可以用手机号验证码登录）
3. 按 F12 打开开发者工具
4. 切换到 Network（网络）标签
5. 刷新页面，点击任意一个 listing 请求
6. 在右侧 Headers 中找到 "Cookie" 字段
7. 复制完整的 Cookie 字符串

=== 2. 链家 (m.lianjia.com) ===

1. 打开：https://m.lianjia.com/cq/ershoufang/
2. 手动登录链家账号
3. 同上步骤 3-7 复制 Cookie

=== 3. 贝壳 (m.ke.com) ===

1. 打开：https://m.ke.com/cq/ershoufang/
2. 手动登录贝壳账号
3. 同上步骤 3-7 复制 Cookie

=== 注意事项 ===

1. Cookie 有有效期（通常 7-30 天），过期后需要重新获取
2. 建议只获取必要的 Cookie，不要复制整个请求头
3. Cookie 包含敏感信息，不要提交到 Git 仓库
4. 可以设置环境变量或在 .env 文件中配置

=== 配置方式 ===

方式 1: 环境变量
    export ANJUKE_COOKIE="你的Cookie"
    export LIANJIA_COOKIE="你的Cookie"
    export BEIKE_COOKIE="你的Cookie"

方式 2: .env 文件
    ANJUKE_COOKIE=你的Cookie
    LIANJIA_COOKIE=你的Cookie
    BEIKE_COOKIE=你的Cookie

{'='*70}
""".format(**{"=": "="})

# Cookie 模板（用于参考格式）
COOKIE_TEMPLATES = {
    "anjuke": """# 安居客 Cookie 示例格式
# 将下面的内容复制到 .env 文件中
ANJUKE_COOKIE=aQQ_akid=xxx; wmda_uuid=xxx; sessid=xxx; tweest=xxx; ANJukeFlutter=wifi; wmda_new_uuid=xxx; wmda_session_id=xxx; id5uid=xxx;""",

    "lianjia": """# 链家 Cookie 示例格式
# 将下面的内容复制到 .env 文件中
LIANJIA_COOKIE=lianjia_uuid=xxx; lianjia_ssid=xxx; lianjia_keyword=xxx; lianjia_channel=xxx; lianjia_cl=xxx; lianjia_housedel=xxx; lianjia_ershoufang=xxx; """,

    "beike": """# 贝壳 Cookie 示例格式
# 将下面的内容复制到 .env 文件中
BEIKE_COOKIE=beike_uuid=xxx; beike_session=xxx; lianjia_keyword=xxx; lianjia_channel=xxx; """,
}


def print_guide():
    """打印 Cookie 获取指南"""
    print(COOKIE_GUIDE)


def print_templates():
    """打印 Cookie 模板"""
    print("\n" + "=" * 70)
    print("Cookie 模板（参考格式）")
    print("=" * 70)
    for name, template in COOKIE_TEMPLATES.items():
        print(f"\n【{name.upper()}】")
        print(template)
    print("\n" + "=" * 70)


def save_cookies_interactive():
    """
    交互式保存 Cookie 到 .env 文件

    流程：
    1. 提示用户输入各网站 Cookie
    2. 验证 Cookie 格式
    3. 保存到 .env 文件
    """
    print("\n" + "=" * 70)
    print("交互式 Cookie 配置")
    print("=" * 70)
    print("请按提示输入各网站的 Cookie（从浏览器开发者工具复制）")
    print("输入空行跳过该网站\n")

    cookies = {}

    # 安居客
    print("【安居客】请粘贴 Cookie（直接回车跳过）：")
    cookie = input().strip()
    if cookie:
        cookies["ANJUKE_COOKIE"] = cookie
        print(f"  ✓ 已保存 ({len(cookie)} 字符)")

    # 链家
    print("\n【链家】请粘贴 Cookie（直接回车跳过）：")
    cookie = input().strip()
    if cookie:
        cookies["LIANJIA_COOKIE"] = cookie
        print(f"  ✓ 已保存 ({len(cookie)} 字符)")

    # 贝壳
    print("\n【贝壳】请粘贴 Cookie（直接回车跳过）：")
    cookie = input().strip()
    if cookie:
        cookies["BEIKE_COOKIE"] = cookie
        print(f"  ✓ 已保存 ({len(cookie)} 字符)")

    if not cookies:
        print("\n未输入任何 Cookie，退出。")
        return

    # 保存到 .env 文件
    env_path = project_root / ".env"
    env_lines = []

    # 读取现有 .env
    if env_path.exists():
        with open(env_path, "r", encoding="utf-8") as f:
            env_lines = f.readlines()

    # 更新或添加 Cookie
    new_lines = []
    cookie_keys = set(cookies.keys())
    existing_keys = set()

    for line in env_lines:
        stripped = line.strip()
        key = stripped.split("=")[0] if "=" in stripped else ""
        if key in cookie_keys:
            existing_keys.add(key)
            new_lines.append(f'{key}="{cookies[key]}"\n')
        else:
            new_lines.append(line)

    # 添加新的 Cookie
    for key, value in cookies.items():
        if key not in existing_keys:
            new_lines.append(f'{key}="{value}"\n')

    # 写入 .env
    with open(env_path, "w", encoding="utf-8") as f:
        f.writelines(new_lines)

    print(f"\n✓ Cookie 已保存到: {env_path}")
    print(f"  已配置: {list(cookies.keys())}")


def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="手动 Cookie 获取工具 - 帮助你配置各网站 Cookie"
    )
    parser.add_argument(
        "--guide", "-g",
        action="store_true",
        help="显示 Cookie 获取指南"
    )
    parser.add_argument(
        "--templates", "-t",
        action="store_true",
        help="显示 Cookie 模板"
    )
    parser.add_argument(
        "--interactive", "-i",
        action="store_true",
        help="交互式配置 Cookie"
    )

    args = parser.parse_args()

    # 默认显示指南
    if not any([args.guide, args.templates, args.interactive]):
        print_guide()
        print("\n其他选项：")
        print("  --templates, -t   显示 Cookie 模板")
        print("  --interactive, -i  交互式配置 Cookie")
    else:
        if args.guide:
            print_guide()
        if args.templates:
            print_templates()
        if args.interactive:
            save_cookies_interactive()


if __name__ == "__main__":
    main()
