 <div align="center">

<img src="./docs/logo.svg" alt="TokenTracker ZzH" width="132" />

# TokenTracker ZzH

**これは [xiufengsun/TokenTracker](https://github.com/xiufengsun/TokenTracker) の自分用カスタム版です** —— 同じトラッカーに、自前のサーバーへ切り替えたバックエンド、デフォルトペットの ZzH、OAuth なし、独自のディープリンク・ポート・アイコンを加えて、本家と共存できるようにしました。

[English](./README.en.md) · [简体中文](./README.md) · **日本語** · [한국어](./README.ko.md) · [Deutsch](./README.de.md)

### すべての AI トークンを可視化し、コストを現実のものに

**39 種類の AI コーディングツール**のトークン使用量とコストを正確に、ローカルファーストで可視化するダッシュボード。デスクトップペット、ネイティブウィジェット、そして**完全に自分のもの**であるセルフホスト型クラウド付き。

<img src="./docs/screenshots/zzh-dashboard.png" alt="Dashboard" width="880" />

---

## このカスタム版で変えたもの

本家はすでに完成した製品です。これはそれを自分用に作り替えたもので、以下がその差分のすべてです。

| | 変更点 |
|---|---|
| ☁️ **自前のバックエンド** | 同期・デバイス横断のアカウント表示・リーダーボードは、本家のホスト型サービスではなく自分のサーバーを向きます。CLI の**既定バックエンド URL** も本家のものだったので変更しました。 |
| 🔑 **OAuth を削除** | ログインはメール + パスワードのみ。サーバー側の OAuth プロバイダ枠はすべて空で、UI のプロバイダボタンも削除しました（押すと失敗するだけのボタンを残さない）。 |
| 🐾 **ZzH** | ピンク文字に白背景の「Z」マークと新しい既定ペット（v2 スプライトアトラス）で、本家の黒い稲妻と Clawd を置き換えました。トレイ、タスクバー、favicon、ダッシュボードすべて。 |
| 🔗 **スキームとポートの衝突回避** | ディープリンクは `ttzzh://`（本家は `tokentracker://`）、CLI ポートは **17890**（本家は 7680）、インストーラの識別子も別。本家サイトの「アプリで開く」を押しても本家が開き、こちらには来ません。 |
| 🧩 **アダプタごとに複数アカウント** | Limits ページで同じプロバイダに複数のログインを登録でき、それぞれ自分のキーとプランを持ちます。 |
| 💰 **モデル価格の追加** | DeepSeek V4.1 Flash とその別名を V4 Flash と同額で計上（従来は $0）。オフピーク半額も適用。 |
| 📉 **コスト計算のバグ修正 2 件** | 詳細モーダルが「モデル集計」に対して課金していたため、DeepSeek の全トークンがピーク料金（ヘッドラインの約 1.7 倍）で計算されていました。 |
| 🐟 **DeepSeek Harness を独立集計** | 本家は `dsh` を "Other" に混ぜていました。ランキングは専用列（アイコン付き）、詳細モーダルは provider 内訳で独立表示、**セッション一覧**も収録し専用フィルタで絞れます。 |
| 🤖 **AstrBot を個別に集計** | AstrBot のデータベースを自動で見つけ（ランチャーのインスタンス、`ASTRBOT_ROOT`、デスクトップ版、`~/.astrbot`）、呼び出しごとの Token・モデル・会話を個別に集計。リーダーボードには専用の列（公式アイコン付き）が付き、「Other」に混ざりません。セッション一覧にも出ます。パスが独自だったりコンテナ内で動いている場合は環境変数で指定できます。 |
| 🔄 **ログイン時に全量を一度で送信** | アカウントやバックエンドを変えた直後の初回同期は、ローカルキュー全体を**一度に**送信します（15 分ごとに 1000 行ずつではありません）。その後は差分のみ。 |
| 🖼️ **アバターは画像 URL** | OAuth がないためプラットフォームのアバターはありません。設定で画像リンクを貼ると、ヘッダー・サイドバー・ランキングで共通に使われます。リンクはキャッシュされ、再読み込みは即時、変更もすぐ反映されます。 |
| 🧹 **ローカルキャッシュを消去** | 設定 → アカウントにワンクリックの消去ボタン。ランキング期間やコミュニティ統計のキャッシュを削除し、自動で再読み込みします。 |

---

## スクリーンショット

| Limits —— アダプタごとの複数アカウント | セッション |
|---|---|
| <img src="./docs/screenshots/zzh-limits.png" alt="Limits" width="440" /> | <img src="./docs/screenshots/zzh-sessions.png" alt="Sessions" width="440" /> |

| Skills | 実績 |
|---|---|
| <img src="./docs/screenshots/zzh-skills.png" alt="Skills" width="440" /> | <img src="./docs/screenshots/zzh-achievements.png" alt="実績" width="440" /> |

| デスクトップペット | |
|---|---|
| <img src="./docs/screenshots/zzh-pet.png" alt="ペット" width="440" /> | |

---

## この fork が追加した 3 つの実績

いずれも**そのモデルで消費した Token の合計**で決まります（ブロンズ 1 Token / シルバー 1 億 / ゴールド 10 億 / ダイヤ 100 億、毎時再計算）。

| <img src="./docs/screenshots/zzh-badge-oracle.png" alt="神諭（Oracle）" width="150" /> | <img src="./docs/screenshots/zzh-badge-mortal-frame.png" alt="凡人之躯、比肩神明（Mortal Frame）" width="150" /> |
|---|---|
| **神諭（Oracle）** | **凡人之躯、比肩神明（Mortal Frame）**  |
| GPT-6 Astra で Token を消費する。 | 任意の DeepSeek モデルで Token を消費する。  | GPT-3.5 シリーズで Token を消費する。 |

### もう一つの実績

| <img src="./docs/screenshots/zzh-badge-root-of-all-evil.png" alt="Root of All Evil" width="150" /> |
|---|
| **万悪の源（Root of All Evil）** |
| GPT-3.5 シリーズで Token を消費する。 |

---

## 1 つのアダプタに複数アカウント

従来はプロバイダごとに**1 アカウント**（ローカル CLI がログインしているもの）しか追跡できませんでした。仕事用と個人用、あるいはプランの違う 2 つの API キーを使い分けていると足りません。

`~/.tokentracker/tracker/config.json` に追加します:

```json
{
  "limits": {
    "accounts": [
      { "id": "commandcode-goat", "provider": "commandCode",
        "label": "CommandCode GOAT", "plan": "GOAT", "apiKey": "user_..." },
      { "id": "commandcode-go", "provider": "commandCode",
        "label": "CommandCode Go", "plan": "Go", "apiKey": "user_..." },
      { "id": "kimi-work", "provider": "kimi",
        "label": "Kimi（仕事用）", "plan": "Moonshot", "apiKey": "sk-..." },
      { "id": "codex-alt", "provider": "codex",
        "label": "Codex（サブアカウント）", "home": "~/.codex-work" }
    ]
  }
}
```

各エントリは独立したカードになります —— 独自のラベル、プランバッジ、クォータウィンドウ、リセット時刻。認証方式はアダプタによって違うため 2 モードあります:

- **`apiKey`** —— クォータ API が明示的なキーを受け付けるアダプタ。現在 **kimi**、**opencodeGo**、**commandCode** に対応。キーはローカル CLI の資格情報探索を完全に置き換えます。
- **`home`** —— ローカル CLI のセッションで認証するアダプタ。2 つ目のアカウント = 2 つ目のプロファイルディレクトリです。そのディレクトリで各ツールの環境変数（`CLAUDE_CONFIG_DIR`、`CODEX_HOME`、`GEMINI_HOME`、`KIMI_HOME`）を使ってログインし、アカウントをそこに向けます。

どちらも使えないアダプタは「このアダプタの上限はローカルの CLI ログインから取得します」と明示します。内蔵アカウントの数値を別ラベルで二重に見せることはしません。ZCode は意図的にその 1 つです（エンドポイントとプラン種別がローカルインストールからしか分からないため）。

---

## インストールと実行

**Node.js 20 以上**が必要です。

```bash
git clone https://github.com/WONGIII/TokenTrackerZzH.git
cd TokenTrackerZzH
node bin/tracker.js            # フックを導入し、同期し、ダッシュボードを開く
```

ダッシュボードは http://localhost:17890 で配信されます 。Windows トレイアプリは TokenTrackerWin/ からビルドします（手順は MODIFICATIONS.md）。本家アプリと並んでインストールされます（%LOCALAPPDATA%\Programs\TokenTrackerZzH）。

npm には公開していません。 npx tokentracker-cli は本家のパッケージを入れてしまいます。リポジトリかリリース添付を使ってください。

---

## 同期は任意

サインインは**完全に任意**で、アカウントなしなら本家と同じく完全ローカルです。

**サインイン時に送信:** 時間単位の使用バケット（`hour_start`、`source`、`model`、5 つのトークン列、`total_tokens`、`conversation_count`）と、デバイス登録時のマシン ID。

**送信しないもの:** プロンプト、応答、ファイル内容、プロジェクト名・リポジトリ名、ファイルパス、プロバイダの資格情報。プロジェクト別・セッション別のファイル（`project.queue.jsonl`、`session.queue.jsonl`）はアップロードしません。

### このビルドが依然として通信する第三者サービス

本家のインフラは 1 つも含まれていません:

| サービス | タイミング | 内容 |
|---|---|---|
| 各 AI プロバイダ自身の API（Anthropic、OpenAI、Cursor、Google、GitHub Copilot、xAI、Kimi、Z.ai、Qoder、Devin、CommandCode、iFlytek、TRAE） | 上限バーが表示されている間 | お使いのマシンにある資格情報で**あなたの**クォータを読むだけ。マシンからプロバイダへ直結し、中間業者はなし |
| `raw.githubusercontent.com` | 1 日 1 回まで | 公開 LiteLLM 価格表（ダウンロードのみ） |
| `api.github.com` | ダッシュボード読み込み時 | このリポジトリの star 数 |
| `codex-pets.net` | ペットを読み込むときだけ | 選んだペット ID |
| `open.er-api.com` | 米ドル以外の通貨を選んだときだけ | リクエストそのもののみ |
| `ip.net.coffee`、`claude.ai`、`1.1.1.1` | IP チェックページのみ | あなたの IP を見ることがそのページの目的 |
| 各社ステータスページ | サービスステータスページのみ | リクエストそのもののみ |
| `fonts.googleapis.com` | 共有画像の生成時のみ | 標準的な Web フォント要求 |

**解析サービスはありません**。PostHog のキーは空で、匿名のインストール heartbeat は**自分の**サーバーに送られます（`TOKENTRACKER_NO_TELEMETRY=1` で無効化できます）。

---

## クレジットとライセンス

本家と同じ MIT。元の `LICENSE`（Copyright (c) 2026 xiufengsun）はそのまま保持し、変更点はすべて [`MODIFICATIONS.md`](./MODIFICATIONS.md) に記載しています。このビルドは本家に承認されておらず、コントリビュートもしていません。

- 本家: **[xiufengsun/TokenTracker](https://github.com/xiufengsun/TokenTracker)** —— 製品本体、39 プロバイダ、元のダッシュボード
- バックエンド: **[InsForge](https://github.com/InsForge/InsForge)** —— セルフホスト型 BaaS
- 価格データ: **[LiteLLM](https://github.com/BerriAI/litellm)** —— 上流の価格表
