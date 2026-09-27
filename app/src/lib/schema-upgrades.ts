import { prisma } from "@/lib/prisma";

// 本番のDBは最初に schema.sql を投入しただけで、テーブルを追加する仕組み（マイグレーション）が無い。
// そのため、後から追加したテーブルは、アプリの起動時（src/instrumentation.ts）にここで自動で作る。
// どの文も「既にあれば何もしない」書き方にしてあるので、毎回の起動で実行して問題ない。
// 新しくテーブルを追加するときは、schema.sql と prisma/schema.prisma にも同じ内容を書くこと。
const UPGRADES: string[] = [
  // 2026-09: 印刷（事務所のプリンターの指定カセットへの直接印刷）
  `
CREATE TABLE IF NOT EXISTS print_trays (
    doc_type    VARCHAR(20) PRIMARY KEY,
    cassette    SMALLINT NOT NULL CHECK (cassette BETWEEN 1 AND 9)
)
  `,
  `
INSERT INTO print_trays (doc_type, cassette) VALUES ('delivery_note', 3), ('quotation', 1), ('invoice', 2)
    ON CONFLICT (doc_type) DO NOTHING
  `,
  `

-- 印刷係（事務所でプリンターに直接印刷するパソコン）の接続キー。キーそのものは保存せず、SHA-256のハッシュだけを保存する
CREATE TABLE IF NOT EXISTS print_agents (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(60) NOT NULL,
    key_hash        VARCHAR(64) NOT NULL UNIQUE,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    last_seen_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
)
  `,
  `

-- 印刷の依頼。画面の「印刷する」で pending として登録し、印刷係が取り出して printing → done / error にする
CREATE TABLE IF NOT EXISTS print_jobs (
    id              BIGSERIAL PRIMARY KEY,
    doc_type        VARCHAR(20) NOT NULL,
    target_id       VARCHAR(30) NOT NULL,   -- 売上伝票ID・見積書ID・請求実績ID
    title           VARCHAR(100) NOT NULL,  -- 画面表示用（例: 納品書 152445）
    cassette        SMALLINT NOT NULL,
    status          VARCHAR(10) NOT NULL DEFAULT 'pending', -- pending / printing / done / error / canceled
    error           TEXT,
    requested_by    UUID REFERENCES users(id),
    agent_id        INTEGER REFERENCES print_agents(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    picked_at       TIMESTAMPTZ,
    finished_at     TIMESTAMPTZ
)
  `,
  `
CREATE INDEX IF NOT EXISTS idx_print_jobs_status ON print_jobs(status, id)
  `,
];

export async function applySchemaUpgrades(): Promise<void> {
  for (const sql of UPGRADES) {
    await prisma.$executeRawUnsafe(sql);
  }
}
