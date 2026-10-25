const DEFAULT_PRODUCT_ID = 'ai-7day-pack'

export function getProduct(productId = DEFAULT_PRODUCT_ID) {
  if (productId !== DEFAULT_PRODUCT_ID) return null
  const text = process.env.EDUMIND_PAYMENT_PRICE_CENTS || ''
  const priceCents = /^\d+$/.test(text) ? Number(text) : null
  return {
    productId: DEFAULT_PRODUCT_ID,
    name: '7 天 AI 专项学习提升包',
    durationDays: 7,
    currency: 'CNY',
    priceCents: Number.isInteger(priceCents) && priceCents > 0 && priceCents <= 4294967295 ? priceCents : null,
    available: process.env.EDUMIND_PAYMENT_ENABLED === 'true',
  }
}

export function listProducts() {
  const product = getProduct()
  return product ? [product] : []
}
