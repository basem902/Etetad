import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { hashToken } from '@/lib/tokens'

/**
 * POST /api/subscriptions/[order_id]/receipt
 *
 * Phase 18 receipt upload choke point. anon-callable but heavily gated:
 *
 *   1. IP rate limit (3/IP/hour per order)
 *   2. multipart/form-data: access_token + receipt file + transfer_date + transfer_reference
 *   3. validate_subscription_order_token RPC (token check + counter increment)
 *   4. file mime + size + sanitization
 *   5. upload to subscription_receipts bucket via service_role
 *   6. submit_subscription_receipt RPC (server-only) — flips status to awaiting_review
 *
 * Storage RLS is deny-all on anon for this bucket — uploads ONLY via this
 * route (lesson #28). Direct anon `supabase.storage.upload(...)` is blocked.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ order_id: string }> },
) {
  const { order_id: orderId } = await params

  // (1) IP rate limit — 3/IP/hour on the same order
  const ip = getClientIp(req.headers) ?? 'unknown'
  const rl = checkRateLimit(`receipt:${orderId}:${ip}`, 3, 60 * 60 * 1000)
  if (!rl.success) {
    return NextResponse.json(
      { error: 'محاولات كثيرة. حاول لاحقاً.' },
      { status: 429 },
    )
  }

  // (2) parse multipart form
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'بيانات الطلب غير صالحة.' }, { status: 400 })
  }

  const accessToken = formData.get('access_token')
  const file = formData.get('receipt')
  const transferDate = formData.get('transfer_date')
  const transferReference = formData.get('transfer_reference')

  if (typeof accessToken !== 'string' || accessToken.length < 16) {
    return NextResponse.json({ error: 'الـ token غير صالح.' }, { status: 400 })
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'لم يَتم اختيار ملف.' }, { status: 400 })
  }
  if (typeof transferDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(transferDate)) {
    return NextResponse.json(
      { error: 'تاريخ التَحويل غير صالح.' },
      { status: 400 },
    )
  }

  // (3) admin client (service_role narrow scope: validate + upload + RPC)
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json(
      { error: 'الخدمة غير مُكوَّنة. تواصل مع الإدارة.' },
      { status: 503 },
    )
  }

  // (4) validate token via RPC (this also increments counters in DB)
  const tokenHash = hashToken(accessToken)
  const { data: validation, error: validateErr } = await admin.rpc(
    'validate_subscription_order_token',
    { p_order_id: orderId, p_token_hash: tokenHash },
  )

  if (validateErr || !validation || validation.length === 0) {
    return NextResponse.json({ error: 'الـ token غير صالح.' }, { status: 401 })
  }
  const v = validation[0]
  if (!v?.valid) {
    const code = v?.error_code ?? 'invalid'
    const arabicMessages: Record<string, string> = {
      invalid: 'الـ token غير صالح.',
      expired: 'انتهت صلاحية الرابط.',
      locked: 'تم قفل الطلب بسبب محاولات فاشلة كثيرة.',
    }
    return NextResponse.json(
      { error: arabicMessages[code] ?? 'الـ token غير صالح.' },
      { status: 401 },
    )
  }

  // (4b) v3.39 fix (Codex P2): gate the upload by current_status BEFORE
  //      touching Storage. submit_subscription_receipt RPC also enforces this,
  //      but checking here means a tampered/curious client can't make us
  //      upload-then-cleanup an orphan file (storage upload may succeed even
  //      if the order is already approved/rejected/etc.).
  //
  //      Allowed: awaiting_payment (first upload) | rejected (re-upload).
  //      Anything else: token may be valid but upload is meaningless.
  if (v.current_status !== 'awaiting_payment' && v.current_status !== 'rejected') {
    return NextResponse.json(
      {
        error:
          v.current_status === 'awaiting_review' ||
          v.current_status === 'provisioning'
            ? 'الإيصال السابق قيد المراجعة. لا حاجة لرفع آخر.'
            : v.current_status === 'approved'
              ? 'الطلب مُعتَمَد بالفعل. افحص بريدك لرابط الدخول.'
              : v.current_status === 'expired'
                ? 'انتهت صلاحية الطلب.'
                : 'حالة الطلب الحالية لا تَسمح برفع الإيصال.',
      },
      { status: 409 },
    )
  }

  // (5) file validation server-side
  const allowedMimes = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
  ])
  if (!allowedMimes.has(file.type)) {
    return NextResponse.json(
      { error: 'نَوع الملف غير مَسموح. JPG/PNG/WEBP/PDF فقط.' },
      { status: 400 },
    )
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json(
      { error: 'الملف أكبر من 5MB.' },
      { status: 400 },
    )
  }

  // (6) upload via service_role to controlled path
  const ext = file.type === 'application/pdf' ? 'pdf' : file.type.split('/')[1]
  const path = `${orderId}/${crypto.randomUUID()}.${ext}`

  const { error: uploadErr } = await admin.storage
    .from('subscription_receipts')
    .upload(path, file, {
      contentType: file.type,
      cacheControl: 'no-store',
      upsert: false,
    })

  if (uploadErr) {
    return NextResponse.json(
      { error: 'تَعذَّر رفع الملف. حاول مجدَّداً.' },
      { status: 500 },
    )
  }

  // (7) flip order status via RPC
  const { error: submitErr } = await admin.rpc('submit_subscription_receipt', {
    p_order_id: orderId,
    p_receipt_path: path,
    p_transfer_date: transferDate,
    p_transfer_reference:
      typeof transferReference === 'string' && transferReference.trim()
        ? transferReference.trim()
        : null,
  })

  if (submitErr) {
    // Best-effort cleanup of orphan upload — failure here is non-fatal
    try {
      await admin.storage.from('subscription_receipts').remove([path])
    } catch {
      // ignore
    }
    return NextResponse.json(
      { error: 'تَعذَّر تَسجيل الإيصال. حاول مجدَّداً.' },
      { status: 500 },
    )
  }

  return NextResponse.json({ success: true })
}
