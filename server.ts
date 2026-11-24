import crypto from 'crypto';
import dotenv from 'dotenv';
import express, { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  SEED_ACTIVITY_LOGS,
  SEED_COMPLAINTS,
  SEED_DEPARTMENTS,
  SEED_NOTIFICATIONS,
  SEED_OFFICERS,
  SEED_SETTINGS,
  SEED_USERS,
} from './src/data/seedData';
import { canUserAccessComplaint, hasPermission } from './src/lib/rbac';
import type {
  ActivityLogEntry,
  Complaint,
  ComplaintStatus,
  Department,
  Officer,
  PortalNotification,
  PortalUser,
  PriorityLevel,
  SystemSettings,
} from './src/types/civic';

dotenv.config();

const PORT = 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

// In-memory municipal operations store (structured to mirror Supabase PostgreSQL tables)
const store: {
  complaints: Complaint[];
  departments: Department[];
  officers: Officer[];
  users: PortalUser[];
  activityLogs: ActivityLogEntry[];
  notifications: PortalNotification[];
  settings: SystemSettings;
} = {
  complaints: structuredClone(SEED_COMPLAINTS),
  departments: structuredClone(SEED_DEPARTMENTS),
  officers: structuredClone(SEED_OFFICERS),
  users: structuredClone(SEED_USERS),
  activityLogs: structuredClone(SEED_ACTIVITY_LOGS),
  notifications: structuredClone(SEED_NOTIFICATIONS),
  settings: structuredClone(SEED_SETTINGS),
};

// Signed bearer token helpers (HMAC-SHA256)
function signSessionToken(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ userId, issuedAt: Date.now() }),
    'utf8'
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifySessionToken(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return null;
  }
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      userId?: string;
    };
    return typeof decoded.userId === 'string' ? decoded.userId : null;
  } catch {
    return null;
  }
}

interface AuthedRequest extends Request {
  currentUser?: PortalUser;
}

function authenticate(req: AuthedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication token required.' });
    return;
  }
  const token = authHeader.slice('Bearer '.length).trim();
  const userId = verifySessionToken(token);
  if (!userId) {
    res.status(401).json({ error: 'Invalid or expired administrative session.' });
    return;
  }
  const user = store.users.find((u) => u.id === userId && u.status === 'Active');
  if (!user) {
    res.status(403).json({ error: 'Account is inactive or not authorized.' });
    return;
  }
  req.currentUser = user;
  next();
}

