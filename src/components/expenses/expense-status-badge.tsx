// =============================================
// Re-export the canonical badge from dashboard/status-badges so the
// expenses module owns its visual contract while sharing one source of truth
// for the label/variant mapping.
// =============================================
export { ExpenseStatusBadge } from '@/components/dashboard/status-badges'
