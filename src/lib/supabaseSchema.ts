/**
 * Supabase-Ready Database Schema Contract for CivicTrack Government Portal
 *
 * Prepared for seamless migration from the Express in-memory store to
 * Supabase PostgreSQL with Row-Level Security (RLS) policies matching
 * src/lib/rbac.ts role definitions.
 */

export const SUPABASE_TABLE_NAMES = {
  complaints: 'civic_complaints',
  complaintHistory: 'civic_complaint_history',
  complaintRemarks: 'civic_complaint_remarks',
  evidencePhotos: 'civic_evidence_photos',
  departments: 'civic_departments',
  officers: 'civic_officers',
  adminUsers: 'civic_admin_users',
  activityLogs: 'civic_activity_logs',
  systemSettings: 'civic_system_settings',
} as const;

export interface SupabaseComplaintRow {
  id: string;
  title: string;
  description: string;
  category: string;
  severity: string;
  priority: string;
  status: string;
  ward: string;
  district: string;
  address: string;
  latitude: number;
  longitude: number;
  reported_at: string;
  resolution_deadline: string;
  resolved_at: string | null;
  assigned_department_id: string | null;
  assigned_officer_id: string | null;
  assignment_instructions: string | null;
  escalation_level: number;
  escalation_reason: string | null;
  rejection_reason: string | null;
  citizen_id: string;
  citizen_name: string;
  citizen_phone: string;
  citizen_email: string;
}