function redactComplaintForUser(complaint: Complaint, user: PortalUser): Complaint {
  if (hasPermission(user.role, 'view_citizen_full_info') || !store.settings.citizenMaskingForFieldOfficers) {
    return complaint;
  }
  return {
    ...complaint,
    citizen: {
      citizenId: complaint.citizen.citizenId,
      name: `${complaint.citizen.name.charAt(0)}. [Redacted]`,
      phone: 'Restricted (Admin Only)',
      email: 'Restricted (Admin Only)',
    },
  };
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in Settings > Secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function addAuditLog(entry: Omit<ActivityLogEntry, 'id' | 'timestamp'>): ActivityLogEntry {
  const created: ActivityLogEntry = {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };
  store.activityLogs.unshift(created);
  return created;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '12mb' }));

  // Issue administrative session token for selected official
  app.post('/api/auth/session', (req, res) => {
    const { userId } = req.body as { userId?: string };
    if (typeof userId !== 'string') {
      res.status(400).json({ error: 'userId is required.' });
      return;
    }
    const user = store.users.find((u) => u.id === userId && u.status === 'Active');
    if (!user) {
      res.status(404).json({ error: 'Active official account not found.' });
      return;
    }
    user.lastLogin = new Date().toISOString();
    const token = signSessionToken(user.id);
    res.json({ token, user });
  });

  // Public list of active official profiles for demo portal login selector (non-sensitive display fields)
  app.get('/api/auth/directory', (_req, res) => {
    const accounts = store.users
      .filter((u) => u.status === 'Active')
      .map((u) => ({
        id: u.id,
        employeeId: u.employeeId,
        name: u.name,
        designation: u.designation,
        role: u.role,
        departmentName: u.departmentName,
        jurisdiction: u.jurisdiction,
      }));
    res.json({ accounts, municipalityName: store.settings.municipalityName });
  });

  // Authenticated portal snapshot scoped strictly by RBAC
  app.get('/api/portal-state', authenticate, (req: AuthedRequest, res) => {
    const user = req.currentUser!;
    const scopedComplaints = store.complaints
      .filter((c) => canUserAccessComplaint(user, c))
      .map((c) => redactComplaintForUser(c, user));

    const allowedComplaintIds = new Set(scopedComplaints.map((c) => c.id));
    const scopedLogs = hasPermission(user.role, 'view_activity_logs')
      ? store.activityLogs.filter((l) => !l.complaintId || allowedComplaintIds.has(l.complaintId))
      : [];

    const scopedNotifications = store.notifications.filter(
      (n) => !n.complaintId || allowedComplaintIds.has(n.complaintId)
    );

    const visibleUsers = hasPermission(user.role, 'manage_users')
      ? store.users
      : [user];

    res.json({
      currentUser: user,
      complaints: scopedComplaints,
      departments: store.departments,
      officers: hasPermission(user.role, 'view_staff') || hasPermission(user.role, 'assign_complaint')
        ? store.officers
        : store.officers.filter((o) => !user.departmentId || o.departmentId === user.departmentId),
      users: visibleUsers,
      activityLogs: scopedLogs,
      notifications: scopedNotifications,
      settings: store.settings,
    });
  });

  // Administrative actions on a complaint
  app.post('/api/complaints/:id/action', authenticate, (req: AuthedRequest, res) => {
    const user = req.currentUser!;
    const complaint = store.complaints.find((c) => c.id === req.params.id);
    if (!complaint) {
      res.status(404).json({ error: 'Complaint record not found.' });
      return;
    }
    if (!canUserAccessComplaint(user, complaint)) {
      res.status(403).json({ error: 'Access denied: complaint is outside your authorized scope.' });
      return;
    }

    const body = req.body as {
      actionType:
        | 'review'
        | 'change_priority'
        | 'assign'
        | 'update_progress'
        | 'verify_resolution'
        | 'reject'
        | 'escalate'
        | 'add_remark'
        | 'add_evidence';
      priority?: PriorityLevel;
      departmentId?: string;
      officerId?: string | null;
      resolutionDeadline?: string;
      instructions?: string;
      status?: ComplaintStatus;
      reason?: string;
      remark?: string;
      photoUrl?: string;
      photoCaption?: string;
      photoType?: 'Supporting' | 'Progress' | 'Resolution';
    };

    const prevStatus = complaint.status;
    const nowIso = new Date().toISOString();

    switch (body.actionType) {
      case 'review': {
        if (!hasPermission(user.role, 'review_complaint')) {
          res.status(403).json({ error: 'Insufficient privileges to review complaints.' });
          return;
        }
        const nextStatus: ComplaintStatus = complaint.status === 'New' ? 'Reviewed' : complaint.status;
        complaint.status = nextStatus;
        complaint.history.push({
          id: `h-${Date.now()}`,
          timestamp: nowIso,
          actorName: user.name,
          actorRole: user.role,
          action: 'Complaint reviewed by administration',
          previousStatus: prevStatus,
          newStatus: nextStatus,
          remarks: body.remark?.trim() || undefined,
        });
        addAuditLog({
          actorName: user.name,
          actorRole: user.role,
          action: 'Reviewed Complaint',
          complaintId: complaint.id,
          previousStatus: prevStatus,
          newStatus: nextStatus,
          remarks: body.remark?.trim() || 'Administrative review completed.',
        });
        break;
      }

      case 'change_priority': {
        if (!hasPermission(user.role, 'change_priority')) {
          res.status(403).json({ error: 'Insufficient privileges to change complaint priority.' });
          return;
        }
        if (!body.priority || !['Critical', 'High', 'Medium', 'Low'].includes(body.priority)) {
          res.status(400).json({ error: 'Valid priority level is required.' });
          return;
        }
        const oldPriority = complaint.priority;
        complaint.priority = body.priority;
        complaint.history.push({
          id: `h-${Date.now()}`,
          timestamp: nowIso,
          actorName: user.name,
          actorRole: user.role,
          action: `Priority changed from ${oldPriority} to ${body.priority}`,
          previousStatus: prevStatus,
          newStatus: complaint.status,
          remarks: body.remark?.trim() || undefined,
        });
        addAuditLog({
          actorName: user.name,
          actorRole: user.role,
          action: `Changed Priority (${oldPriority} -> ${body.priority})`,
          complaintId: complaint.id,
          previousStatus: prevStatus,
          newStatus: complaint.status,
          remarks: body.remark?.trim() || `Priority updated to ${body.priority}.`,
        });
        break;
      }

      case 'assign': {
        const isReassign = Boolean(complaint.assignedDepartmentId || complaint.assignedOfficerId);
        if (
          !hasPermission(user.role, isReassign ? 'reassign_complaint' : 'assign_complaint')
        ) {
          res.status(403).json({ error: 'Insufficient privileges to assign complaints.' });
          return;
        }
        const dept = store.departments.find((d) => d.id === body.departmentId);
        if (!dept) {
          res.status(400).json({ error: 'Selected department does not exist.' });
          return;
        }
        let officer: Officer | undefined;
        if (body.officerId) {
          officer = store.officers.find((o) => o.id === body.officerId && o.status === 'Active');
          if (!officer) {
            res.status(400).json({ error: 'Selected officer is unavailable or inactive.' });
            return;
          }
          if (officer.departmentId !== dept.id) {
            res.status(403).json({
              error: 'Scope violation: officer does not belong to the selected department.',
            });
            return;
          }
        }
        complaint.assignedDepartmentId = dept.id;
        complaint.assignedOfficerId = officer ? officer.id : null;
        if (body.resolutionDeadline) {
          complaint.resolutionDeadline = new Date(body.resolutionDeadline).toISOString();
        }
        if (body.instructions !== undefined) {
          complaint.assignmentInstructions = body.instructions.trim();
        }
        const nextStatus: ComplaintStatus =
          complaint.status === 'New' || complaint.status === 'Reviewed' ? 'Pending' : complaint.status;
        complaint.status = nextStatus;
        const actionDesc = officer
          ? `${isReassign ? 'Reassigned' : 'Assigned'} to ${dept.name} (${officer.name})`
          : `${isReassign ? 'Reassigned' : 'Assigned'} to ${dept.name}`;
        complaint.history.push({
          id: `h-${Date.now()}`,
          timestamp: nowIso,
          actorName: user.name,
          actorRole: user.role,
          action: actionDesc,
          previousStatus: prevStatus,
          newStatus: nextStatus,
          remarks: body.instructions?.trim() || undefined,
        });
        addAuditLog({
          actorName: user.name,
          actorRole: user.role,
          action: isReassign ? 'Reassigned Complaint' : 'Assigned Department & Officer',
          complaintId: complaint.id,
          previousStatus: prevStatus,
          newStatus: nextStatus,
          remarks: body.instructions?.trim() || actionDesc,
        });
        break;
      }

      case 'update_progress': {
        if (!hasPermission(user.role, 'update_field_progress') && !hasPermission(user.role, 'assign_complaint')) {
          res.status(403).json({ error: 'Insufficient privileges to update field work progress.' });
          return;
        }
        const allowedTargets: ComplaintStatus[] = ['In Progress', 'Resolution Submitted'];
        if (!body.status || !allowedTargets.includes(body.status)) {
          res.status(400).json({ error: 'Invalid progress status transition.' });
          return;
        }
        complaint.status = body.status;
        complaint.history.push({
          id: `h-${Date.now()}`,
          timestamp: nowIso,
          actorName: user.name,
          actorRole: user.role,
          action:
            body.status === 'In Progress'
              ? 'Field work started'
              : 'Resolution evidence submitted for verification',
          previousStatus: prevStatus,
          newStatus: body.status,
          remarks: body.remark?.trim() || undefined,
        });
        addAuditLog({
          actorName: user.name,
          actorRole: user.role,
          action:
            body.status === 'In Progress'
              ? 'Started Field Work'
              : 'Submitted Resolution Evidence',
          complaintId: complaint.id,
          previousStatus: prevStatus,
          newStatus: body.status,
          remarks: body.remark?.trim() || `Status updated to ${body.status}.`,
        });
        break;
      }

      case 'verify_resolution': {
        if (!hasPermission(user.role, 'verify_resolution')) {
          res.status(403).json({ error: 'Only authorized administrators can verify final resolution.' });
          return;
        }
        complaint.status = 'Resolved';
        complaint.resolvedAt = nowIso;
        if (complaint.assignedOfficerId) {
          const off = store.officers.find((o) => o.id === complaint.assignedOfficerId);
          if (off) off.completedComplaints += 1;
        }
        complaint.history.push({
          id: `h-${Date.now()}`,
          timestamp: nowIso,
          actorName: user.name,
          actorRole: user.role,
          action: 'Resolution verified and complaint closed',
          previousStatus: prevStatus,
          newStatus: 'Resolved',
          remarks: body.remark?.trim() || undefined,
        });
        addAuditLog({
          actorName: user.name,
          actorRole: user.role,
          action: 'Verified Resolution',
          complaintId: complaint.id,
          previousStatus: prevStatus,
          newStatus: 'Resolved',
          remarks: body.remark?.trim() || 'Resolution verified against municipal standards.',
        });
        break;
      }

      case 'reject': {
        if (!hasPermission(user.role, 'reject_complaint')) {
          res.status(403).json({ error: 'Insufficient privileges to reject complaints.' });
          return;
        }
        if (!body.reason || !body.reason.trim()) {
          res.status(400).json({ error: 'A formal administrative rejection reason is mandatory.' });
          return;
        }
        complaint.status = 'Rejected';
        complaint.rejectionReason = body.reason.trim();
        complaint.history.push({
          id: `h-${Date.now()}`,
          timestamp: nowIso,
          actorName: user.name,
          actorRole: user.role,
          action: 'Complaint rejected by authorized official',
          previousStatus: prevStatus,
          newStatus: 'Rejected',
          remarks: body.reason.trim(),
        });
        addAuditLog({
          actorName: user.name,
          actorRole: user.role,
          action: 'Rejected Complaint',
          complaintId: complaint.id,
          previousStatus: prevStatus,
          newStatus: 'Rejected',
          remarks: body.reason.trim(),
        });
        break;
      }

      case 'escalate': {
        if (!hasPermission(user.role, 'escalate_complaint')) {
          res.status(403).json({ error: 'Insufficient privileges to escalate complaints.' });
          return;
        }
        if (!body.reason || !body.reason.trim()) {
          res.status(400).json({ error: 'Escalation justification is required.' });
          return;
        }
        complaint.status = 'Escalated';
        complaint.escalationLevel = Math.min(3, complaint.escalationLevel + 1);
        complaint.escalationReason = body.reason.trim();
        if (complaint.priority !== 'Critical') {
          complaint.priority = 'Critical';
        }
        complaint.history.push({
          id: `h-${Date.now()}`,
          timestamp: nowIso,
          actorName: user.name,
          actorRole: user.role,
          action: `Escalated to Level ${complaint.escalationLevel}`,
          previousStatus: prevStatus,
          newStatus: 'Escalated',
          remarks: body.reason.trim(),
        });
        addAuditLog({
          actorName: user.name,
          actorRole: user.role,
          action: `Escalated Complaint (Level ${complaint.escalationLevel})`,
          complaintId: complaint.id,
          previousStatus: prevStatus,
          newStatus: 'Escalated',
          remarks: body.reason.trim(),
        });
        store.notifications.unshift({
          id: `notif-${Date.now()}`,
          title: `Escalated: ${complaint.id}`,
          detail: `${user.name} escalated ${complaint.title} to Level ${complaint.escalationLevel}.`,
          complaintId: complaint.id,
          severity: 'critical',
          createdAt: nowIso,
          read: false,
        });
        break;
      }

      case 'add_remark': {
        if (!hasPermission(user.role, 'add_remarks')) {
          res.status(403).json({ error: 'Insufficient privileges to add internal remarks.' });
          return;
        }
        if (!body.remark || !body.remark.trim()) {
          res.status(400).json({ error: 'Remark text cannot be empty.' });
          return;
        }
        complaint.internalRemarks.push({
          id: `rem-${Date.now()}`,
          authorName: user.name,
          authorRole: user.role,
          createdAt: nowIso,
          text: body.remark.trim(),
        });
        addAuditLog({
          actorName: user.name,
          actorRole: user.role,
          action: 'Added Internal Remark',
          complaintId: complaint.id,
          previousStatus: prevStatus,
          newStatus: complaint.status,
          remarks: body.remark.trim(),
        });
        break;
      }

      case 'add_evidence': {
        if (!hasPermission(user.role, 'upload_evidence')) {
          res.status(403).json({ error: 'Insufficient privileges to upload evidence photographs.' });
          return;
        }
        if (!body.photoUrl || typeof body.photoUrl !== 'string') {
          res.status(400).json({ error: 'Valid image payload is required.' });
          return;
        }
        // Only permit data:image/* or safe relative /src/assets/images/ URLs
        const isSafeImage =
          body.photoUrl.startsWith('data:image/') ||
          body.photoUrl.startsWith('/src/assets/images/');
        if (!isSafeImage) {
          res.status(400).json({ error: 'Unsupported evidence image format.' });
          return;
        }
        complaint.evidencePhotos.push({
          id: `ev-${Date.now()}`,
          url: body.photoUrl,
          caption: body.photoCaption?.trim() || 'Field inspection photograph',
          type: body.photoType || 'Progress',
          uploadedBy: user.name,
          uploadedAt: nowIso,
        });
        addAuditLog({
          actorName: user.name,
          actorRole: user.role,
          action: `Uploaded ${body.photoType || 'Progress'} Evidence`,
          complaintId: complaint.id,
          previousStatus: prevStatus,
          newStatus: complaint.status,
          remarks: body.photoCaption?.trim() || 'Uploaded photograph evidence.',
        });
        break;
      }

      default:
        res.status(400).json({ error: 'Unsupported complaint action.' });
        return;
    }

    res.json({
      complaint: redactComplaintForUser(complaint, user),
      activityLogs: store.activityLogs,
    });
  });

  // Departments CRUD
  app.post('/api/departments', authenticate, (req: AuthedRequest, res) => {
    const user = req.currentUser!;
    if (!hasPermission(user.role, 'manage_departments')) {
      res.status(403).json({ error: 'Insufficient privileges to create departments.' });
      return;
    }
    const { code, name, headName, headEmployeeId, email, phone, slaTargetHours, activeWards } =
      req.body as Partial<Department>;
    if (!name?.trim() || !code?.trim() || !headName?.trim()) {
      res.status(400).json({ error: 'Department code, name, and department head are required.' });
      return;
    }
    const created: Department = {
      id: `dept-${Date.now()}`,
      code: code.trim().toUpperCase(),
      name: name.trim(),
      headName: headName.trim(),
      headEmployeeId: headEmployeeId?.trim() || 'EMP-1099',
      email: email?.trim() || 'dept@civictrack.gov',
      phone: phone?.trim() || '+1 (312) 555-0190',
      slaTargetHours: Number(slaTargetHours) || 48,
      activeWards: Array.isArray(activeWards) && activeWards.length > 0 ? activeWards : ['Ward 01 - Central'],
      status: 'Active',
    };
    store.departments.push(created);
    addAuditLog({
      actorName: user.name,
      actorRole: user.role,
      action: 'Created Department',
      complaintId: null,
      previousStatus: null,
      newStatus: 'Active',
      remarks: `Created department ${created.name} (${created.code}) headed by ${created.headName}.`,
    });
    res.json({ department: created });
  });

  app.put('/api/departments/:id', authenticate, (req: AuthedRequest, res) => {
    const user = req.currentUser!;
    if (!hasPermission(user.role, 'manage_departments')) {
      res.status(403).json({ error: 'Insufficient privileges to update departments.' });
      return;
    }
    const dept = store.departments.find((d) => d.id === req.params.id);
    if (!dept) {
      res.status(404).json({ error: 'Department not found.' });
      return;
    }
    const { name, code, headName, headEmployeeId, email, phone, slaTargetHours, status } =
      req.body as Partial<Department>;
    if (name) dept.name = name.trim();
    if (code) dept.code = code.trim().toUpperCase();
    if (headName) dept.headName = headName.trim();
    if (headEmployeeId) dept.headEmployeeId = headEmployeeId.trim();
    if (email) dept.email = email.trim();
    if (phone) dept.phone = phone.trim();
    if (slaTargetHours) dept.slaTargetHours = Number(slaTargetHours);
    if (status === 'Active' || status === 'Restructuring') dept.status = status;

    addAuditLog({
      actorName: user.name,
      actorRole: user.role,
      action: 'Updated Department',
      complaintId: null,
      previousStatus: null,
      newStatus: dept.status,
      remarks: `Updated ${dept.name} (Head: ${dept.headName}).`,
    });
    res.json({ department: dept });
  });

  // Officers CRUD
  app.post('/api/officers', authenticate, (req: AuthedRequest, res) => {
    const user = req.currentUser!;
    if (!hasPermission(user.role, 'manage_staff')) {
      res.status(403).json({ error: 'Insufficient privileges to add officers.' });
      return;
    }
    const body = req.body as Partial<Officer>;
    if (!body.name?.trim() || !body.employeeId?.trim() || !body.departmentId) {
      res.status(400).json({ error: 'Officer name, employee ID, and department are required.' });
      return;
    }
    const created: Officer = {
      id: `off-${Date.now()}`,
      employeeId: body.employeeId.trim().toUpperCase(),
      name: body.name.trim(),
      designation: body.designation?.trim() || 'Field Officer',
      departmentId: body.departmentId,
      wardJurisdiction: body.wardJurisdiction || 'Ward 01 - Central',
      district: body.district || 'Central Metro District',
      email: body.email?.trim() || 'officer@civictrack.gov',
      phone: body.phone?.trim() || '+1 (312) 555-0299',
      completedComplaints: 0,
      availability: body.availability || 'Available',
      status: 'Active',
      joinedDate: new Date().toISOString().slice(0, 10),
    };
    store.officers.push(created);
    addAuditLog({
      actorName: user.name,
      actorRole: user.role,
      action: 'Added Field Officer',
      complaintId: null,
      previousStatus: null,
      newStatus: 'Active',
      remarks: `Added ${created.name} (${created.employeeId}) to ${created.wardJurisdiction}.`,
    });
    res.json({ officer: created });
  });

  app.put('/api/officers/:id', authenticate, (req: AuthedRequest, res) => {
    const user = req.currentUser!;
    if (!hasPermission(user.role, 'manage_staff')) {
      res.status(403).json({ error: 'Insufficient privileges to modify officers.' });
      return;
    }
    const officer = store.officers.find((o) => o.id === req.params.id);
    if (!officer) {
      res.status(404).json({ error: 'Officer record not found.' });
      return;
    }
    const body = req.body as Partial<Officer>;
    if (body.name) officer.name = body.name.trim();
    if (body.designation) officer.designation = body.designation.trim();
    if (body.departmentId) officer.departmentId = body.departmentId;
    if (body.wardJurisdiction) officer.wardJurisdiction = body.wardJurisdiction;
    if (body.district) officer.district = body.district;
    if (body.email) officer.email = body.email.trim();
    if (body.phone) officer.phone = body.phone.trim();
    if (body.availability) officer.availability = body.availability;
    if (body.status === 'Active' || body.status === 'Inactive') {
      officer.status = body.status;
    }
    addAuditLog({
      actorName: user.name,
      actorRole: user.role,
      action: 'Updated Officer Record',
      complaintId: null,
      previousStatus: null,
      newStatus: officer.status,
      remarks: `Updated ${officer.name} (${officer.employeeId}) — Status: ${officer.status}.`,
    });
    res.json({ officer });
  });

  // Portal Users CRUD (Super Admin only)
  app.post('/api/users', authenticate, (req: AuthedRequest, res) => {
    const user = req.currentUser!;
    if (!hasPermission(user.role, 'manage_users')) {
      res.status(403).json({ error: 'Super Admin role required for user management.' });
      return;
    }
    const body = req.body as Partial<PortalUser>;
    if (!body.name?.trim() || !body.email?.trim() || !body.role || !body.employeeId?.trim()) {
      res.status(400).json({ error: 'Name, email, employee ID, and role are required.' });
      return;
    }
    const dept = store.departments.find((d) => d.id === body.departmentId);
    const created: PortalUser = {
      id: `usr-${Date.now()}`,
      employeeId: body.employeeId.trim().toUpperCase(),
      name: body.name.trim(),
      email: body.email.trim(),
      designation: body.designation?.trim() || body.role,
      role: body.role,
      departmentId: dept ? dept.id : null,
      departmentName: dept ? dept.name : body.departmentName || 'Municipal Administration',
      jurisdiction: body.jurisdiction || 'All Districts',
      status: 'Active',
      lastLogin: new Date().toISOString(),
    };
    store.users.push(created);
    addAuditLog({
      actorName: user.name,
      actorRole: user.role,
      action: 'Created Administrative User',
      complaintId: null,
      previousStatus: null,
      newStatus: 'Active',
      remarks: `Provisioned ${created.name} as ${created.role}.`,
    });
    res.json({ user: created });
  });

  app.put('/api/users/:id', authenticate, (req: AuthedRequest, res) => {
    const user = req.currentUser!;
    if (!hasPermission(user.role, 'manage_users')) {
      res.status(403).json({ error: 'Super Admin role required for user management.' });
      return;
    }
    const target = store.users.find((u) => u.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'Administrative user not found.' });
      return;
    }
    const body = req.body as Partial<PortalUser>;
    if (body.name) target.name = body.name.trim();
    if (body.designation) target.designation = body.designation.trim();
    if (body.role) target.role = body.role;
    if (body.jurisdiction) target.jurisdiction = body.jurisdiction;
    if (body.status === 'Active' || body.status === 'Inactive') target.status = body.status;

    addAuditLog({
      actorName: user.name,
      actorRole: user.role,
      action: 'Updated Administrative User',
      complaintId: null,
      previousStatus: null,
      newStatus: target.status,
      remarks: `Updated ${target.name} (${target.role}) — Status: ${target.status}.`,
    });
    res.json({ user: target });
  });

  // System Settings (Super Admin only)
  app.put('/api/settings', authenticate, (req: AuthedRequest, res) => {
    const user = req.currentUser!;
    if (!hasPermission(user.role, 'manage_settings')) {
      res.status(403).json({ error: 'Super Admin role required to update system settings.' });
      return;
    }
    const body = req.body as Partial<SystemSettings>;
    store.settings = {
      ...store.settings,
      ...body,
      slaHours: {
        ...store.settings.slaHours,
        ...(body.slaHours || {}),
      },
    };
    addAuditLog({
      actorName: user.name,
      actorRole: user.role,
      action: 'Updated System Settings',
      complaintId: null,
      previousStatus: null,
      newStatus: null,
      remarks: 'Updated municipal SLA thresholds and portal governance policies.',
    });
    res.json({ settings: store.settings });
  });

  app.post('/api/notifications/mark-read', authenticate, (_req: AuthedRequest, res) => {
    store.notifications.forEach((n) => {
      n.read = true;
    });
    res.json({ notifications: store.notifications });
  });

  // Server-Side Gemini API: Photo Evidence Inspection (Advisory Only)
  app.post('/api/ai/analyze-image', authenticate, async (req: AuthedRequest, res) => {
    try {
      const { imageBase64, mimeType, assetPath, complaintContext } = req.body as {
        imageBase64?: string;
        mimeType?: string;
        assetPath?: string;
        complaintContext?: string;
      };

      let finalBase64 = imageBase64;
      let finalMime = mimeType || 'image/jpeg';

      // Safely allow reading local generated evidence photos inside src/assets/images
      if (!finalBase64 && assetPath) {
        const baseDir = path.resolve(process.cwd(), 'src', 'assets', 'images');
        const requestedName = path.basename(assetPath);
        const resolvedPath = path.resolve(baseDir, requestedName);
        if (!resolvedPath.startsWith(baseDir + path.sep) || !fs.existsSync(resolvedPath)) {
          res.status(400).json({ error: 'Invalid or missing evidence asset path.' });
          return;
        }
        finalBase64 = fs.readFileSync(resolvedPath).toString('base64');
        finalMime = resolvedPath.endsWith('.png') ? 'image/png' : 'image/jpeg';
      }

      if (!finalBase64) {
        res.status(400).json({ error: 'Image data is required for evidence analysis.' });
        return;
      }

      // Strip data URL prefix if sent directly
      if (finalBase64.includes(',')) {
        const [prefix, raw] = finalBase64.split(',', 2);
        const match = prefix.match(/data:(image\/[a-zA-Z0-9.+-]+);base64/);
        if (match) finalMime = match[1];
        finalBase64 = raw;
      }

      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: finalMime,
                data: finalBase64,
              },
            },
            {
              text: `Inspect this municipal civic evidence photograph. Context: ${
                complaintContext || 'Municipal complaint field photo'
              }. Provide objective visual inspection findings to assist the authorized government official. Never recommend auto-closing or auto-rejecting.`,
            },
          ],
        },
        config: {
          systemInstruction:
            'You are a municipal engineering and civic inspection assistant. Provide factual, structured visual observations from field photographs to support human government officials. Never issue final administrative rejections or closures.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              observedCondition: {
                type: Type.STRING,
                description: 'Objective description of infrastructure or civic condition shown.',
              },
              suggestedCategory: {
                type: Type.STRING,
                description: 'Likely municipal department category.',
              },
              visibleHazards: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'List of observable safety or public hazards.',
              },
              severityIndicators: {
                type: Type.STRING,
                description: 'Observable severity indicators for human prioritization review.',
              },
              recommendedVerificationSteps: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Suggested field verification steps for municipal staff.',
              },
              advisoryNotice: {
                type: Type.STRING,
                description: 'Explicit statement that final decision rests with authorized officials.',
              },
            },
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json({ analysis: parsed });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to analyze image evidence.';
      res.status(500).json({ error: message });
    }
  });

  // Server-Side Gemini API: High-Thinking Operational Briefing (Advisory Only)
  app.post('/api/ai/operational-briefing', authenticate, async (req: AuthedRequest, res) => {
    try {
      const user = req.currentUser!;
      const { query, complaintId } = req.body as { query?: string; complaintId?: string };
      if (!query || !query.trim()) {
        res.status(400).json({ error: 'Operational query is required.' });
        return;
      }

      const accessibleComplaints = store.complaints.filter((c) => canUserAccessComplaint(user, c));
      let contextPayload = '';
      if (complaintId) {
        const target = accessibleComplaints.find((c) => c.id === complaintId);
        if (!target) {
          res.status(404).json({ error: 'Complaint not found within your scope.' });
          return;
        }
        contextPayload = JSON.stringify({
          complaint: redactComplaintForUser(target, user),
          departments: store.departments,
        });
      } else {
        const summaryRecords = accessibleComplaints.map((c) => ({
          id: c.id,
          title: c.title,
          category: c.category,
          priority: c.priority,
          status: c.status,
          ward: c.ward,
          reportedAt: c.reportedAt,
          resolutionDeadline: c.resolutionDeadline,
          departmentId: c.assignedDepartmentId,
          escalationLevel: c.escalationLevel,
        }));
        contextPayload = JSON.stringify({
          totalScopedComplaints: summaryRecords.length,
          complaints: summaryRecords,
          departments: store.departments.map((d) => ({
            id: d.id,
            name: d.name,
            slaTargetHours: d.slaTargetHours,
          })),
        });
      }

      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Official Role: ${user.role}\nQuery: ${query.trim()}\n\nOperational Data:\n${contextPayload}`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
          systemInstruction:
            'You are a senior municipal operations analyst assisting authorized government officials. Analyze SLA bottlenecks, resource allocation, root causes, and escalation risks based strictly on the provided municipal data. Provide concise, formal, actionable administrative guidance. Never auto-reject or auto-close complaints.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: {
                type: Type.STRING,
                description: 'Executive summary answering the official query.',
              },
              rootCauseAssessment: {
                type: Type.STRING,
                description: 'Key operational or infrastructural root-cause patterns observed.',
              },
              slaRiskAssessment: {
                type: Type.STRING,
                description: 'Assessment of overdue complaints and SLA compliance risks.',
              },
              recommendedActions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Concrete recommended actions for authorized officials.',
              },
              advisoryNotice: {
                type: Type.STRING,
                description: 'Confirmation that all administrative decisions remain with authorized officials.',
              },
            },
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json({ briefing: parsed });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to generate operational briefing.';
      res.status(500).json({ error: message });
    }
  });

  // Vite middleware in development, static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CivicTrack Government Portal listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Server failed to start:', err);
  process.exit(1);
});
