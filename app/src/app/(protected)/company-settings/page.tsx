import { prisma } from "@/lib/prisma";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { CompanySettingsForm } from "./CompanySettingsForm";

export default async function CompanySettingsPage() {
  if (!isAdmin(await getCurrentUser())) {
    return <p className="text-sm text-slate-500">この画面は管理者のみ利用できます。</p>;
  }
  const company = await prisma.company_settings.findUnique({ where: { id: 1 } });

  return (
    <div>
      <h1 className="mb-2 text-lg font-bold text-slate-800">自社情報</h1>
      <p className="mb-6 text-sm text-slate-600">
        納品書・見積書・請求書に印刷する自社の表記です。入力したとおりの文字で印刷されます。
      </p>
      <CompanySettingsForm
        defaults={{
          company_name: company?.company_name ?? "",
          postal_code: company?.postal_code ?? "",
          address1: company?.address1 ?? "",
          address2: company?.address2 ?? "",
          phone: company?.phone ?? "",
          fax: company?.fax ?? "",
          invoice_registration_no: company?.invoice_registration_no ?? "",
        }}
      />
    </div>
  );
}
