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

  const [product, unitOptions] = await Promise.all([
    prisma.products.findUnique({ where: { code } }),
    prisma.units.findMany({ orderBy: { code: "asc" } }),
  ]);

  if (!product) notFound();

  const updateWithCode = updateProduct.bind(null, code);

  return (
    <div>
      <h1 className="mb-6 text-lg font-bold text-slate-800">商品マスタ - {product.name} の編集</h1>
      <ProductForm action={updateWithCode} defaults={product} unitOptions={unitOptions} isEdit />
    </div>
  );
}
