// 初期パスワード。新しく作った管理者（prisma/seed.ts）と、管理者が「パスワードを初期値に戻す」を押したユーザーに設定される。
// このパスワードのままのユーザーには、ホーム画面で変更を促す警告を出す。
export const INITIAL_PASSWORD = "changeme123";
