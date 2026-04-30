import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { PlatformSettingsForm } from '@/components/super-admin/platform-settings-form'

export const metadata: Metadata = {
  title: 'إعدادات المنصة · Super Admin',
}

interface BankAccount {
  bank_name: string
  account_holder: string
  iban: string
  account_number: string
}

const defaultBank: BankAccount = {
  bank_name: '',
  account_holder: '',
  iban: '',
  account_number: '',
}

async function getSettings() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('platform_settings')
    .select('key, value')
    .in('key', ['bank_account', 'vat_rate', 'vat_enabled'])

  const settings = new Map((data ?? []).map((r) => [r.key, r.value as unknown]))

  // bank_account: parse with safe defaults
  const bankRaw = settings.get('bank_account')
  const bank: BankAccount =
    bankRaw && typeof bankRaw === 'object' && !Array.isArray(bankRaw)
      ? {
          bank_name: String((bankRaw as Record<string, unknown>).bank_name ?? ''),
          account_holder: String(
            (bankRaw as Record<string, unknown>).account_holder ?? '',
          ),
          iban: String((bankRaw as Record<string, unknown>).iban ?? ''),
          account_number: String(
            (bankRaw as Record<string, unknown>).account_number ?? '',
          ),
        }
      : defaultBank

  const rateRaw = settings.get('vat_rate')
  const vatRate = typeof rateRaw === 'number' ? rateRaw : 0.15

  const enabledRaw = settings.get('vat_enabled')
  const vatEnabled = typeof enabledRaw === 'boolean' ? enabledRaw : false

  return { bank, vatRate, vatEnabled }
}

export default async function PlatformSettingsPage() {
  const { bank, vatRate, vatEnabled } = await getSettings()

  return (
    <div className="space-y-6">
      <PageHeader
        title="إعدادات المنصة"
        description="بيانات الحساب البنكي + إعدادات VAT. تَنعكس فوراً على /pricing و subscription_orders."
      />
      <PlatformSettingsForm
        bankAccount={bank}
        vatRate={vatRate}
        vatEnabled={vatEnabled}
      />
    </div>
  )
}
