import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateProduct } from "@/lib/actions/products";
import { ProductForm } from "../ProductForm";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  const [
    product,
    unitOptions,
    majorClassOptions,
    middleClassOptions,
    minorClassOptions,
    category1Options,
    category2Options,
    category3Options,
  ] = await Promise.all([
    prisma.products.findUnique({ where: { code } }),
    prisma.units.findMany({ orderBy: { code: "asc" } }),
    prisma.product_class_major.findMany({ orderBy: { code: "asc" } }),
    prisma.product_class_middle.findMany({ orderBy: { code: "asc" } }),
    prisma.product_class_minor.findMany({ orderBy: { code: "asc" } }),
    prisma.product_category_1.findMany({ orderBy: { code: "asc" } }),
    prisma.product_category_2.findMany({ orderBy: { code: "asc" } }),
    prisma.product_category_3.findMany({ orderBy: { code: "asc" } }),
  ]);

  if (!product) notFound();

  const updateWithCode = updateProduct.bind(null, code);

  return (
    <div>
      <h1 className="mb-6 text-lg font-bold text-slate-800">商品マスタ - {product.name} の編集</h1>
      <ProductForm
        action={updateWithCode}
        defaults={product}
        unitOptions={unitOptions}
        majorClassOptions={majorClassOptions}
        middleClassOptions={middleClassOptions}
        minorClassOptions={minorClassOptions}
        category1Options={category1Options}
        category2Options={category2Options}
        category3Options={category3Options}
        isEdit
      />
    </div>
  );
}
