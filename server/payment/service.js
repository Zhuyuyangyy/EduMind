import { amountCents, executeTrade, paymentConfig, paymentError, providerConfigStatus } from './provider.js'
import { applyPaymentEvent, confirmRefund, getOrder, getRefund, markClosed, prepareRefund } from './store.js'

function checkOrder(order) {
  if (!order) throw paymentError('payment-order-not-found', 404)
  const cfg = paymentConfig()
  if (order.provider !== 'vibe-pay' || order.dataSource !== providerConfigStatus().dataSource || order.appId !== cfg.appId || order.sellerId !== cfg.sellerId) throw paymentError('payment-order-provider-mismatch', 409)
}

function checkResponse(result, order, amountField) {
  if (result?.code !== '10000') throw paymentError('payment-provider-request-not-confirmed', 502)
  if (result.out_trade_no !== order.id || !result.trade_no || (order.providerTradeNo && result.trade_no !== order.providerTradeNo) || (amountField && amountCents(result[amountField]) !== order.amountCents)) throw paymentError('payment-provider-response-mismatch', 502)
}

export async function reconcileOrder(accountId, orderId) {
  const order = await getOrder(accountId, orderId)
  checkOrder(order)
  const result = await executeTrade('alipay.trade.query', { out_trade_no: order.id })
  checkResponse(result, order, 'total_amount')
  const paid = ['TRADE_SUCCESS', 'TRADE_FINISHED'].includes(result.trade_status)
  if (paid) await applyPaymentEvent({ provider: 'vibe-pay', eventId: `query:${order.id}:${result.trade_no}:${result.trade_status}`, orderId, providerTradeNo: result.trade_no, amountCents: order.amountCents, status: result.trade_status, accountId })
  else if (result.trade_status === 'TRADE_CLOSED' && order.status === 'pending') await markClosed(accountId, orderId)
  return { order: await getOrder(accountId, orderId), providerState: paid ? 'paid' : result.trade_status === 'WAIT_BUYER_PAY' ? 'pending' : result.trade_status === 'TRADE_CLOSED' ? 'closed' : 'unknown' }
}

export async function refundOrder(accountId, orderId) {
  const order = await getOrder(accountId, orderId)
  checkOrder(order)
  const refund = await prepareRefund(accountId, orderId)
  if (refund.status === 'succeeded') return refund
  const result = await executeTrade('alipay.trade.refund', { out_trade_no: orderId, out_request_no: refund.requestId, refund_amount: (refund.amountCents / 100).toFixed(2), refund_reason: '用户申请全额退款' })
  checkResponse(result, order)
  if (result.fund_change === 'Y') {
    if (amountCents(result.refund_fee) !== refund.amountCents) throw paymentError('payment-provider-response-mismatch', 502)
    return confirmRefund(accountId, orderId, refund.requestId)
  }
  return refund // N/missing is not proof of refund. Query the same request later.
}

export async function reconcileRefund(accountId, orderId) {
  const order = await getOrder(accountId, orderId)
  checkOrder(order)
  const refund = await getRefund(accountId, orderId)
  if (!refund) throw paymentError('payment-refund-not-found', 404)
  if (refund.status === 'succeeded') return refund
  const result = await executeTrade('alipay.trade.fastpay.refund.query', { out_trade_no: orderId, out_request_no: refund.requestId })
  checkResponse(result, order)
  if (result.out_request_no !== refund.requestId) throw paymentError('payment-provider-response-mismatch', 502)
  if (result.refund_status === 'REFUND_SUCCESS') {
    if (amountCents(result.refund_amount) !== refund.amountCents) throw paymentError('payment-provider-response-mismatch', 502)
    return confirmRefund(accountId, orderId, refund.requestId)
  }
  return refund
}

export async function closeOrder(accountId, orderId) {
  const current = await reconcileOrder(accountId, orderId)
  if (current.order.status === 'cancelled') return current.order
  if (current.order.status !== 'pending' || current.providerState !== 'pending') throw paymentError('payment-order-not-closable', 409)
  const result = await executeTrade('alipay.trade.close', { out_trade_no: orderId })
  checkResponse(result, current.order)
  return markClosed(accountId, orderId)
}
