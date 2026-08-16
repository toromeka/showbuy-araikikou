// 得意先マスタの丸め方式 (rounding_method): 0=四捨五入 1=切捨て 2=切上げ
export function roundByMethod(value: number, method: number | null | undefined): number {
  switch (method) {
    case 1:
      return Math.floor(value);
    case 2:
      return Math.ceil(value);
    default:
      return Math.round(value);
  }
}
