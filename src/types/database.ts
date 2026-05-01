// =============================================
// Database types — هاند-كرافتد لمطابقة supabase/01_schema.sql
// =============================================
// عند توفر مشروع Supabase حقيقي:
//   pnpm dlx supabase gen types typescript --linked > src/types/database.ts
// =============================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// =============================================
// ENUMs
// =============================================

export type SubscriptionPlan = 'trial' | 'basic' | 'pro' | 'enterprise'
export type SubscriptionStatus =
  | 'trial' | 'active' | 'past_due' | 'cancelled' | 'expired'
export type MembershipRole =
  | 'admin' | 'treasurer' | 'committee' | 'resident' | 'technician'
export type ApartmentRelation = 'owner' | 'resident' | 'representative'
export type ApartmentStatus = 'occupied' | 'vacant' | 'under_maintenance'
export type PaymentMethod = 'cash' | 'bank_transfer' | 'online' | 'cheque'
export type PaymentStatus = 'pending' | 'approved' | 'rejected'
export type ExpenseStatus =
  | 'draft' | 'pending_review' | 'approved' | 'rejected' | 'paid' | 'cancelled'
export type MaintenanceLocation =
  | 'apartment' | 'entrance' | 'elevator' | 'roof' | 'parking' | 'other'
export type MaintenancePriority = 'low' | 'medium' | 'high' | 'urgent'
export type MaintenanceStatus =
  | 'new' | 'reviewing' | 'waiting_quote' | 'waiting_approval'
  | 'in_progress' | 'completed' | 'rejected' | 'reopened'
export type TaskStatus =
  | 'todo' | 'in_progress' | 'waiting_external' | 'completed' | 'overdue'
export type TaskPriority = 'low' | 'medium' | 'high'
export type SuggestionStatus =
  | 'new' | 'discussion' | 'pricing' | 'converted_to_vote'
  | 'approved' | 'rejected' | 'archived'
export type VoteStatus = 'draft' | 'active' | 'closed' | 'cancelled'
export type ApprovalRule = 'simple_majority' | 'two_thirds' | 'custom'
export type DecisionStatus = 'approved' | 'rejected' | 'implemented' | 'postponed'
// Phase 16 — subscription_requests workflow status
export type SubscriptionRequestStatus =
  | 'new' | 'contacted' | 'qualified' | 'closed_won' | 'closed_lost'
// Phase 17 — pending_apartment_members workflow status
export type PendingMemberStatus = 'pending' | 'approved' | 'rejected'
// Phase 18 — subscription_orders workflow status
export type SubscriptionOrderStatus =
  | 'awaiting_payment'
  | 'awaiting_review'
  | 'provisioning'
  | 'approved'
  | 'provisioning_failed'
  | 'rejected'
  | 'expired'
export type SubscriptionOrderCycle = 'monthly' | 'yearly'

// =============================================
// Database (Supabase shape)
// =============================================

