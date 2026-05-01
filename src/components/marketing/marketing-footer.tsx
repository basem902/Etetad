import Link from 'next/link'
import { Building2 } from 'lucide-react'

/**
 * Footer بسيط لـ (marketing) routes.
 * يَحوي: روابط هيكلية + copyright. لا analytics tracking في v1.
 */
export function MarketingFooter() {
  return (
    <footer className="border-t border-border bg-card/40 mt-auto">
      <div className="mx-auto max-w-6xl px-4 py-10 md:px-6">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <Link
              href="/"
              className="flex items-center gap-2 font-bold tracking-tight"
            >
              <Building2 className="h-5 w-5 text-primary" aria-hidden />
              <span>إدارة العمارة</span>
            </Link>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              منصة شفافة متعدِّدة المستأجرين لإدارة العمارات السكنية.
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-3 text-sm">المنتج</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/pricing" className="hover:text-foreground transition-colors">
                  الباقات
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-foreground transition-colors">
                  تواصل معنا
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-3 text-sm">الحساب</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/login" className="hover:text-foreground transition-colors">
                  تسجيل الدخول
                </Link>
              </li>
              <li>
                <Link href="/subscribe?tier=pro&cycle=yearly" className="hover:text-foreground transition-colors">
                  اشترك الآن
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-3 text-sm">الموارد</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <a
                  href="https://github.com"
                  className="hover:text-foreground transition-colors"
                  rel="noopener"
                >
                  دليل الاستخدام
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} نظام إدارة العمارة. جميع الحقوق محفوظة.
          </p>
          <p className="text-xs text-muted-foreground">
            صُنع في المملكة العربية السعودية 🇸🇦
          </p>
        </div>
      </div>
    </footer>
  )
}
