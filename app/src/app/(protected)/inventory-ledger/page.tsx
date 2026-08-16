import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ProductPicker } from "./ProductPicker";

function toDateOnly(d: string): Date {
  return new Date(`${d}T00:00:00.000Z`);
}

type Movement = {
  key: string;
  date: Date;
  type: "仕入" | "売上";
  voucherNo: string;
  voucherHref: string;
  partnerName: string;
  quantityIn: number;
  quantityOut: number;
  amountIn: number;
  amountOut: number;
};

export default async function InventoryLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string; from?: string; to?: string }>;
}) {
  const { product: productCode, from = "", to = "" } = await searchParams;

  if (!productCode) {
    return (
      <div>
        <h1 className="mb-6 text-lg font-bold text-slate-800">商品受払台帳</h1>
        <p className="mb-4 text-sm text-slate-500">
          対象の商品を検索して選択してください（商品マスタは約14万6千件あるため、コードまたは商品名で絞り込みます）。
        </p>
        <ProductPicker />
      </div>
    );
  }

  const product = await prisma.products.findUnique({ where: { code: productCode } });
  if (!product) notFound();

  const fromDate = from ? toDateOnly(from) : null;
  const toDate = to ? toDateOnly(to) : null;

  const [openingPurchases, openingSales, periodPurchases, periodSales] = await Promise.all([
    fromDate
      ? prisma.purchase_voucher_lines.aggregate({
          where: { product_code: productCode, purchase_vouchers: { voucher_date: { lt: fromDate } } },
          _sum: { quantity: true, cost_amount: true },
        })
      : null,
    fromDate
      ? prisma.sales_voucher_lines.aggregate({
          where: { product_code: productCode, sales_vouchers: { voucher_date: { lt: fromDate } } },
          _sum: { quantity: true, cost_amount: true },
        })
      : null,
    prisma.purchase_voucher_lines.findMany({
      where: {
        product_code: productCode,
        purchase_vouchers: {
          voucher_date: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        },
      },
      include: { purchase_vouchers: { include: { suppliers: { select: { name1: true } } } } },
    }),
    prisma.sales_voucher_lines.findMany({
      where: {
        product_code: productCode,
        sales_vouchers: {
          voucher_date: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        },
      },
      include: { sales_vouchers: { include: { customers: { select: { name1: true } } } } },
    }),
  ]);

  const openingQty = Number(openingPurchases?._sum.quantity ?? 0) - Number(openingSales?._sum.quantity ?? 0);
  const openingAmount =
    Number(openingPurchases?._sum.cost_amount ?? 0) - Number(openingSales?._sum.cost_amount ?? 0);

  const movements: Movement[] = [
    ...periodPurchases.map((l): Movement => {
      const qty = Number(l.quantity);
      const amt = Number(l.cost_amount ?? 0);
      return {
        key: `p${l.id}`,
        date: l.purchase_vouchers.voucher_date,
        type: "仕入",
        voucherNo: l.purchase_vouchers.voucher_no,
        voucherHref: `/purchase-vouchers/${l.purchase_vouchers.id}`,
        partnerName: l.purchase_vouchers.suppliers.name1,
        quantityIn: qty,
        quantityOut: 0,
        amountIn: amt,
        amountOut: 0,
      };
    }),
    ...periodSales.map((l): Movement => {
      const qty = Number(l.quantity);
      const amt = Number(l.cost_amount ?? 0);
      return {
        key: `s${l.id}`,
        date: l.sales_vouchers.voucher_date,
        type: "売上",
        voucherNo: l.sales_vouchers.voucher_no,
        voucherHref: `/sales-vouchers/${l.sales_vouchers.id}`,
        partnerName: l.sales_vouchers.customers.name1,
        quantityIn: 0,
        quantityOut: qty,
        amountIn: 0,
        amountOut: amt,
      };
    }),
  ].sort((a, b) => a.date.getTime() - b.date.getTime() || a.key.localeCompare(b.key));

  let runningQty = openingQty;
  let runningAmount = openingAmount;
  const rows = movements.map((m) => {
    runningQty += m.quantityIn - m.quantityOut;
    runningAmount += m.amountIn - m.amountOut;
    return { ...m, balanceQty: runningQty, balanceAmount: runningAmount };
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-800">商品受払台帳</h1>
        <Link href="/inventory-ledger" className="text-sm text-blue-600 hover:underline">
          商品を変更
        </Link>
      </div>

      <section className="mb-6 rounded-lg border border-slate-200 bg-white p-6">
        <dl className="grid grid-cols-2 gap-y-3 text-sm sm:grid-cols-4">
          <dt className="text-slate-500">商品コード</dt>
          <dd className="font-mono text-slate-800">{product.code}</dd>
          <dt className="text-slate-500">商品名</dt>
          <dd className="text-slate-800">{product.name}</dd>
          <dt className="text-slate-500">規格</dt>
          <dd className="text-slate-800">{product.spec || "-"}</dd>
          <dt className="text-slate-500">単位</dt>
          <dd className="text-slate-800">{product.unit_code || "-"}</dd>
        </dl>
        <p className="mt-3 text-xs text-slate-400">
          商品マスタの在庫数量（{Number(product.stock_qty).toLocaleString()}）・在庫金額（
          {Number(product.stock_amount).toLocaleString()}）は参考値です。旧システムからの移行時点で在庫数量が引き継がれていないため、通常0のままになっています。この受払台帳は売上伝票・仕入伝票の明細から都度計算した実績であり、商品マスタの値とは連動しません。
        </p>
      </section>

      <form className="mb-4 flex flex-wrap items-end gap-3">
        <input type="hidden" name="product" value={productCode} />
        <label className="block">
          <span className="mb-1 block text-xs text-slate-500">対象期間（From）</span>
          <input type="date" name="from" defaultValue={from} className="rounded border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-slate-500">対象期間（To）</span>
          <input type="date" name="to" defaultValue={to} className="rounded border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <button type="submit" className="rounded border border-slate-300 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
          絞り込み
        </button>
      </form>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead className="bg-slate-100 text-left text-slate-600">
              <tr>
                <th className="px-4 py-2">日付</th>
                <th className="px-4 py-2">区分</th>
                <th className="px-4 py-2">伝票番号</th>
                <th className="px-4 py-2">取引先</th>
                <th className="px-4 py-2 text-right">入庫数量</th>
                <th className="px-4 py-2 text-right">出庫数量</th>
                <th className="px-4 py-2 text-right">残数量</th>
                <th className="px-4 py-2 text-right">残高金額</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-slate-100 bg-slate-50 text-slate-500">
                <td className="px-4 py-2" colSpan={6}>
                  {from ? `${from} 時点の前期繰越` : "起点残高"}
                </td>
                <td className="px-4 py-2 text-right">{openingQty.toLocaleString()}</td>
                <td className="px-4 py-2 text-right">{Math.round(openingAmount).toLocaleString()}</td>
              </tr>
              {rows.map((r) => (
                <tr key={r.key} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2">{r.date.toISOString().slice(0, 10)}</td>
                  <td className="px-4 py-2">
                    {r.type === "仕入" ? (
                      <span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700">仕入</span>
                    ) : (
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700">売上</span>
                    )}
                  </td>
                  <td className="px-4 py-2 font-mono">
                    <Link href={r.voucherHref} className="text-blue-600 hover:underline">
                      {r.voucherNo}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{r.partnerName}</td>
                  <td className="px-4 py-2 text-right">{r.quantityIn ? r.quantityIn.toLocaleString() : ""}</td>
                  <td className="px-4 py-2 text-right">{r.quantityOut ? r.quantityOut.toLocaleString() : ""}</td>
                  <td className="px-4 py-2 text-right font-semibold">{r.balanceQty.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right">{Math.round(r.balanceAmount).toLocaleString()}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    指定した期間に該当する仕入・売上明細がありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
