# 荒井機工 販売管理システム — 本番/検証用コンテナイメージ
#
# Playwright（Chromium）でのPDF出力機能があるため、ベースイメージは
# Microsoftの公式Playwrightイメージ（Chromium本体＋必要なシステムライブラリを
# 同梱済み）を使う。package.jsonの playwright バージョンとタグを必ず一致させること
# （現在は 1.62.1 → v1.62.1-noble）。
FROM mcr.microsoft.com/playwright:v1.62.1-noble

WORKDIR /app

# 依存関係だけ先にコピーしてキャッシュを効かせる
COPY package.json package-lock.json ./
RUN npm ci

# 残りのソースをコピー
COPY . .

# Prisma Client生成（schema.prismaのみ参照。DB接続は不要）
RUN npx prisma generate

# ビルド時にNext.jsがDATABASE_URL等を参照しないよう、ダミー値でビルドする
# （実際の接続情報は起動時に環境変数として渡す）
ENV DATABASE_URL="postgresql://user:password@localhost:5432/placeholder"
ENV AUTH_SECRET="build-time-placeholder-not-used-at-runtime"
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "run", "start"]
