export type AdminRole =
  | 'Super Admin'
  | 'State Admin'
  | 'District Admin'
  | 'Field Officer'
  | 'Rescue / Response Team Member';

export type ComplaintStatus =
  | 'New'
  | 'Reviewed'
  | 'Pending'
  | 'In Progress'
  | 'Resolution Submitted'
  | 'Resolved'
  | 'Escalated'
  | 'Rejected';

export type PriorityLevel = 'Critical' | 'High' | 'Medium' | 'Low';

export type ComplaintCategory =
  | 'Road Maintenance'
  | 'Sanitation'
  | 'Water Supply'
  | 'Electricity'
  | 'Drainage'
  | 'Public Infrastructure';

export type OfficerAvailability = 'Available' | 'On Field Duty' | 'At Capacity' | 'Off Duty';

export interface EvidencePhoto {
  id: string;
  url: string;
  caption: string;
  type: 'Original' | 'Supporting' | 'Progress' | 'Resolution';
  uploadedBy: string;
  uploadedAt: string;
}

export interface ComplaintHistoryEvent {
  id: string;
  timestamp: string;
  actorName: string;
  actorRole: AdminRole | 'Citizen';
  action: string;
  previousStatus?: ComplaintStatus;
  newStatus?: ComplaintStatus;
  remarks?: string;
}

export interface InternalRemark {
  id: string;
  authorName: string;
  authorRole: AdminRole;
  createdAt: string;
  text: string;
}

export interface CitizenInfo {
  name: string;
  phone: string;
  email: string;
  citizenId: string;
}

export interface Complaint {
  id: string;
  title: string;
  description: string;
  category: ComplaintCategory;
  severity: PriorityLevel;
  priority: PriorityLevel;
  status: ComplaintStatus;
  ward: string;
  district: string;
  address: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  reportedAt: string;
  resolutionDeadline: string;
  resolvedAt?: string;
  assignedDepartmentId: string | null;
  assignedOfficerId: string | null;
  assignmentInstructions?: string;
  escalationLevel: number;
  escalationReason?: string;
  rejectionReason?: string;
  citizen: CitizenInfo;
  evidencePhotos: EvidencePhoto[];
  internalRemarks: InternalRemark[];
  history: ComplaintHistoryEvent[];
}

export interface Department {
  id: string;
  code: string;
  name: string;
  headName: string;
  headEmployeeId: string;
  email: string;
  phone: string;
  slaTargetHours: number;
  activeWards: string[];
  status: 'Active' | 'Restructuring';
}

export interface Officer {
  id: string;
  employeeId: string;
  name: string;
  designation: string;
  departmentId: string;
  wardJurisdiction: string;
  district: string;
  email: string;
  phone: string;
  completedComplaints: number;
  availability: OfficerAvailability;
  status: 'Active' | 'Inactive';
  joinedDate: string;
}

export interface PortalUser {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  designation: string;
  role: AdminRole;
  departmentId: string | null;
  departmentName: string;
  jurisdiction: string;
  linkedOfficerId?: string;
  status: 'Active' | 'Inactive';
  lastLogin: string;
}

export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  actorName: string;
  actorRole: AdminRole;
  action: string;
  complaintId: string | null;
  previousStatus: string | null;
  newStatus: string | null;
  remarks: string;
}

export interface PortalNotification {
  id: string;
  title: string;
  detail: string;
  complaintId?: string;
  severity: 'critical' | 'warning' | 'info';
  createdAt: string;
  read: boolean;
}

export interface SystemSettings {
  municipalityName: string;
  administrativeRegion: string;
  portalCode: string;
  slaHours: Record<PriorityLevel, number>;
  autoEscalateOnBreachFlag: boolean;
  requireRejectionReason: boolean;
  requireActionConfirmation: boolean;
  citizenMaskingForFieldOfficers: boolean;
}

export interface ImageAnalysisResult {
  observedCondition: string;
  suggestedCategory: string;
  visibleHazards: string[];
  severityIndicators: string;
  recommendedVerificationSteps: string[];
  advisoryNotice: string;
}

export interface OperationalBriefingResult {
  summary: string;
  rootCauseAssessment: string;
  slaRiskAssessment: string;
  recommendedActions: string[];
  advisoryNotice: string;
}
