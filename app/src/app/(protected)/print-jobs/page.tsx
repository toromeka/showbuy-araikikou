import { prisma } from "@/lib/prisma";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { DOC_TYPES, JOB_STATUS_LABELS, isSeenRecently } from "@/lib/print/jobs";
import { AutoRefresh, CancelJobButton, DeactivateAgentButton } from "./JobControls";
import { AgentKeyForm, PrintTraysForm } from "./SettingsForms";

const fmt = (d: Date | null) =>
  d
    ? new Intl.DateTimeFormat("ja-JP", {
        timeZone: "Asia/Tokyo",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(d)
    : "";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700",
  printing: "bg-blue-50 text-blue-700",
  done: "bg-green-50 text-green-700",
  error: "bg-red-50 text-red-700",
  canceled: "bg-slate-100 text-slate-500",
};

export default async function PrintJobsPage() {
  const me = await getCurrentUser();
  const admin = isAdmin(me);
  const [jobs, trays, agents] = await Promise.all([
    prisma.print_jobs.findMany({ orderBy: { id: "desc" }, take: 100, include: { users: true } }),
    prisma.print_trays.findMany(),
    prisma.print_agents.findMany({ where: { is_active: true }, orderBy: { id: "asc" } }),
  ]);
  const online = agents.filter((a) => isSeenRecently(a.last_seen_at));
  const trayOf = Object.fromEntries(trays.map((t) => [t.doc_type, t.cassette]));

  return (
    <div className="space-y-8">
      <AutoRefresh />
      <div>
        <h1 className="mb-2 text-lg font-bold text-slate-800">印刷状況</h1>
        <p className="text-sm text-slate-600">
          各画面の「印刷する」で依頼した印刷の状況です（直近100件。数秒ごとに自動で更新します）。
          印刷は、事務所の印刷係のパソコンがプリンターの決まったカセットから行います。
        </p>
        <p className={`mt-2 text-sm font-semibold ${online.length ? "text-green-700" : "text-amber-700"}`}>
          {online.length
            ? `印刷係のパソコン: 接続中（${online.map((a) => a.name).join("、")}）`
            : agents.length
              ? "印刷係のパソコン: 接続されていません。依頼は、接続されると順に印刷されます。"
              : "印刷係のパソコンがまだ設定されていません。印刷は「プレビュー」から行ってください。"}
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="pb-2">依頼日時</th>
              <th className="pb-2">帳票</th>
              <th className="pb-2">カセット</th>
              <th className="pb-2">依頼者</th>
              <th className="pb-2">状況</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-slate-400">
                  印刷の依頼はまだありません。
                </td>
              </tr>
            )}
            {jobs.map((j) => (
              <tr key={j.id.toString()} className="border-b border-slate-100 align-top">
                <td className="py-2 whitespace-nowrap text-slate-500">{fmt(j.created_at)}</td>
                <td className="py-2">{j.title}</td>
                <td className="py-2 whitespace-nowrap">カセット{j.cassette}</td>
                <td className="py-2 whitespace-nowrap text-slate-500">{j.users?.display_name ?? ""}</td>
                <td className="py-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[j.status] ?? ""}`}>
                    {JOB_STATUS_LABELS[j.status] ?? j.status}
                  </span>
                  {j.status === "done" && <span className="ml-2 text-xs text-slate-400">{fmt(j.finished_at)}</span>}
                  {j.error && <p className="mt-1 text-xs text-red-600">{j.error}</p>}
                </td>
                <td className="py-2 text-right">{j.status === "pending" && <CancelJobButton id={j.id.toString()} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {admin && (
        <>
          <section className="rounded-lg border border-slate-200 bg-white p-6">
            <h2 className="mb-1 font-bold text-slate-800">帳票ごとのカセット（管理者のみ）</h2>
            <p className="mb-4 text-xs text-slate-500">変更は、これから依頼する印刷から使われます。</p>
            <PrintTraysForm
              defaults={Object.fromEntries(Object.keys(DOC_TYPES).map((k) => [k, trayOf[k] ?? 1]))}
            />
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-6">
            <h2 className="mb-1 font-bold text-slate-800">印刷係のパソコン（管理者のみ）</h2>
            <p className="mb-4 text-xs text-slate-500">
              事務所でプリンターに印刷するパソコンに、
              <a href="/print-agent/print-agent.ps1" download className="text-blue-600 underline">
                印刷係のプログラム（print-agent.ps1）
              </a>
              を入れ、ここで発行した接続キーを設定します。パソコンを入れ替えたときは、古いパソコンを「無効にする」で止めてください。
            </p>
            <table className="mb-6 w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="pb-2">名前</th>
                  <th className="pb-2">状態</th>
                  <th className="pb-2">最後の接続</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {agents.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-slate-400">
                      まだ登録されていません。
                    </td>
                  </tr>
                )}
                {agents.map((a) => (
                  <tr key={a.id} className="border-b border-slate-100">
                    <td className="py-2">{a.name}</td>
                    <td className="py-2">
                      {online.includes(a) ? (
                        <span className="text-green-700">接続中</span>
                      ) : (
                        <span className="text-slate-400">未接続</span>
                      )}
                    </td>
                    <td className="py-2 text-slate-500">{fmt(a.last_seen_at) || "まだ接続されていません"}</td>
                    <td className="py-2 text-right">
                      <DeactivateAgentButton id={a.id} name={a.name} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <AgentKeyForm />
          </section>
        </>
      )}
    </div>
  );
}
