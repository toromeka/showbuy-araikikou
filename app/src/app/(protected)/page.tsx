import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function DashboardPage() {
  const [
    customerCount,
    supplierCount,
    productCount,
    salesCount,
    purchaseCount,
    receiptCount,
    paymentCount,
    quotationCount,
    unbilledSalesCount,
    billingClosingCount,
    unsettledPurchaseCount,
    paymentClosingCount,
  ] = await Promise.all([
    prisma.customers.count({ where: { is_active: true } }),
    prisma.suppliers.count({ where: { is_active: true } }),
    prisma.products.count({ where: { is_active: true } }),
    prisma.sales_vouchers.count(),
    prisma.purchase_vouchers.count(),
    prisma.receipt_vouchers.count(),
    prisma.payment_vouchers.count(),
    prisma.quotations.count(),
    prisma.sales_vouchers.count({ where: { is_billed: false } }),
    prisma.billing_closings.count({ where: { is_reversed: false } }),
    prisma.purchase_vouchers.count({ where: { is_settled: false } }),
    prisma.payment_closings.count({ where: { is_reversed: false } }),
  ]);

  const cards = [
    { label: "売上伝票（登録済）", count: salesCount, href: "/sales-vouchers" },
    { label: "仕入伝票（登録済）", count: purchaseCount, href: "/purchase-vouchers" },
    { label: "入金伝票（登録済）", count: receiptCount, href: "/receipt-vouchers" },
    { label: "支払伝票（登録済）", count: paymentCount, href: "/payment-vouchers" },
    { label: "見積書（登録済）", count: quotationCount, href: "/quotations" },
    { label: "未請求の売上伝票", count: unbilledSalesCount, href: "/sales-vouchers" },
    { label: "請求更新（実行回数）", count: billingClosingCount, href: "/billing-closings" },
    { label: "未払の仕入伝票", count: unsettledPurchaseCount, href: "/purchase-vouchers" },
    { label: "仕入支払更新（実行回数）", count: paymentClosingCount, href: "/payment-closings" },
    { label: "得意先", count: customerCount, href: "/customers" },
    { label: "仕入先", count: supplierCount, href: "/suppliers" },
    { label: "商品", count: productCount, href: "/products" },
  ];

  return (
    <div>
      <h1 className="mb-6 text-lg font-bold text-slate-800">ホーム</h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300"
          >
            <p className="text-sm text-slate-500">{c.label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-800">{c.count.toLocaleString()}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
