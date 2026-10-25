import { createOrder, applyPaymentEvent, prepareRefund, confirmRefund } from '../server/payment/store.js'
import { closeMySqlPool } from '../server/store/mysql.js'

let input = ''
for await (const chunk of process.stdin) input += chunk
const request = JSON.parse(input)
try {
  const result = request.action === 'create' ? await createOrder(request.input)
    : request.action === 'pay' ? await applyPaymentEvent(request.input)
    : request.action === 'refund' ? await prepareRefund(request.accountId, request.orderId)
    : await confirmRefund(request.accountId, request.orderId, request.requestId)
  console.log(JSON.stringify({ ok: true, result }))
} catch (error) {
  console.log(JSON.stringify({ ok: false, code: error.code || 'payment-storage-error' }))
  process.exitCode = 1
} finally { await closeMySqlPool() }
