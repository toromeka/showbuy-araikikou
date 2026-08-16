import { prisma } from "@/lib/prisma";
import { createProduct } from "@/lib/actions/products";
import { ProductForm } from "../ProductForm";

export default async function NewProductPage() {
  const unitOptions = await prisma.units.findMany({ orderBy: { code: "asc" } });

  return (
    <div>
      <h1 className="mb-6 text-lg font-bold text-slate-800">商品マスタ - 新規登録</h1>
      <ProductForm action={createProduct} unitOptions={unitOptions} isEdit={false} />
    </div>
  );
}
