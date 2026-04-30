'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  setActiveBuildingId,
  ensureActiveBuilding,
  clearActiveBuildingId,
} from '@/lib/tenant'
import {
  loginSchema,
  registerBuildingSchema,
  buildingDetailsSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '@/lib/validations/auth'

type ActionResult<T = void> =
  | { success: true; data?: T; message?: string; redirectTo?: string }
  | { success: false; error: string }

function fdGet(form: FormData, key: string): string | undefined {
  const v = form.get(key)
  return typeof v === 'string' ? v : undefined
}

export async function loginAction(formData: FormData): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({
    email: fdGet(formData, 'email'),
    password: fdGet(formData, 'password'),
  })

  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? 'بيانات غير صالحة' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data)

  if (error || !data.user) {
    return { success: false, error: 'بريد إلكتروني أو كلمة مرور غير صحيحة' }
  }

  await ensureActiveBuilding(data.user.id)
  return { success: true, message: 'تم تسجيل الدخول' }
}

export async function registerBuildingAction(
  formData: FormData,
): Promise<ActionResult> {
  const parsed = registerBuildingSchema.safeParse({
    fullName: fdGet(formData, 'fullName'),
    email: fdGet(formData, 'email'),
    password: fdGet(formData, 'password'),
    buildingName: fdGet(formData, 'buildingName'),
    city: fdGet(formData, 'city') || undefined,
    address: fdGet(formData, 'address') || undefined,
    defaultMonthlyFee: fdGet(formData, 'defaultMonthlyFee') ?? 0,
  })

  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? 'بيانات غير صالحة' }
  }

  const { fullName, email, password, buildingName, city, address, defaultMonthlyFee } =
    parsed.data

  const supabase = await createClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  // Step 1: create the auth user.
  const { data: signupData, error: signupError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      // If email confirmation is enabled in Supabase, the link sends users
      // through /auth/callback then to /onboarding to finish creating the building.
      emailRedirectTo: `${appUrl}/auth/callback?next=/onboarding`,
    },
  })

  if (signupError) {
    if (signupError.message.toLowerCase().includes('already')) {
      return { success: false, error: 'البريد الإلكتروني مسجَّل مسبقاً' }
    }
    return { success: false, error: 'تعذّر إنشاء الحساب' }
  }

  if (!signupData.user) {
    return { success: false, error: 'تعذّر إنشاء الحساب' }
  }

  // If Supabase has email confirmation ON, signUp returns user but no session.
  // We can't call register_building (auth.uid() would be null). Tell the user
  // to verify their email; the callback will land them on /onboarding.
  if (!signupData.session) {
    return {
      success: true,
      message:
        'تم إنشاء الحساب. تحقق من بريدك لتأكيد العنوان، ثم أكمل إنشاء العمارة.',
      redirectTo: '/login',
    }
  }

  // Step 2: register the building atomically (RPC; SECURITY DEFINER).
  const { data: buildingId, error: rpcError } = await supabase.rpc(
    'register_building',
    {
      p_name: buildingName,
      p_address: address || null,
      p_city: city || null,
      p_default_monthly_fee: defaultMonthlyFee,
      p_currency: 'SAR',
    },
  )

  // If building creation fails, the user is still authenticated (signup
  // succeeded). Send them to /onboarding to retry — that page has its own
  // building-creation form using createBuildingAction.
  if (rpcError || !buildingId) {
    return {
      success: true,
      message:
        'تم إنشاء الحساب، لكن تعذّر إنشاء العمارة. أكمل إنشاءها من صفحة الترحيب.',
      redirectTo: '/onboarding',
    }
  }

  await setActiveBuildingId(buildingId as string)
  return { success: true, message: 'تم إنشاء العمارة بنجاح', redirectTo: '/dashboard' }
}

/**
 * Create a building for the *currently authenticated* user.
 * Used by /onboarding when the user already has a session but no buildings
 * (e.g., signup succeeded but register_building failed, or email confirm
 * flow landed them here without a building yet).
 */
export async function createBuildingAction(
  formData: FormData,
): Promise<ActionResult> {
  const parsed = buildingDetailsSchema.safeParse({
    buildingName: fdGet(formData, 'buildingName'),
    city: fdGet(formData, 'city') || undefined,
    address: fdGet(formData, 'address') || undefined,
    defaultMonthlyFee: fdGet(formData, 'defaultMonthlyFee') ?? 0,
  })

  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? 'بيانات غير صالحة' }
  }

  const { buildingName, city, address, defaultMonthlyFee } = parsed.data

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'يجب تسجيل الدخول أولاً' }
  }

  const { data: buildingId, error: rpcError } = await supabase.rpc(
    'register_building',
    {
      p_name: buildingName,
      p_address: address || null,
      p_city: city || null,
      p_default_monthly_fee: defaultMonthlyFee,
      p_currency: 'SAR',
    },
  )

  if (rpcError || !buildingId) {
    return { success: false, error: 'تعذّر إنشاء العمارة. حاول مرة أخرى.' }
  }

  await setActiveBuildingId(buildingId as string)
  return { success: true, message: 'تم إنشاء العمارة', redirectTo: '/dashboard' }
}

export async function logoutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  await clearActiveBuildingId()
  redirect('/login')
}

export async function forgotPasswordAction(
  formData: FormData,
): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse({
    email: fdGet(formData, 'email'),
  })

  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? 'بيانات غير صالحة' }
  }

  const supabase = await createClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  // Send the user through /auth/callback so the recovery code is exchanged
  // for a real session before they reach /reset-password.
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${appUrl}/auth/callback?next=/reset-password`,
  })

  if (error) {
    return { success: false, error: 'تعذّر إرسال رابط إعادة التعيين. حاول لاحقاً.' }
  }

  return {
    success: true,
    message: 'إن كان البريد مسجَّلاً، سيصلك رابط إعادة تعيين كلمة المرور خلال دقائق.',
  }
}

export async function resetPasswordAction(
  formData: FormData,
): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse({
    password: fdGet(formData, 'password'),
    confirm: fdGet(formData, 'confirm'),
  })

  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? 'بيانات غير صالحة' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'الجلسة غير صالحة. اطلب رابطاً جديداً.' }
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })

  if (error) {
    return { success: false, error: 'تعذّر تحديث كلمة المرور' }
  }

  return { success: true, message: 'تم تحديث كلمة المرور' }
}
