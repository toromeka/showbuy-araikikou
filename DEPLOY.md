# デプロイ手順（複数人でのテスト向け）

このドキュメントは、`app/`（Next.jsアプリ本体）と `schema.sql`（DBスキーマ）を
クラウド上にデプロイし、複数人で同時にアクセスしてテストするための手順です。

## なぜCloudflareではないのか

このアプリはPDF出力（納品書・見積書・請求書）にPlaywright（Chromiumをサーバー上で
実際に起動する方式）を使っています。Cloudflare Workers/PagesはNode.jsそのものではない
別ランタイムで動作しており、標準的なPlaywrightでのヘッドレスブラウザ起動に対応していません。
そのため、ここでは「Dockerを使える」「PostgreSQLを簡単に用意できる」ホスティング先を前提にしています。

## おすすめ: Railway

GitHub連携での自動デプロイ・PostgreSQLアドオン・Dockerビルド、すべてが揃っており、
個人の複数人テスト用途には一番手早い選択肢です。Render・Fly.ioでも同様の手順で動きます
（いずれもDockerfileベースのデプロイに対応しています）。

### 1. GitHubリポジトリを用意する

このプロジェクト一式（`app/` と `schema.sql`）をGitHubリポジトリにpushしてください。
手元の端末で以下を実行します（このリポジトリを展開したフォルダの直下で）。

```bash
git init -b main
git add -A
git commit -m "Initial commit"
```

その後、GitHubで空のリポジトリを作成し（Web UIの「New repository」。READMEなどは追加しない）、
表示される案内に従って以下のようにpushしてください。

```bash
git remote add origin https://github.com/<あなたのアカウント>/<リポジトリ名>.git
git push -u origin main
```

`gh` コマンド（GitHub CLI）がインストール・ログイン済みであれば、次の1行でリポジトリ作成とpushを
まとめて行えます。

```bash
gh repo create <リポジトリ名> --private --source=. --remote=origin --push
```

### 2. Railwayプロジェクトを作成する

1. https://railway.app にアクセスし、GitHubアカウントでサインアップ/ログイン
2. 「New Project」→「Deploy from GitHub repo」→ 先ほどpushしたリポジトリを選択
3. サービスの設定画面で **Root Directory を `app` に設定**（このリポジトリは `app/` フォルダに
   `Dockerfile` があるため。Railwayの「Settings」→「Source」→「Root Directory」）
4. Railwayは `app/Dockerfile` を自動検出してDockerビルドします

### 3. PostgreSQLを追加する

1. 同じRailwayプロジェクト内で「New」→「Database」→「Add PostgreSQL」
2. 追加されたPostgreSQLサービスの「Variables」タブから `DATABASE_URL`（`DATABASE_PUBLIC_URL` ではなく
   同一プロジェクト内部通信用の方）をコピー

### 4. 環境変数を設定する

アプリ側のサービスの「Variables」タブで、以下を設定してください。

- `DATABASE_URL` : 手順3でコピーしたPostgreSQLの接続文字列
- `AUTH_SECRET` : `openssl rand -base64 32` などで生成したランダム文字列
- `DATABASE_POOL_MAX`（任意）: 同時アクセスが多い場合の接続プール上限。既定20

### 5. スキーマとシードデータを投入する

Railwayの提供するPostgreSQLに、初回だけ `schema.sql` を投入し、初期ユーザーを作成します。
Railway CLI（`railway`コマンド）を使うのが簡単です。

```bash
npm install -g @railway/cli
railway login
railway link          # このプロジェクトを選択
railway run -- psql "$DATABASE_URL" -f schema.sql   # リポジトリ直下のschema.sqlを投入
```

初期ユーザー（ログインID `admin` / パスワード `changeme123`）は、アプリコンテナ内で
`npx prisma db seed` を実行して作成します。Railwayのサービスの「Shell」機能
（またはRailway CLIの `railway run`）から実行してください。

```bash
railway run -- npx prisma db seed
```

**複数人でテストを始める前に、必ず `admin` のパスワードを変更してください。**
（現時点ではパスワード変更画面は未実装のため、変更が必要な場合はお知らせください）

### 6. デプロイ完了後

Railwayが払い出すURL（例: `https://xxxx.up.railway.app`）を、テストしてもらう人に共有すれば、
複数のPC・スマホから同時にログインして操作できます。同時アクセス時の安全性（伝票番号の重複防止、
締め処理の二重実行防止など）は `app/README.md` の「同時アクセス（複数端末からの同時利用）について」
の章で対策済みです。

## マスタデータについて

`schema.sql` を投入しただけの状態では、得意先・仕入先・商品などのマスタデータは空です。
テストに使うデータは、アプリの各マスタ画面（得意先・仕入先・商品）の「CSV取り込み」機能で
投入するか、テスト用に少数だけ手動登録してください。今回の開発で使っていた実データ
（得意先・商品など）をそのままテスト環境に入れたい場合は、その旨お知らせください
（個人情報・取引先情報を含むため、扱いは別途ご相談させてください）。

## 動作確認のポイント

- ログイン→各伝票の新規登録・一覧検索が問題なく動くか
- 複数人が同時に伝票を登録しても、伝票番号が重複しないか
- PDF出力（納品書・見積書・請求書）が正しく生成されるか（初回はChromiumの起動が少し遅い場合があります）
