 <div align="center">

<img src="./docs/logo.svg" alt="TokenTracker ZzH" width="132" />

# TokenTracker ZzH

**이것은 [xiufengsun/TokenTracker](https://github.com/xiufengsun/TokenTracker)의 개인 커스텀 빌드입니다** —— 같은 트래커에 자체 서버로 옮긴 백엔드, 기본 펫 ZzH, OAuth 제거, 독자적인 딥링크·포트·아이콘을 적용해 원본과 나란히 설치할 수 있습니다.

[English](./README.en.md) · [简体中文](./README.md) · [日本語](./README.ja.md) · **한국어** · [Deutsch](./README.de.md)

### 모든 AI 토큰을 추적하고, 사용량을 눈에 보이게

**39종의 AI 코딩 도구**의 토큰 사용량과 비용을 정확하게, 로컬 우선으로 보여주는 대시보드. 데스크톱 펫, 네이티브 위젯, 그리고 **완전히 내 것인** 셀프호스팅 클라우드까지.

<img src="./docs/screenshots/zzh-dashboard.png" alt="Dashboard" width="880" />

---

## 이 커스텀 빌드에서 바꾼 것

원본은 이미 완성된 제품입니다. 이건 그것을 개인 용도로 고친 빌드이고, 아래가 그 차이 전부입니다.

| | 변경 |
|---|---|
| ☁️ **자체 백엔드** | 동기화·기기 간 계정 뷰·리더보드가 원본의 호스팅 서비스가 아니라 제 서버를 향합니다. CLI의 **기본 백엔드 URL**도 원작자의 것이었는데 바꿨습니다. |
| 🔑 **OAuth 제거** | 로그인은 이메일 + 비밀번호만. 서버의 OAuth 프로바이더 슬롯은 모두 비어 있고, UI의 프로바이더 버튼도 삭제했습니다(눌러도 실패하는 버튼을 남기지 않음). |
| 🐾 **ZzH** | 분홍 글자에 흰 배경인 "Z" 마크와 새 기본 펫(v2 스프라이트 아틀라스)으로 원본의 검은 번개와 Clawd를 교체했습니다. 트레이, 작업 표시줄, favicon, 대시보드 전부. |
| 🔗 **스킴·포트 충돌 제거** | 딥링크는 `ttzzh://`(원본은 `tokentracker://`), CLI 포트는 **17890**(원본 7680), 설치 프로그램 식별자도 별도. 원본 사이트에서 "앱에서 열기"를 눌러도 원본이 열릴 뿐 이 앱으로 오지 않습니다. |
| 🧩 **어댑터당 여러 계정** | Limits 페이지에서 같은 프로바이더에 여러 로그인을 등록할 수 있고, 각자 자기 키와 플랜을 가집니다. |
| 💰 **모델 가격 보강** | DeepSeek V4.1 Flash와 그 별칭들을 V4 Flash와 같은 요금으로 계산(원래는 $0). 비피크 반값도 적용. |
| 📉 **비용 버그 2건 수정** | 상세 모달이 "모델 집계"에 대해 과금해서 DeepSeek 토큰이 전부 피크 요금(헤드라인의 약 1.7배)으로 계산되던 문제. |
| 🐟 **DeepSeek Harness 별도 집계** | 원본은 `dsh`를 "Other"에 섞었습니다. 리더보드 전용 열(아이콘 포함), 상세 모달의 provider 내역, 그리고 **세션 목록**에서도 수집되어 전용 필터로 볼 수 있습니다. |
| 🤖 **AstrBot 별도 집계** | AstrBot의 데이터베이스를 자동으로 찾아(런처 인스턴스, `ASTRBOT_ROOT`, 데스크톱 빌드, `~/.astrbot`) 호출별 Token·모델·대화를 따로 집계합니다. 리더보드에 전용 열(공식 아이콘 포함)이 생기고 "Other"에 섞이지 않으며, 세션 목록에도 표시됩니다. 경로가 특수하거나 컨테이너에서 실행 중이면 환경 변수로 지정하세요. |
| 🎮 **OpenBitFun 별도 집계** | 데이터 디렉터리(`~/.openbitfun`)를 자동으로 찾아 호출별 Token·모델·대화를 따로 집계합니다. 리더보드에 전용 열(공식 아이콘 포함)이 생기고 세션 목록에도 표시됩니다. 주의: 기록에 **캐시 Token 구분이 없어** 캐시 적중분도 신규 입력으로 계산되어 비용이 높게 나옵니다. 경로가 특수하면 `TOKENTRACKER_OPENBITFUN_DIR`로 지정하세요. |
| 🔄 **로그인 시 전체 업로드** | 계정이나 백엔드를 바꾼 뒤 첫 동기화는 로컬 큐 전체를 **한 번에** 보냅니다(15분마다 1000줄씩이 아니라). 이후에는 증분만 전송합니다. |
| 🖼️ **아바타는 이미지 URL** | OAuth가 없으니 플랫폼 아바타도 없습니다. 설정에서 이미지 링크를 붙여 넣으면 헤더·사이드바·리더보드가 함께 사용합니다. 링크는 캐시되어 새로고침은 즉시, 변경도 바로 반영됩니다. |
| 🧹 **로컬 캐시 삭제** | 설정 → 계정에 원클릭 삭제 버튼이 있습니다. 리더보드 기간·커뮤니티 통계 캐시를 지우고 자동으로 새로고침합니다. |

---

## 스크린샷

| Limits —— 어댑터당 여러 계정 | 세션 |
|---|---|
| <img src="./docs/screenshots/zzh-limits.png" alt="Limits" width="440" /> | <img src="./docs/screenshots/zzh-sessions.png" alt="Sessions" width="440" /> |

| Skills | 업적 |
|---|---|
| <img src="./docs/screenshots/zzh-skills.png" alt="Skills" width="440" /> | <img src="./docs/screenshots/zzh-achievements.png" alt="업적" width="440" /> |

| 데스크톱 펫 | |
|---|---|
| <img src="./docs/screenshots/zzh-pet.png" alt="펫" width="440" /> | |

---

## 이 fork가 추가한 세 가지 업적

셋 다 **해당 모델에서 쓴 Token 합계**로 결정됩니다(브론즈 1 Token / 실버 1억 / 골드 10억 / 다이아 100억, 매시간 재계산).

| <img src="./docs/screenshots/zzh-badge-oracle.png" alt="오라클 (Oracle)" width="150" /> | <img src="./docs/screenshots/zzh-badge-mortal-frame.png" alt="필부의 몸, 신에 비견되다 (Mortal Frame)" width="150" /> |
|---|---|
| **오라클 (Oracle)** | **필부의 몸, 신에 비견되다 (Mortal Frame)** |
| GPT-6 Astra에서 Token을 소비합니다. | 모든 DeepSeek 모델에서 Token을 소비합니다. |

### 또 하나의 업적

| <img src="./docs/screenshots/zzh-badge-root-of-all-evil.png" alt="Root of All Evil" width="150" /> |
|---|
| **만악의 근원 (Root of All Evil)** |
| GPT-3.5 시리즈에서 Token을 소비합니다. |

---

## 어댑터 하나에 여러 계정

기존에는 프로바이더마다 **계정 하나**(로컬 CLI가 로그인한 그 계정)만 추적했습니다. 회사 계정과 개인 계정을 함께 쓰거나, 플랜이 다른 API 키 두 개를 쓸 때는 부족합니다.

`~/.tokentracker/tracker/config.json`에 추가하세요:

```json
{
  "limits": {
    "accounts": [
      { "id": "commandcode-goat", "provider": "commandCode",
        "label": "CommandCode GOAT", "plan": "GOAT", "apiKey": "user_..." },
      { "id": "commandcode-go", "provider": "commandCode",
        "label": "CommandCode Go", "plan": "Go", "apiKey": "user_..." },
      { "id": "kimi-work", "provider": "kimi",
        "label": "Kimi (회사)", "plan": "Moonshot", "apiKey": "sk-..." },
      { "id": "codex-alt", "provider": "codex",
        "label": "Codex (부계정)", "home": "~/.codex-work" }
    ]
  }
}
```

각 항목은 독립된 카드가 됩니다 —— 자기 라벨, 자기 플랜 배지, 자기 쿼터 창과 리셋 시각. 어댑터마다 인증 방식이 달라서 모드가 두 가지입니다:

- **`apiKey`** —— 쿼터 API가 명시적 키를 받는 어댑터. 현재 **kimi**, **opencodeGo**, **commandCode** 지원. 키가 로컬 CLI 자격 증명 조회를 완전히 대체합니다.
- **`home`** —— 로컬 CLI 세션으로 인증하는 어댑터. 두 번째 계정 = 두 번째 프로필 디렉터리입니다. 그 디렉터리에서 해당 도구의 환경 변수(`CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `GEMINI_HOME`, `KIMI_HOME`)로 로그인한 뒤 계정을 그쪽으로 지정하세요.

둘 다 불가능한 어댑터는 "이 어댑터의 한도는 로컬 CLI 로그인에서 가져옵니다"라고 명시합니다. 내장 계정 숫자를 라벨만 바꿔 두 번 보여주지 않습니다. ZCode가 의도적으로 그중 하나입니다(엔드포인트와 플랜 종류가 로컬 설치에서만 나옵니다).

---

## 설치와 실행

**Node.js 20 이상** 필요.

```bash
git clone https://github.com/WONGIII/TokenTrackerZzH.git
cd TokenTrackerZzH
node bin/tracker.js            # 훅 설치, 동기화, 대시보드 열기
```

대시보드는 http://localhost:17890 에서 제공됩니다 . Windows 트레이 앱은 TokenTrackerWin/에서 빌드합니다(절차는 MODIFICATIONS.md). 원본 앱과 나란히 설치됩니다(%LOCALAPPDATA%\Programs\TokenTrackerZzH).

npm에 올라가 있지 않습니다. npx tokentracker-cli는 원본 패키지를 설치합니다. 저장소나 릴리스 첨부를 사용하세요.

---

## 동기화는 선택 사항

로그인은 **완전히 선택**이며, 계정이 없으면 원본과 똑같이 전부 로컬입니다.

**로그인 시 전송:** 시간 단위 사용 버킷(`hour_start`, `source`, `model`, 5개 토큰 열, `total_tokens`, `conversation_count`)과 기기 등록 시의 머신 ID.

**절대 전송하지 않음:** 프롬프트, 응답, 파일 내용, 프로젝트·저장소 이름, 파일 경로, 프로바이더 자격 증명. 프로젝트별·세션별 파일(`project.queue.jsonl`, `session.queue.jsonl`)은 업로드하지 않습니다.

### 이 빌드가 여전히 통신하는 서드파티

원본의 인프라는 하나도 없습니다:

| 서비스 | 시점 | 내용 |
|---|---|---|
| 각 AI 프로바이더 자체 API(Anthropic, OpenAI, Cursor, Google, GitHub Copilot, xAI, Kimi, Z.ai, Qoder, Devin, CommandCode, iFlytek, TRAE) | 한도 바가 보이는 동안 | 이미 있는 자격 증명으로 **내** 쿼터를 읽습니다. 내 기기에서 프로바이더로 직결, 중간자 없음 |
| `raw.githubusercontent.com` | 하루 최대 1회 | 공개 LiteLLM 가격표(단방향 다운로드) |
| `api.github.com` | 대시보드 로드 시 | 이 저장소의 star 수 |
| `codex-pets.net` | 펫을 가져올 때만 | 선택한 펫 id |
| `open.er-api.com` | USD 외 통화를 고를 때만 | 요청 자체뿐 |
| `ip.net.coffee`, `claude.ai`, `1.1.1.1` | IP 확인 페이지에서만 | 그 페이지의 목적이 내 IP를 보는 것 |
| 각사 상태 페이지 | 서비스 상태 페이지에서만 | 요청 자체뿐 |
| `fonts.googleapis.com` | 공유 이미지 생성 시에만 | 표준 웹폰트 요청 |

**분석 서비스는 없습니다.** PostHog 키는 비어 있고, 익명 설치 하트비트는 이제 **내** 서버로 갑니다(`TOKENTRACKER_NO_TELEMETRY=1`로 끌 수 있습니다).

---

## 크레딧과 라이선스

원본과 같은 MIT. 원래 `LICENSE`(Copyright (c) 2026 xiufengsun)는 그대로 유지하며, 변경 사항은 모두 [`MODIFICATIONS.md`](./MODIFICATIONS.md)에 정리했습니다. 이 빌드는 원본의 보증을 받지 않았고 업스트림에 기여하지도 않았습니다.

- 원본: **[xiufengsun/TokenTracker](https://github.com/xiufengsun/TokenTracker)** —— 실제 제품, 39개 프로바이더, 원래 대시보드
- 백엔드: **[InsForge](https://github.com/InsForge/InsForge)** —— 셀프호스팅 BaaS
- 가격 데이터: **[LiteLLM](https://github.com/BerriAI/litellm)** —— 업스트림 가격표
