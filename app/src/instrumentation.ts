// サーバーの起動時に1回だけ呼ばれる（Next.js の instrumentation）。
// 後から追加したテーブルを本番のDBに自動で作る（src/lib/schema-upgrades.ts）。
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { applySchemaUpgrades } = await import("@/lib/schema-upgrades");
  try {
    await applySchemaUpgrades();
  } catch (e) {
    // DBに繋がらない場合でも、アプリ自体は起動させる（印刷の機能だけが使えない状態になる）
    console.error("テーブルの自動追加に失敗しました:", e);
  }
}
