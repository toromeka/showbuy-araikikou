import { prisma } from "@/lib/prisma";
import { createProduct } from "@/lib/actions/products";
import { ProductForm } from "../ProductForm";

export default async function NewProductPage() {
  const [
    unitOptions,
    majorClassOptions,
    middleClassOptions,
    minorClassOptions,
    category1Options,
    category2Options,
    category3Options,
  ] = await Promise.all([
    prisma.units.findMany({ orderBy: { code: "asc" } }),
    prisma.product_class_major.findMany({ orderBy: { code: "asc" } }),
    prisma.product_class_middle.findMany({ orderBy: { code: "asc" } }),
    prisma.product_class_minor.findMany({ orderBy: { code: "asc" } }),
    prisma.product_category_1.findMany({ orderBy: { code: "asc" } }),
    prisma.product_category_2.findMany({ orderBy: { code: "asc" } }),
    prisma.product_category_3.findMany({ orderBy: { code: "asc" } }),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-lg font-bold text-slate-800">商品マスタ - 新規登録</h1>
      <ProductForm
        action={createProduct}
        unitOptions={unitOptions}
        majorClassOptions={majorClassOptions}
        middleClassOptions={middleClassOptions}
        minorClassOptions={minorClassOptions}
        category1Options={category1Options}
        category2Options={category2Options}
        category3Options={category3Options}
        isEdit={false}
      />
    </div>
  );
}