export type Database = {
  public: {
    Tables: {
      // 1. buildings
      buildings: {
        Row: {
          id: string
          name: string
          address: string | null
          city: string | null
          country: string
          total_apartments: number
          elevators_count: number
          default_monthly_fee: number
          currency: string
          logo_url: string | null
          subscription_plan: SubscriptionPlan
          subscription_status: SubscriptionStatus
          trial_ends_at: string | null
          subscription_ends_at: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          address?: string | null
          city?: string | null
          country?: string
          total_apartments?: number
          elevators_count?: number
          default_monthly_fee?: number
          currency?: string
          logo_url?: string | null
          subscription_plan?: SubscriptionPlan
          subscription_status?: SubscriptionStatus
          trial_ends_at?: string | null
          subscription_ends_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          address?: string | null
          city?: string | null
          country?: string
          total_apartments?: number
          default_monthly_fee?: number
          currency?: string
          logo_url?: string | null
          subscription_plan?: SubscriptionPlan
          subscription_status?: SubscriptionStatus
          trial_ends_at?: string | null
          subscription_ends_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      // 2. profiles
      profiles: {
        Row: {
          id: string
          full_name: string | null
          phone: string | null
          avatar_url: string | null
          is_super_admin: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          full_name?: string | null
          phone?: string | null
          avatar_url?: string | null
          is_super_admin?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          full_name?: string | null
          phone?: string | null
          avatar_url?: string | null
          is_super_admin?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      // 3. building_memberships
      building_memberships: {
        Row: {
          id: string
          building_id: string
          user_id: string
          role: MembershipRole
          is_active: boolean
          invited_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          building_id: string
          user_id: string
          role: MembershipRole
          is_active?: boolean
          invited_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          building_id?: string
          user_id?: string
          role?: MembershipRole
          is_active?: boolean
          invited_by?: string | null
          created_at?: string
        }
        Relationships: []
      }

      // 4. apartments
      apartments: {
        Row: {
          id: string
          building_id: string
          number: string
          floor: number | null
          monthly_fee: number
          status: ApartmentStatus
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          building_id: string
          number: string
          floor?: number | null
          monthly_fee?: number
          status?: ApartmentStatus
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          building_id?: string
          number?: string
          floor?: number | null
          monthly_fee?: number
          status?: ApartmentStatus
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      // 5. apartment_members
      apartment_members: {
        Row: {
          id: string
          building_id: string
          apartment_id: string
          user_id: string
          relation_type: ApartmentRelation
          is_voting_representative: boolean
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          building_id: string
          apartment_id: string
          user_id: string
          relation_type: ApartmentRelation
          is_voting_representative?: boolean
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          building_id?: string
          apartment_id?: string
          user_id?: string
          relation_type?: ApartmentRelation
          is_voting_representative?: boolean
          is_active?: boolean
          created_at?: string
        }
        Relationships: []
      }

      // 6. vendors
      vendors: {
        Row: {
          id: string
          building_id: string
          name: string
          phone: string | null
          specialty: string | null
          rating: number | null
          notes: string | null
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          building_id: string
          name: string
          phone?: string | null
          specialty?: string | null
          rating?: number | null
          notes?: string | null
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          building_id?: string
          name?: string
          phone?: string | null
          specialty?: string | null
          rating?: number | null
          notes?: string | null
          is_active?: boolean
          created_at?: string
        }
        Relationships: []
      }

      // 7. payments
      payments: {
        Row: {
          id: string
          building_id: string
          apartment_id: string
          user_id: string | null
          amount: number
          payment_date: string
          period_month: string
          method: PaymentMethod
          status: PaymentStatus
          receipt_url: string
          notes: string | null
          created_by: string | null
          approved_by: string | null
          approved_at: string | null
          rejection_reason: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          building_id: string
          apartment_id: string
          user_id?: string | null
          amount: number
          payment_date?: string
          period_month: string
          method?: PaymentMethod
          status?: PaymentStatus
          receipt_url: string // §1.5.1: required
          notes?: string | null
          created_by?: string | null
          approved_by?: string | null
          approved_at?: string | null
          rejection_reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          building_id?: string
          apartment_id?: string
          user_id?: string | null
          amount?: number
          payment_date?: string
          period_month?: string
          method?: PaymentMethod
          status?: PaymentStatus
          receipt_url?: string
          notes?: string | null
          created_by?: string | null
          approved_by?: string | null
          approved_at?: string | null
          rejection_reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      // 8. expenses
      expenses: {
        Row: {
          id: string
          building_id: string
          title: string
          description: string | null
          category: string | null
          amount: number
          expense_date: string
          status: ExpenseStatus
          invoice_url: string | null
          receipt_url: string | null
          vendor_id: string | null
          created_by: string | null
          approved_by: string | null
          approved_at: string | null
          paid_by: string | null
          paid_at: string | null
          cancellation_reason: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          building_id: string
          title: string
          description?: string | null
          category?: string | null
          amount: number
          expense_date?: string
          status?: ExpenseStatus
          invoice_url?: string | null
          receipt_url?: string | null
          vendor_id?: string | null
          created_by?: string | null
          approved_by?: string | null
          approved_at?: string | null
          paid_by?: string | null
          paid_at?: string | null
          cancellation_reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          building_id?: string
          title?: string
          description?: string | null
          category?: string | null
          amount?: number
          expense_date?: string
          status?: ExpenseStatus
          invoice_url?: string | null
          receipt_url?: string | null
          vendor_id?: string | null
          created_by?: string | null
          approved_by?: string | null
          approved_at?: string | null
          paid_by?: string | null
          paid_at?: string | null
          cancellation_reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      // 9. maintenance_requests
      maintenance_requests: {
        Row: {
          id: string
          building_id: string
          apartment_id: string | null
          requested_by: string | null
          assigned_to: string | null
          title: string
          description: string | null
          location_type: MaintenanceLocation
          priority: MaintenancePriority
          status: MaintenanceStatus
          before_image_url: string | null
          after_image_url: string | null
          cost: number | null
          related_expense_id: string | null
          completed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          building_id: string
          apartment_id?: string | null
          requested_by?: string | null
          assigned_to?: string | null
          title: string
          description?: string | null
          location_type?: MaintenanceLocation
          priority?: MaintenancePriority
          status?: MaintenanceStatus
          before_image_url?: string | null
          after_image_url?: string | null
          cost?: number | null
          related_expense_id?: string | null
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          building_id?: string
          apartment_id?: string | null
          requested_by?: string | null
          assigned_to?: string | null
          title?: string
          description?: string | null
          location_type?: MaintenanceLocation
          priority?: MaintenancePriority
          status?: MaintenanceStatus
          before_image_url?: string | null
          after_image_url?: string | null
          cost?: number | null
          related_expense_id?: string | null
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      // 10. tasks
      tasks: {
        Row: {
          id: string
          building_id: string
          title: string
          description: string | null
          assigned_to: string | null
          status: TaskStatus
          priority: TaskPriority
          due_date: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          building_id: string
          title: string
          description?: string | null
          assigned_to?: string | null
          status?: TaskStatus
          priority?: TaskPriority
          due_date?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          building_id?: string
          title?: string
          description?: string | null
          assigned_to?: string | null
          status?: TaskStatus
          priority?: TaskPriority
          due_date?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      // 11. suggestions
      suggestions: {
        Row: {
          id: string
          building_id: string
          title: string
          description: string | null
          created_by: string | null
          status: SuggestionStatus
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          building_id: string
          title: string
          description?: string | null
          created_by?: string | null
          status?: SuggestionStatus
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          building_id?: string
          title?: string
          description?: string | null
          created_by?: string | null
          status?: SuggestionStatus
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      // 12. votes (NO voting_scope per §1.5.2)
      votes: {
        Row: {
          id: string
          building_id: string
          title: string
          description: string | null
          suggestion_id: string | null
          estimated_cost: number | null
          starts_at: string
          ends_at: string
          status: VoteStatus
          approval_rule: ApprovalRule
          custom_threshold: number | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          building_id: string
          title: string
          description?: string | null
          suggestion_id?: string | null
          estimated_cost?: number | null
          starts_at?: string
          ends_at: string
          status?: VoteStatus
          approval_rule?: ApprovalRule
          custom_threshold?: number | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          building_id?: string
          title?: string
          description?: string | null
          suggestion_id?: string | null
          estimated_cost?: number | null
          starts_at?: string
          ends_at?: string
          status?: VoteStatus
          approval_rule?: ApprovalRule
          custom_threshold?: number | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      // 13. vote_options
      vote_options: {
        Row: {
          id: string
          vote_id: string
          label: string
          sort_order: number
        }
        Insert: {
          id?: string
          vote_id: string
          label: string
          sort_order?: number
        }
        Update: {
          id?: string
          vote_id?: string
          label?: string
          sort_order?: number
        }
        Relationships: []
      }

      // 14. vote_responses (apartment_id NOT NULL §1.5.2; building_id NOT NULL for tenant FK)
      vote_responses: {
        Row: {
          id: string
          vote_id: string
          option_id: string
          user_id: string
          apartment_id: string // §1.5.2: NOT NULL
          building_id: string  // tenant FK target
          created_at: string
        }
        Insert: {
          id?: string
          vote_id: string
          option_id: string
          user_id: string
          apartment_id: string // §1.5.2: required
          building_id: string  // required for composite FK
          created_at?: string
        }
        Update: {
          id?: string
          vote_id?: string
          option_id?: string
          user_id?: string
          apartment_id?: string
          building_id?: string
          created_at?: string
        }
        Relationships: []
      }

      // 15. decisions
      decisions: {
        Row: {
          id: string
          building_id: string
          title: string
          description: string | null
          vote_id: string | null
          expense_id: string | null
          status: DecisionStatus
          decision_date: string
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          building_id: string
          title: string
          description?: string | null
          vote_id?: string | null
          expense_id?: string | null
          status?: DecisionStatus
          decision_date?: string
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          building_id?: string
          title?: string
          description?: string | null
          vote_id?: string | null
          expense_id?: string | null
          status?: DecisionStatus
          decision_date?: string
          created_by?: string | null
          created_at?: string
        }
        Relationships: []
      }

      // 16. documents
      documents: {
        Row: {
          id: string
          building_id: string
          title: string
          category: string | null
          file_url: string
          file_size: number | null
          uploaded_by: string | null
          is_public: boolean
          created_at: string
        }
        Insert: {
          id?: string
          building_id: string
          title: string
          category?: string | null
          file_url: string
          file_size?: number | null
          uploaded_by?: string | null
          is_public?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          building_id?: string
          title?: string
          category?: string | null
          file_url?: string
          file_size?: number | null
          uploaded_by?: string | null
          is_public?: boolean
          created_at?: string
        }
        Relationships: []
      }

      // 17. audit_logs (immutable — no Update type provided in practice)
      audit_logs: {
        Row: {
          id: string
          building_id: string | null
          actor_id: string | null
          action: string
          entity_type: string
          entity_id: string | null
          old_values: Json | null
          new_values: Json | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          building_id?: string | null
          actor_id?: string | null
          action: string
          entity_type: string
          entity_id?: string | null
          old_values?: Json | null
          new_values?: Json | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          building_id?: string | null
          actor_id?: string | null
          action?: string
          entity_type?: string
          entity_id?: string | null
          old_values?: Json | null
          new_values?: Json | null
          notes?: string | null
          created_at?: string
        }
        Relationships: []
      }
      // Phase 16 — subscription_tiers (الباقات في /pricing)
      subscription_tiers: {
        Row: {
          id: string
          name: string
          description: string | null
          price_monthly: number | null
          price_yearly: number | null
          max_apartments: number | null
          max_admins: number | null
          features: Json
          is_active: boolean
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          name: string
          description?: string | null
          price_monthly?: number | null
          price_yearly?: number | null
          max_apartments?: number | null
          max_admins?: number | null
          features?: Json
          is_active?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          price_monthly?: number | null
          price_yearly?: number | null
          max_apartments?: number | null
          max_admins?: number | null
          features?: Json
          is_active?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      // Phase 16 — platform_settings (key/value، super_admin only)
      platform_settings: {
        Row: {
          key: string
          value: Json
          description: string | null
          updated_by: string | null
          updated_at: string
        }
        Insert: {
          key: string
          value: Json
          description?: string | null
          updated_by?: string | null
          updated_at?: string
        }
        Update: {
          key?: string
          value?: Json
          description?: string | null
          updated_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      // Phase 17 — building_join_links (token_hash، not raw)
      building_join_links: {
        Row: {
          id: string
          building_id: string
          token_hash: string
          created_by: string
          created_at: string
          expires_at: string | null
          disabled_at: string | null
          uses_count: number
          max_uses: number | null
        }
        Insert: {
          id?: string
          building_id: string
          token_hash: string
          created_by: string
          created_at?: string
          expires_at?: string | null
          disabled_at?: string | null
          uses_count?: number
          max_uses?: number | null
        }
        Update: {
          id?: string
          building_id?: string
          token_hash?: string
          created_by?: string
          created_at?: string
          expires_at?: string | null
          disabled_at?: string | null
          uses_count?: number
          max_uses?: number | null
        }
        Relationships: []
      }
      // Phase 17 — pending_apartment_members (holding zone for /join requests)
      pending_apartment_members: {
        Row: {
          id: string
          building_id: string
          user_id: string
          join_link_id: string | null
          requested_apartment_number: string | null
          requested_floor: number | null
          full_name: string | null
          phone: string | null
          status: PendingMemberStatus
          rejection_reason: string | null
          reviewed_by: string | null
          reviewed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          building_id: string
          user_id: string
          join_link_id?: string | null
          requested_apartment_number?: string | null
          requested_floor?: number | null
          full_name?: string | null
          phone?: string | null
          status?: PendingMemberStatus
          rejection_reason?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          building_id?: string
          user_id?: string
          join_link_id?: string | null
          requested_apartment_number?: string | null
          full_name?: string | null
          phone?: string | null
          status?: PendingMemberStatus
          rejection_reason?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      // Phase 18 — subscription_orders (bank-transfer subscription orders)
      subscription_orders: {
        Row: {
          id: string
          reference_number: string
          access_token_hash: string
          access_token_expires_at: string
          failed_access_attempts: number
          successful_access_count: number
          email: string
          full_name: string
          phone: string
          building_name: string
          city: string | null
          estimated_apartments: number | null
          tier_id: string
          cycle: SubscriptionOrderCycle
          amount: number
          vat_amount: number
          total_amount: number
          currency: string
          receipt_url: string | null
          transfer_date: string | null
          transfer_reference: string | null
          status: SubscriptionOrderStatus
          rejection_reason: string | null
          rejection_attempt_count: number
          provisioning_started_at: string | null
          provisioning_failure_reason: string | null
          provisioned_building_id: string | null
          provisioned_user_id: string | null
          reviewed_by: string | null
          reviewed_at: string | null
          created_at: string
          // Phase 19: renewal/plan-change tracking
          is_renewal: boolean
          renews_building_id: string | null
          is_plan_change: boolean
          previous_tier_id: string | null
        }
        // NOTE: Insert/Update happen server-only via SECURITY DEFINER RPCs OR
        // via service_role for cron jobs. RLS has NO INSERT/UPDATE policies
        // for any role except super_admin SELECT (Phase 18 v3.38 enforcement).
        Insert: {
          id?: string
          reference_number: string
          access_token_hash: string
          access_token_expires_at?: string
          failed_access_attempts?: number
          successful_access_count?: number
          email: string
          full_name: string
          phone: string
          building_name: string
          city?: string | null
          estimated_apartments?: number | null
          tier_id: string
          cycle: SubscriptionOrderCycle
          amount: number
          vat_amount?: number
          total_amount: number
          currency?: string
          receipt_url?: string | null
          transfer_date?: string | null
          transfer_reference?: string | null
          status?: SubscriptionOrderStatus
          rejection_reason?: string | null
          rejection_attempt_count?: number
          provisioning_started_at?: string | null
          provisioning_failure_reason?: string | null
          provisioned_building_id?: string | null
          provisioned_user_id?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string
          is_renewal?: boolean
          renews_building_id?: string | null
          is_plan_change?: boolean
          previous_tier_id?: string | null
        }
        Update: {
          status?: SubscriptionOrderStatus
          receipt_url?: string | null
          transfer_date?: string | null
          transfer_reference?: string | null
          rejection_reason?: string | null
          rejection_attempt_count?: number
          provisioning_started_at?: string | null
          provisioning_failure_reason?: string | null
          provisioned_building_id?: string | null
          provisioned_user_id?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          failed_access_attempts?: number
          successful_access_count?: number
        }
        Relationships: []
      }
      // Phase 19 — bulk_import_jobs (CSV/XLSX uploads for apartments + members)
      bulk_import_jobs: {
        Row: {
          id: string
          building_id: string
          type: 'apartments' | 'members'
          file_url: string
          file_name: string | null
          status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
          rows_total: number | null
          rows_succeeded: number
          rows_failed: number
          errors: { row: number; error: string }[]
          failure_reason: string | null
          started_at: string | null
          completed_at: string | null
          created_by: string
          created_at: string
        }
        // INSERT/UPDATE go through RPCs only (no direct write policies)
        Insert: {
          id?: string
          building_id: string
          type: 'apartments' | 'members'
          file_url: string
          file_name?: string | null
          status?: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
          rows_total?: number | null
          rows_succeeded?: number
          rows_failed?: number
          errors?: unknown
          failure_reason?: string | null
          started_at?: string | null
          completed_at?: string | null
          created_by: string
          created_at?: string
        }
        Update: {
          status?: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
          rows_total?: number | null
          rows_succeeded?: number
          rows_failed?: number
          errors?: unknown
          failure_reason?: string | null
          started_at?: string | null
          completed_at?: string | null
        }
        Relationships: []
      }
      // Phase 19 — subscription_reminders_sent (cron idempotency)
      subscription_reminders_sent: {
        Row: {
          id: string
          building_id: string
          days_before: 30 | 14 | 7
          subscription_ends_at_snapshot: string
          sent_at: string
          email_status: 'queued' | 'sent' | 'failed'
          email_error: string | null
        }
        Insert: {
          id?: string
          building_id: string
          days_before: 30 | 14 | 7
          subscription_ends_at_snapshot: string
          sent_at?: string
          email_status?: 'queued' | 'sent' | 'failed'
          email_error?: string | null
        }
        Update: {
          email_status?: 'queued' | 'sent' | 'failed'
          email_error?: string | null
        }
        Relationships: []
      }
      // Phase 16 — subscription_requests (CRM contact form)
      subscription_requests: {
        Row: {
          id: string
          email: string
          full_name: string
          phone: string | null
          building_name: string
          city: string | null
          estimated_apartments: number | null
          interested_tier: string | null
          message: string | null
          honeypot: string | null
          status: SubscriptionRequestStatus
          notes: string | null
          reviewed_by: string | null
          reviewed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          email: string
          full_name: string
          phone?: string | null
          building_name: string
          city?: string | null
          estimated_apartments?: number | null
          interested_tier?: string | null
          message?: string | null
          honeypot?: string | null
          status?: SubscriptionRequestStatus
          notes?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string
          phone?: string | null
          building_name?: string
          city?: string | null
          estimated_apartments?: number | null
          interested_tier?: string | null
          message?: string | null
          honeypot?: string | null
          status?: SubscriptionRequestStatus
          notes?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
    }

    Views: {
      [_ in never]: never
    }

    Functions: {
      is_super_admin: {
        Args: { user_uuid?: string }
        Returns: boolean
      }
      is_building_member: {
        Args: { bid: string; user_uuid?: string }
        Returns: boolean
      }
      user_has_role: {
        Args: { bid: string; roles: MembershipRole[]; user_uuid?: string }
        Returns: boolean
      }
      user_building_ids: {
        Args: { user_uuid?: string }
        Returns: { building_id: string }[]
      }
      register_building: {
        Args: {
          p_name: string
          p_address?: string | null
          p_city?: string | null
          p_default_monthly_fee?: number
          p_currency?: string
        }
        Returns: string
      }
      link_apartment_member: {
        Args: {
          p_apartment_id: string
          p_user_id: string
          p_relation_type: ApartmentRelation
        }
        Returns: string
      }
      change_voting_representative: {
        Args: {
          p_apartment_id: string
          p_new_member_id: string
        }
        Returns: void
      }
      deactivate_apartment_member: {
        Args: {
          p_member_id: string
          p_replacement_member_id?: string | null
        }
        Returns: void
      }
      link_maintenance_to_expense: {
        Args: {
          p_request_id: string
        }
        Returns: string
      }
      cast_vote_for_apartment: {
        Args: {
          p_vote_id: string
          p_apartment_id: string
          p_option_id: string
        }
        Returns: string
      }
      convert_suggestion_to_vote: {
        Args: {
          p_suggestion_id: string
          p_title: string
          p_description: string | null
          p_options: string[]
          p_ends_at: string
          p_approval_rule: ApprovalRule
          p_custom_threshold: number | null
          p_estimated_cost: number | null
        }
        Returns: string
      }
      activate_vote: {
        Args: { p_vote_id: string }
        Returns: void
      }
      close_vote: {
        Args: { p_vote_id: string }
        Returns: void
      }
      cancel_vote: {
        Args: { p_vote_id: string }
        Returns: void
      }
      get_vote_voted_count: {
        Args: { p_vote_id: string }
        Returns: number | null
      }
      get_vote_aggregate_counts: {
        Args: { p_vote_id: string }
        Returns: { option_id: string; vote_count: number }[]
      }
      get_votes_voted_counts: {
        Args: { p_vote_ids: string[] }
        Returns: { vote_id: string; voted: number | null }[]
      }
      create_vote_with_options: {
        Args: {
          p_building_id: string
          p_title: string
          p_description: string | null
          p_options: string[]
          p_ends_at: string
          p_approval_rule: ApprovalRule
          p_custom_threshold: number | null
          p_estimated_cost: number | null
        }
        Returns: string
      }
      list_user_vote_apartments: {
        Args: { p_vote_id: string }
        Returns: {
          apartment_id: string
          apartment_number: string
          already_voted: boolean
          voted_by_user_name: string | null
          voted_at: string | null
          voted_option_label: string | null
        }[]
      }
      get_monthly_financial_summary: {
        Args: { p_building_id: string; p_period: string }
        Returns: {
          income: number
          expense: number
          balance: number
          income_count: number
          expense_count: number
          outstanding_apartments_count: number
          outstanding_apartments_total: number
        }[]
      }
      get_expense_category_breakdown: {
        Args: { p_building_id: string; p_period_start: string; p_period_end: string }
        Returns: { category: string; total: number; count: number }[]
      }
      get_yearly_monthly_totals: {
        Args: { p_building_id: string; p_year: number }
        Returns: {
          month_start: string
          income: number
          expense: number
          income_count: number
          expense_count: number
        }[]
      }
      get_range_financial_summary: {
        Args: { p_building_id: string; p_from: string; p_to: string }
        Returns: {
          income: number
          expense: number
          balance: number
          income_count: number
          expense_count: number
        }[]
      }
      platform_stats: {
        Args: Record<string, never>
        Returns: {
          total_buildings: number
          trial_buildings: number
          active_buildings: number
          expired_buildings: number
          cancelled_buildings: number
          total_users: number
          total_apartments: number
          total_payments_approved: number
          trials_expiring_soon: number
        }[]
      }
      update_building_subscription: {
        Args: {
          p_building_id: string
          p_plan: SubscriptionPlan
          p_status: SubscriptionStatus
          p_trial_ends_at: string | null
          p_subscription_ends_at: string | null
        }
        Returns: void
      }
      building_usage_detail: {
        Args: { p_building_id: string }
        Returns: {
          apartments_count: number
          members_count: number
          pending_payments_count: number
          approved_payments_total: number
          paid_expenses_total: number
          open_maintenance_count: number
          active_votes_count: number
          last_activity_at: string | null
        }[]
      }
      is_building_active_subscription: {
        Args: { p_building_id: string }
        Returns: boolean
      }
      // Phase 16 — يَستخدمه /pricing (anon callable)
      get_active_subscription_tiers: {
        Args: Record<string, never>
        Returns: {
          id: string
          name: string
          description: string | null
          price_monthly: number | null
          price_yearly: number | null
          max_apartments: number | null
          max_admins: number | null
          features: Json
          sort_order: number
        }[]
      }
      // Phase 16 — مُهيَّأ لـ Phase 18 (anon)، حالياً super_admin فقط (يَفحص داخلياً)
      get_public_bank_details: {
        Args: Record<string, never>
        Returns: Json
      }
      // Phase 16 v3.30 — graceful email failure audit logging
      log_email_failure: {
        Args: {
          p_entity_type: string
          p_entity_id: string
          p_email_to: string
          p_email_kind: string
          p_reason: string
        }
        Returns: void
      }
      // Phase 16 v3.32 — server-only choke point for /contact submissions
      // (anon INSERT direct removed in round 4)
      // Phase 21 — added optional p_user_id for option-D flow (pre-registered user)
      submit_contact_request: {
        Args: {
          p_full_name: string
          p_email: string
          p_phone: string | null
          p_building_name: string
          p_city: string | null
          p_estimated_apartments: number | null
          p_interested_tier: string | null
          p_message: string | null
          p_honeypot: string | null
          p_user_id?: string | null
        }
        Returns: string
      }
      // Phase 17 — admin only: create a join link (token hashed by caller)
      create_building_join_link: {
        Args: {
          p_building_id: string
          p_token_hash: string
          p_expires_at: string | null
          p_max_uses: number | null
        }
        Returns: string
      }
      // Phase 17 — anon callable: resolve a token hash to limited public info
      resolve_building_join_token: {
        Args: { p_token_hash: string }
        Returns: {
          building_id: string | null
          building_name: string | null
          city: string | null
          error_code: string | null
        }[]
      }
      // Phase 17 — server-only (service_role): atomic INSERT pending + uses_count++
      // Phase 22: added p_floor for verification (admin sees during approval)
      submit_join_request: {
        Args: {
          p_user_id: string
          p_token_hash: string
          p_full_name: string
          p_apartment_number: string | null
          p_phone: string | null
          p_floor?: number | null
        }
        Returns: string
      }
      // Phase 17 — admin only: approve a pending member (calls link_apartment_member internally)
      approve_pending_member: {
        Args: {
          p_pending_id: string
          p_apartment_id: string
          p_relation_type: ApartmentRelation
        }
        Returns: void
      }
      // Phase 17 — admin only: reject a pending member with reason
      reject_pending_member: {
        Args: { p_pending_id: string; p_reason: string }
        Returns: void
      }
      // Phase 17 v3.35 — admin only: soft-disable a join link (idempotent)
      disable_join_link: {
        Args: { p_link_id: string }
        Returns: void
      }
      // Phase 18 — server-only: create a new subscription order with token hash
      // v3.39: returns total_amount + currency so action can render email with real amount
      create_subscription_order: {
        Args: {
          p_full_name: string
          p_email: string
          p_phone: string
          p_building_name: string
          p_city: string | null
          p_estimated_apartments: number | null
          p_tier_id: string
          p_cycle: SubscriptionOrderCycle
          p_token_hash: string
          // Phase 20: optional pre-created auth user id for password-upfront flow.
          // null = legacy (super_admin will invite on approval).
          p_user_id?: string | null
        }
        Returns: {
          order_id: string
          reference_number: string
          total_amount: number
          currency: string
        }[]
      }
      // Phase 18 — anon callable: validate access token (split counter)
      validate_subscription_order_token: {
        Args: { p_order_id: string; p_token_hash: string }
        Returns: {
          valid: boolean
          current_status: SubscriptionOrderStatus | null
          error_code: string | null
        }[]
      }
      // Phase 18 — service-role only: submit receipt path after upload
      submit_subscription_receipt: {
        Args: {
          p_order_id: string
          p_receipt_path: string
          p_transfer_date: string
          p_transfer_reference: string | null
        }
        Returns: void
      }
      // Phase 18 — super_admin: reserve order for provisioning (lock + status='provisioning')
      reserve_subscription_order_for_provisioning: {
        Args: { p_order_id: string }
        Returns: {
          reserved: boolean
          order_email: string
          order_full_name: string
          order_building_name: string
          order_city: string | null
          order_tier_id: string
          order_cycle: SubscriptionOrderCycle
        }[]
      }
      // Phase 18 — super_admin: complete provisioning (atomic INSERT building + membership)
      complete_provisioning: {
        Args: { p_order_id: string; p_user_id: string }
        Returns: string  // building_id
      }
      // Phase 18 — super_admin: mark provisioning as failed (recovery state)
      mark_provisioning_failed: {
        Args: { p_order_id: string; p_failure_reason: string }
        Returns: void
      }
      // Phase 18 — super_admin: reset provisioning_failed → awaiting_review (retry)
      reset_failed_provisioning: {
        Args: { p_order_id: string }
        Returns: void
      }
      // Phase 18 — super_admin: reject order with reason
      reject_subscription_order: {
        Args: { p_order_id: string; p_reason: string }
        Returns: void
      }
      // Phase 18 — anon callable: get order display data + bank details (after token validation)
      get_order_for_receipt_page: {
        Args: { p_order_id: string; p_token_hash: string }
        Returns: {
          order_id: string
          reference_number: string
          status: SubscriptionOrderStatus
          amount: number
          vat_amount: number
          total_amount: number
          currency: string
          building_name: string
          rejection_reason: string | null
          rejection_attempt_count: number
          bank_account: Json
        }[]
      }
      // Phase 18 v3.40 — service_role only: bulk-expire due subscriptions via marker pattern
      expire_due_subscriptions: {
        Args: Record<string, never>
        Returns: number
      }
      // Phase 19 — Team management (admin-only RPCs)
      add_team_member: {
        Args: {
          p_building_id: string
          p_user_id: string
          p_role: 'treasurer' | 'committee' | 'technician'
        }
        Returns: string
      }
      deactivate_team_member: {
        Args: { p_membership_id: string }
        Returns: void
      }
      // Phase 19 — Renewal/plan-change order creation (building admin)
      create_renewal_order: {
        Args: {
          p_building_id: string
          p_tier_id: string
          p_cycle: 'monthly' | 'yearly'
          p_token_hash: string
        }
        Returns: {
          order_id: string
          reference_number: string
          total_amount: number
          currency: string
          is_plan_change: boolean
        }[]
      }
      // Phase 19 — Renewal completion (super_admin)
      complete_renewal: {
        Args: { p_order_id: string }
        Returns: string
      }
      // Phase 19 — Direct plan change (super_admin override, no order)
      change_subscription_plan: {
        Args: {
          p_building_id: string
          p_new_tier_id: string
          p_extend_cycle: 'monthly' | 'yearly' | null
          p_note: string
        }
        Returns: void
      }
      // Phase 19 — Bulk import jobs (admin)
      create_bulk_import_job: {
        Args: {
          p_building_id: string
          p_type: 'apartments' | 'members'
          p_file_url: string
          p_file_name: string
        }
        Returns: string
      }
      process_apartments_bulk_import: {
        Args: { p_job_id: string; p_rows: unknown }
        Returns: {
          rows_succeeded: number
          rows_failed: number
          errors: { row: number; error: string }[]
        }[]
      }
      process_members_bulk_import: {
        Args: { p_job_id: string; p_rows: unknown }
        Returns: {
          rows_succeeded: number
          rows_failed: number
          errors: { row: number; error: string }[]
        }[]
      }
      cancel_bulk_import_job: {
        Args: { p_job_id: string }
        Returns: void
      }
      // Phase 19 — Subscription reminders cron (service_role)
      find_and_record_subscription_reminders: {
        Args: Record<string, never>
        Returns: {
          reminder_id: string
          building_id: string
          building_name: string
          admin_email: string | null
          admin_full_name: string | null
          days_before: 30 | 14 | 7
          subscription_ends_at: string
          tier_id: string
        }[]
      }
      update_reminder_email_status: {
        Args: {
          p_reminder_id: string
          p_status: 'sent' | 'failed'
          p_error: string | null
        }
        Returns: void
      }
      // Phase 20 — authenticated user reads their own pending subscription orders
      // (used by /account/pending and AppLayout to gate users with pre-registered
      // /subscribe accounts whose orders haven't been approved yet)
      get_my_pending_subscription_orders: {
        Args: Record<string, never>
        Returns: {
          reference_number: string
          status: SubscriptionOrderStatus
          building_name: string
          total_amount: number
          currency: string
          created_at: string
          is_renewal: boolean
          rejection_reason: string | null
        }[]
      }
      // Phase 22 — admin promotes/demotes a building member (preserves apartment_members)
      change_member_role: {
        Args: {
          p_membership_id: string
          p_new_role: MembershipRole
        }
        Returns: void
      }
      // Phase 22 — admin edits building metadata (name, address, elevators, etc.)
      update_building_metadata: {
        Args: {
          p_building_id: string
          p_name: string
          p_address: string | null
          p_city: string | null
          p_total_apartments: number
          p_elevators_count: number
          p_default_monthly_fee: number
        }
        Returns: void
      }
      // Phase 21 — authenticated user reads their own pending contact requests
      // (option D: /contact also pre-creates auth user + waits for review)
      get_my_pending_contact_requests: {
        Args: Record<string, never>
        Returns: {
          id: string
          status: 'new' | 'contacted' | 'qualified'
          building_name: string
          interested_tier: string | null
          created_at: string
          notes: string | null
        }[]
      }
    }

    Enums: {
      subscription_plan: SubscriptionPlan
      subscription_status: SubscriptionStatus
      membership_role: MembershipRole
      apartment_relation: ApartmentRelation
      apartment_status: ApartmentStatus
      payment_method: PaymentMethod
      payment_status: PaymentStatus
      expense_status: ExpenseStatus
      maintenance_location: MaintenanceLocation
      maintenance_priority: MaintenancePriority
      maintenance_status: MaintenanceStatus
      task_status: TaskStatus
      task_priority: TaskPriority
      suggestion_status: SuggestionStatus
      vote_status: VoteStatus
      approval_rule: ApprovalRule
      decision_status: DecisionStatus
    }

    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// =============================================
// Convenience type aliases (for app code)
// =============================================

type PublicSchema = Database['public']

export type Tables<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Row']
export type InsertTables<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Insert']
export type UpdateTables<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Update']
export type Enums<T extends keyof PublicSchema['Enums']> =
  PublicSchema['Enums'][T]
