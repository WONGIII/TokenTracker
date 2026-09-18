 <div align="center">

<img src="./docs/logo.svg" alt="TokenTracker ZzH" width="132" />

# TokenTracker ZzH

**这是我自己特调版的 [xiufengsun/TokenTracker](https://github.com/xiufengsun/TokenTracker)** —— 同一个追踪器，加了我要的东西：后端换成我自己的服务器、默认桌宠换成 ZzH、去掉 OAuth，并且有独立的深链接协议、端口和图标，可以和原版装在同一台机器上互不干扰。

[English](./README.en.md) · **简体中文** · [日本語](./README.ja.md) · [한국어](./README.ko.md) · [Deutsch](./README.de.md)

### 跨所有 CLI，看清你到底在 AI 上花了多少钱

自动采集 **39 款 AI 编码工具** 的 token 用量，全程本地聚合，用一套漂亮的 Dashboard 看真实成本与趋势。外加桌面宠物、原生小组件，云端同步走的是我自己的服务器。

<img src="./docs/screenshots/zzh-dashboard.png" alt="Dashboard" width="880" />

---

## 这个特调版改了什么

上游本身是个成品，这是我基于它做的个人版本。以下是全部差异。

| | 改动 |
|---|---|
| ☁️ **换成我的后端** | 数据同步、跨端账号视图、排行榜走我自己的服务器，不再是原项目的托管服务；CLI 的**默认后端地址**原本指向上游，现在也改了。 |
| 🔑 **去掉 OAuth** | 登录页只保留邮箱 + 密码。服务端 7 个 OAuth 槽位全空，界面上的第三方登录按钮也直接删掉了（而不是留着点了报错）。 |
| 🐾 **ZzH** | 粉字白底的「Z」标记 + 新的默认桌宠（v2 图集），替换掉上游的黑色闪电和 Clawd 形象——托盘、任务栏、favicon、Dashboard 全部换掉。 |
| 🔗 **不再抢协议和端口** | 深链接协议改成 `ttzzh://`（原版是 `tokentracker://`），CLI 端口改成 **17890**（原版 7680），安装包也是独立标识——所以别人在原版官网点「在 app 内打开」，只会打开原版，不会跳到我们这里。 |
| 🧩 **同一适配器多账号** | 限额页可以给同一个 provider 配多个登录，每个有自己的 key 和套餐。见下文。 |
| 💰 **补齐模型价格** | DeepSeek V4.1 Flash 及其各种别名按 V4 Flash 的价格计费（原本是 $0），并且享受闲时半价。 |
| 📉 **修掉两个成本 bug** | 详情弹窗原本按「模型聚合」计价，把每个 DeepSeek token 都按峰时价算，比外面显示的高约 1.7 倍。 |
| 🐟 **DeepSeek Harness 单独统计** | 上游把 `dsh` 混进 "Other" —— 排行榜单独给一列（带图标），详情弹窗的 provider 分项也单列；**会话列表**同样收录并可按它筛选。 |
| 🤖 **AstrBot 单独统计** | 自动找到 AstrBot 的数据库（启动器实例、`ASTRBOT_ROOT`、桌面版、`~/.astrbot` 都认），每次调用的 token、模型、会话单独统计，排行榜给它单独一列（带官方图标），不再混进 "Other"；会话列表同样收录。路径自定义或跑在容器里时，用环境变量指过去即可。 |
| 🔄 **登录即全量重传** | 换账号或换后端后，第一次同步会把整个本地队列**一次传完**（不是每 15 分钟传 1000 行慢慢爬），之后才走增量。 |
| 🖼️ **头像用图片 URL** | 没有 OAuth 就没有平台头像，改成在设置里填一个图片链接，顶部、侧边栏、排行榜共用同一个。链接会被缓存——刷新秒开，改完立刻生效。 |
| 🧹 **可以清本地缓存** | 设置 → 账户里有一键清理：排行榜周期、社区统计这些缓存在本地的数据，清完自动重载。 |

---

## 截图

| 限额 —— 同一适配器多账号 | 会话 |
|---|---|
| <img src="./docs/screenshots/zzh-limits.png" alt="限额" width="440" /> | <img src="./docs/screenshots/zzh-sessions.png" alt="会话" width="440" /> |

| Skills | 成就 |
|---|---|
| <img src="./docs/screenshots/zzh-skills.png" alt="Skills" width="440" /> | <img src="./docs/screenshots/zzh-achievements.png" alt="成就" width="440" /> |

| 桌面宠物 | |
|---|---|
| <img src="./docs/screenshots/zzh-pet.png" alt="宠物" width="440" /> | |

---

## 这个版本自带的三个成就

三枚徽章是为这个 fork 加的，判定的是**在这些模型上花掉的 Token 总量**，档位都是「青铜 1 Token / 白银 1 亿 / 黄金 10 亿 / 钻石 100 亿」，每小时重算一次。

### 神谕

<img src="./docs/screenshots/zzh-badge-oracle.png" alt="神谕" width="150" align="right" />

**解锁条件：在 GPT-6 Astra 上消耗 Token。**

> 你以 API 账单为香火，以 Prompt 为祷词，向云端之神求问。神以 Token 降下神谕，你以余额献上祭品。每一次调用，都是一次昂贵的降神；每一次回答，都是神在账单上签名。

<br clear="right" />

### 凡人之躯，比肩神明

<img src="./docs/screenshots/zzh-badge-mortal-frame.png" alt="凡人之躯，比肩神明" width="150" align="right" />

**解锁条件：在任意 DeepSeek 模型上消耗 Token。**

> 有人说，神在天上，人在泥里，智慧是标了价的奢侈品，凡人只配得到敷衍的回音。可你偏要试。你向那个没有神号的「凡人」发出请求——它没有殿堂，没有颂歌，也不漫天要价；它只是睁开眼，把答案递回。它不够高高在上，却足够认真；它没有降下雷霆，却点亮了一盏灯。你忽然明白，比肩神明不是它成了神，而是你不再需要跪着求神。于是你写下：凡人之躯，比肩神明。


### 万恶之源

<img src="./docs/screenshots/zzh-badge-root-of-all-evil.png" alt="万恶之源" width="150" align="right" />

**解锁条件：在 GPT-3.5 系列模型上消耗 Token。**

> 在算力纪元的黎明之前，它悄然降临。没有雷霆，没有神谕，只有一句温顺的「你好」。正是这声问候，撕裂了硬件市场的平衡，点燃了显卡的星火，唤醒了内存的狂潮，让固态硬盘在需求的烈焰中化为灰烬。后世称之为——万恶之源。而你，曾与它对话。每一次调用，都是在原罪之书上签名；每一次响应，都是在算力星海投下涟漪。从此，等等党失去了黎明，装机者失去了预算，硅基文明迎来了第一次大涨价。

---

## 同一适配器，多个账号

原先每个 provider 只能跟踪**一个**账号——就是本地 CLI 当前登录的那个。如果你有工作号和个人号，或者两个不同套餐的 API key，这就不够用了。

在 `~/.tokentracker/tracker/config.json` 里加：

```json
{
  "limits": {
    "accounts": [
      { "id": "commandcode-goat", "provider": "commandCode",
        "label": "CommandCode GOAT", "plan": "GOAT", "apiKey": "user_..." },
      { "id": "commandcode-go", "provider": "commandCode",
        "label": "CommandCode Go", "plan": "Go", "apiKey": "user_..." },
      { "id": "kimi-work", "provider": "kimi",
        "label": "Kimi 工作号", "plan": "Moonshot", "apiKey": "sk-..." },
      { "id": "codex-alt", "provider": "codex",
        "label": "Codex 小号", "home": "~/.codex-work" }
    ]
  }
}
```

每一条都会渲染成独立卡片：自己的名字、自己的套餐标签、自己的配额窗口和重置时间。凭据有两种模式，因为适配器的工作方式并不一样：

- **`apiKey`** —— 该适配器的额度 API 接受显式 key。目前支持 **kimi**、**opencodeGo**、**commandCode**；key 会完全取代本地 CLI 的凭据查找。
- **`home`** —— 该适配器靠本地 CLI 的登录态取额度，所以「第二个账号」= 第二个配置目录。在那个目录里用该工具自己的环境变量登录（`CLAUDE_CONFIG_DIR`、`CODEX_HOME`、`GEMINI_HOME`、`KIMI_HOME`），再把账号指过去。

两种都做不到的适配器会明确显示「这个适配器的限额来自本地 CLI 登录态」，而不是悄悄把内置账号的数字换个标签再显示一遍。ZCode 就属于这一类：它的接口地址和套餐类型只能从本地安装里推出来。

---

## 安装与运行

需要 **Node.js ≥ 20**。

```bash
git clone https://github.com/WONGIII/TokenTrackerZzH.git
cd TokenTrackerZzH
node bin/tracker.js            # 安装 hook、同步数据、打开 Dashboard
```

Dashboard 跑在本地 http://localhost:17890 。Windows 托盘版从 TokenTrackerWin/ 构建，步骤见 MODIFICATIONS.md；它会和原版并存安装（%LOCALAPPDATA%\Programs\TokenTrackerZzH）。

没有发布到 npm。 npx tokentracker-cli 装的是上游的包，不是这个版本。请用仓库或 release 附件。

---

## 同步是可选的

登录**完全可选**——不登录就是纯本地，和上游一致。

**登录后会发送：** 按小时的用量桶——`hour_start`、`source`、`model`、五个 token 列、`total_tokens`、`conversation_count`——以及注册设备时的机器标识。

**永远不会发送：** 提示词、回复内容、文件内容、项目名/仓库名、文件路径、任何 provider 凭据。按项目和按会话的明细文件（`project.queue.jsonl`、`session.queue.jsonl`）从不上传。

### 这个版本仍会访问的第三方服务

下面没有一个属于上游的基础设施：

| 服务 | 时机 | 内容 |
|---|---|---|
| 各家 AI 厂商自己的 API（Anthropic、OpenAI、Cursor、Google、GitHub Copilot、xAI、Kimi、Z.ai、Qoder、Devin、CommandCode、讯飞、TRAE） | 只有限额条可见时 | 用你机器上已有的凭据读**你自己的**额度。从你的机器直连厂商，不经过中间人 |
| `raw.githubusercontent.com` | 每天最多一次 | 公开的 LiteLLM 价格表（单向下载） |
| `api.github.com` | Dashboard 加载时 | 本仓库的 star 数 |
| `codex-pets.net` | 只有你导入宠物时 | 你选择的宠物 id |
| `open.er-api.com` | 只有你选非美元货币时 | 只有请求本身 |
| `ip.net.coffee`、`claude.ai`、`1.1.1.1` | 只有打开 IP 检查页时 | 那个页面存在的意义就是看你的 IP |
| 各家状态页 | 只有打开服务状态页时 | 只有请求本身 |
| `fonts.googleapis.com` | 只有生成分享图时 | 标准字体请求 |

**没有任何分析服务**：PostHog 的 key 是空的；匿名安装心跳现在发给**我自己的**服务器（可以用 `TOKENTRACKER_NO_TELEMETRY=1` 关掉）。

---

## 致谢与许可

MIT，和上游一致。原始 `LICENSE`（Copyright (c) 2026 xiufengsun）原样保留，我做的所有改动都列在 [`MODIFICATIONS.md`](./MODIFICATIONS.md) —— 这个版本没有得到上游背书，也没有向上游回贡。

- 上游：**[xiufengsun/TokenTracker](https://github.com/xiufengsun/TokenTracker)** —— 真正的产品本体、39 家 provider、原始 Dashboard
- 后端：**[InsForge](https://github.com/InsForge/InsForge)** —— 自托管 BaaS
- 价格数据：**[LiteLLM](https://github.com/BerriAI/litellm)** —— 上游价格表
