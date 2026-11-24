import type { AdminRole, Complaint, PortalUser } from '../types/civic';

export type Permission =
  | 'view_dashboard'
  | 'view_all_complaints'
  | 'view_live_map'
  | 'assign_complaint'
  | 'reassign_complaint'
  | 'change_priority'
  | 'review_complaint'
  | 'update_field_progress'
  | 'verify_resolution'
  | 'reject_complaint'
  | 'escalate_complaint'
  | 'add_remarks'
  | 'upload_evidence'
  | 'view_citizen_full_info'
  | 'manage_departments'
  | 'view_departments'
  | 'manage_staff'
  | 'view_staff'
  | 'view_analytics'
  | 'export_reports'
  | 'view_performance'
  | 'view_activity_logs'
  | 'manage_users'
  | 'manage_settings';

export const ROLE_PERMISSIONS: Record<AdminRole, Permission[]> = {
  'Super Admin': [
    'view_dashboard',
    'view_all_complaints',
    'view_live_map',
    'assign_complaint',
    'reassign_complaint',
    'change_priority',
    'review_complaint',
    'update_field_progress',
    'verify_resolution',
    'reject_complaint',
    'escalate_complaint',
    'add_remarks',
    'upload_evidence',
    'view_citizen_full_info',
    'manage_departments',
    'view_departments',
    'manage_staff',
    'view_staff',
    'view_analytics',
    'export_reports',
    'view_performance',
    'view_activity_logs',
    'manage_users',
    'manage_settings',
  ],
  'State Admin': [
    'view_dashboard',
    'view_all_complaints',
    'view_live_map',
    'escalate_complaint',
    'add_remarks',
    'view_citizen_full_info',
    'view_departments',
    'view_staff',
    'view_analytics',
    'export_reports',
    'view_performance',
    'view_activity_logs',
  ],
  'District Admin': [
    'view_dashboard',
    'view_all_complaints',
    'view_live_map',
    'assign_complaint',
    'reassign_complaint',
    'change_priority',
    'review_complaint',
    'verify_resolution',
    'reject_complaint',
    'escalate_complaint',
    'add_remarks',
    'upload_evidence',
    'view_citizen_full_info',
    'manage_departments',
    'view_departments',
    'manage_staff',
    'view_staff',
    'view_analytics',
    'export_reports',
    'view_performance',
    'view_activity_logs',
  ],
  'Field Officer': [
    'view_dashboard',
    'view_live_map',
    'update_field_progress',
    'add_remarks',
    'upload_evidence',
    'view_departments',
    'view_activity_logs',
  ],
  'Rescue / Response Team Member': [
    'view_dashboard',
    'view_live_map',
    'update_field_progress',
    'add_remarks',
    'upload_evidence',
    'escalate_complaint',
  ],
};

export function hasPermission(role: AdminRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function canUserAccessComplaint(user: PortalUser, complaint: Complaint): boolean {
  if (user.role === 'Super Admin' || user.role === 'State Admin') {
    return true;
  }
  if (user.role === 'District Admin') {
    if (user.jurisdiction === 'All Districts' || user.jurisdiction === complaint.district) {
      return true;
    }
    return true;
  }
  if (user.role === 'Field Officer') {
    if (user.linkedOfficerId && complaint.assignedOfficerId === user.linkedOfficerId) {
      return true;
    }
    if (user.departmentId && complaint.assignedDepartmentId === user.departmentId) {
      return true;
    }
    return false;
  }
  if (user.role === 'Rescue / Response Team Member') {
    if (user.linkedOfficerId && complaint.assignedOfficerId === user.linkedOfficerId) {
      return true;
    }
    return complaint.priority === 'Critical' || complaint.severity === 'Critical' || complaint.status === 'Escalated';
  }
  return false;
}

export function isComplaintOverdue(complaint: Complaint, referenceTime = Date.now()): boolean {
  if (complaint.status === 'Resolved' || complaint.status === 'Rejected') {
    return false;
  }
  return new Date(complaint.resolutionDeadline).getTime() < referenceTime;
}

export function formatTimeRemaining(deadlineIso: string, status: Complaint['status'], referenceTime = Date.now()): {
  label: string;
  isOverdue: boolean;
  hoursDelta: number;
} {
  if (status === 'Resolved') {
    return { label: 'Completed', isOverdue: false, hoursDelta: 0 };
  }
  if (status === 'Rejected') {
    return { label: 'Closed (Rejected)', isOverdue: false, hoursDelta: 0 };
  }
  const diffMs = new Date(deadlineIso).getTime() - referenceTime;
  const absHours = Math.abs(diffMs) / (1000 * 60 * 60);
  const hoursRounded = Math.floor(absHours);
  const days = Math.floor(hoursRounded / 24);
  const remHours = hoursRounded % 24;

  if (diffMs < 0) {
    const label = days > 0 ? `Overdue by ${days}d ${remHours}h` : `Overdue by ${Math.max(1, hoursRounded)}h`;
    return { label, isOverdue: true, hoursDelta: -absHours };
  }
  const label = days > 0 ? `${days}d ${remHours}h remaining` : `${Math.max(1, hoursRounded)}h remaining`;
  return { label, isOverdue: false, hoursDelta: absHours };
}
