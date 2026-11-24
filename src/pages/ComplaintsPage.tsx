import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PriorityLabel, StatusLabel, formatDateTime, formatShortDate } from '../components/StatusLabels';
import { usePortal } from '../context/PortalContext';
import { formatTimeRemaining, hasPermission, isComplaintOverdue } from '../lib/rbac';
import type { Complaint, ComplaintCategory, ComplaintStatus, PriorityLevel } from '../types/civic';
import { exportToCsv } from '../utils/csvExport';

export type ComplaintQueueType =
  | 'all'
  | 'new'
  | 'pending'
  | 'in-progress'
  | 'resolved'
  | 'escalated';

const REFERENCE_NOW = new Date('2026-11-24T09:15:00Z').getTime();

export const ComplaintsPage: React.FC<{ queue?: ComplaintQueueType }> = ({ queue = 'all' }) => {
  const {
    currentUser,
    complaints,
    departments,
    officers,
    globalSearch,
    performComplaintAction,
  } = usePortal();

  const [searchTerm, setSearchTerm] = useState(globalSearch);
  const [categoryFilter, setCategoryFilter] = useState<ComplaintCategory | 'All'>('All');
  const [priorityFilter, setPriorityFilter] = useState<PriorityLevel | 'All'>('All');
  const [wardFilter, setWardFilter] = useState<string>('All');
  const [departmentFilter, setDepartmentFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<ComplaintStatus | 'All'>('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [sortBy, setSortBy] = useState<'reportedAt' | 'deadline' | 'priority'>('reportedAt');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [escalateTarget, setEscalateTarget] = useState<Complaint | null>(null);
  const [escalateReason, setEscalateReason] = useState('');

  useEffect(() => {
    setSearchTerm(globalSearch);
    setPage(1);
  }, [globalSearch]);

  useEffect(() => {
    setPage(1);
  }, [queue]);

  const deptMap = useMemo(
    () => Object.fromEntries(departments.map((d) => [d.id, d])),
    [departments]
  );
  const officerMap = useMemo(
    () => Object.fromEntries(officers.map((o) => [o.id, o])),
    [officers]
  );

  const uniqueWards = useMemo(
    () => Array.from(new Set(complaints.map((c) => c.ward))).sort(),
    [complaints]
  );

  const queueCounts = useMemo(
    () => ({
      all: complaints.length,
      new: complaints.filter((c) => c.status === 'New' || c.status === 'Reviewed').length,
      pending: complaints.filter((c) => c.status === 'Pending').length,
      inProgress: complaints.filter(
        (c) => c.status === 'In Progress' || c.status === 'Resolution Submitted'
      ).length,
      resolved: complaints.filter((c) => c.status === 'Resolved').length,
      escalated: complaints.filter(
        (c) =>
          c.status === 'Escalated' ||
          c.priority === 'Critical' ||
          isComplaintOverdue(c, REFERENCE_NOW)
      ).length,
    }),
    [complaints]
  );

  const queueBaseComplaints = useMemo(() => {
    return complaints.filter((c) => {
      if (queue === 'new') return c.status === 'New' || c.status === 'Reviewed';
      if (queue === 'pending') return c.status === 'Pending';
      if (queue === 'in-progress')
        return c.status === 'In Progress' || c.status === 'Resolution Submitted';
      if (queue === 'resolved') return c.status === 'Resolved';
      if (queue === 'escalated')
        return (
          c.status === 'Escalated' ||
          c.priority === 'Critical' ||
          isComplaintOverdue(c, REFERENCE_NOW)
        );
      return true;
    });
  }, [complaints, queue]);

  const priorityRank: Record<PriorityLevel, number> = {
    Critical: 4,
    High: 3,
    Medium: 2,
    Low: 1,
  };

  const filteredComplaints = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return queueBaseComplaints
      .filter((c) => {
        if (categoryFilter !== 'All' && c.category !== categoryFilter) return false;
        if (priorityFilter !== 'All' && c.priority !== priorityFilter) return false;
        if (wardFilter !== 'All' && c.ward !== wardFilter) return false;
        if (departmentFilter !== 'All') {
          if (departmentFilter === 'unassigned' && c.assignedDepartmentId !== null) return false;
          if (departmentFilter !== 'unassigned' && c.assignedDepartmentId !== departmentFilter)
            return false;
        }
        if (statusFilter !== 'All' && c.status !== statusFilter) return false;
        if (overdueOnly && !isComplaintOverdue(c, REFERENCE_NOW)) return false;
        if (dateFrom && c.reportedAt.slice(0, 10) < dateFrom) return false;
        if (dateTo && c.reportedAt.slice(0, 10) > dateTo) return false;
        if (!q) return true;
        return (
          c.id.toLowerCase().includes(q) ||
          c.title.toLowerCase().includes(q) ||
          c.address.toLowerCase().includes(q) ||
          c.ward.toLowerCase().includes(q) ||
          c.citizen.name.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        let cmp = 0;
        if (sortBy === 'reportedAt') {
          cmp = new Date(a.reportedAt).getTime() - new Date(b.reportedAt).getTime();
        } else if (sortBy === 'deadline') {
          cmp = new Date(a.resolutionDeadline).getTime() - new Date(b.resolutionDeadline).getTime();
        } else {
          cmp = priorityRank[a.priority] - priorityRank[b.priority];
        }
        return sortDir === 'desc' ? -cmp : cmp;
      });
  }, [
    queueBaseComplaints,
    searchTerm,
    categoryFilter,
    priorityFilter,
    wardFilter,
    departmentFilter,
    statusFilter,
    overdueOnly,
    dateFrom,
    dateTo,
    sortBy,
    sortDir,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredComplaints.length / pageSize));
  const pagedComplaints = filteredComplaints.slice((page - 1) * pageSize, page * pageSize);

  const canEscalate = currentUser ? hasPermission(currentUser.role, 'escalate_complaint') : false;
  const canExport = currentUser ? hasPermission(currentUser.role, 'export_reports') : false;
  const isAdminOrSupervisory =
    currentUser?.role === 'Super Admin' ||
    currentUser?.role === 'State Admin' ||
    currentUser?.role === 'District Admin';

  const handleExportCsv = () => {
    exportToCsv(
      `civictrack-${queue}-complaints.csv`,
      [
        'Complaint ID',
        'Issue Title',
        'Category',
        'Priority',
        'Ward',
        'Department',
        'Officer',
        'Reported At',
        'Resolution Deadline',
        'Status',
        'SLA Status',
      ],
      filteredComplaints.map((c) => {
        const sla = formatTimeRemaining(c.resolutionDeadline, c.status, REFERENCE_NOW);
        return [
          c.id,
          c.title,
          c.category,
          c.priority,
          c.ward,
          c.assignedDepartmentId ? deptMap[c.assignedDepartmentId]?.name : 'Unassigned',
          c.assignedOfficerId ? officerMap[c.assignedOfficerId]?.name : 'Unassigned',
          formatDateTime(c.reportedAt),
          formatDateTime(c.resolutionDeadline),
          c.status,
          sla.isOverdue ? `BREACHED (${sla.label})` : sla.label,
        ];
      })
    );
  };

  const resetFilters = () => {
    setSearchTerm('');
    setCategoryFilter('All');
    setPriorityFilter('All');
    setWardFilter('All');
    setDepartmentFilter('All');
    setStatusFilter('All');
    setDateFrom('');
    setDateTo('');
    setOverdueOnly(false);
    setPage(1);
  };

  const activeAdvancedCount =
    (wardFilter !== 'All' ? 1 : 0) +
    (departmentFilter !== 'All' ? 1 : 0) +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0) +
    (overdueOnly ? 1 : 0);

  const queueHeading: Record<ComplaintQueueType, { title: string; subtitle: string }> = {
    all: {
      title: 'All Registered Complaints',
      subtitle: 'Complete municipal complaint ledger with search, filtering, and SLA status tracking.',
    },
    new: {
      title: 'New & Unreviewed Complaints',
      subtitle: 'Incoming civic reports awaiting initial administrative triage and department assignment.',
    },
    pending: {
      title: 'Pending Complaints',
      subtitle: 'Assigned complaints queued for field crew mobilization.',
    },
    'in-progress': {
      title: 'In Progress & Verification Queue',
      subtitle: 'Complaints currently under active field remediation or awaiting resolution verification.',
    },
    resolved: {
      title: 'Resolved Complaints Archive',
      subtitle: 'Verified and closed civic complaints with complete audit records.',
    },
    escalated: {
      title: 'Priority & Escalation Management',
      subtitle:
        'Monitor urgent, critical, and SLA-breached complaints. Final escalation and closure decisions remain with authorized officials.',
    },
  };

  const queueTabs = [
    { key: 'all', label: 'All', to: '/complaints', count: queueCounts.all, visible: true },
    {
      key: 'new',
      label: 'New',
      to: '/complaints/new',
      count: queueCounts.new,
      visible: isAdminOrSupervisory,
    },
    {
      key: 'pending',
      label: 'Pending',
      to: '/complaints/pending',
      count: queueCounts.pending,
      visible: true,
    },
    {
      key: 'in-progress',
      label: 'In Progress',
      to: '/complaints/in-progress',
      count: queueCounts.inProgress,
      visible: true,
    },
    {
      key: 'resolved',
      label: 'Resolved',
      to: '/complaints/resolved',
      count: queueCounts.resolved,
      visible: true,
    },
    {
      key: 'escalated',
      label: 'Escalated & SLA',
      to: '/complaints/escalated',
      count: queueCounts.escalated,
      visible: true,
    },
  ].filter((t) => t.visible);

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[#202938]">{queueHeading[queue].title}</h2>
          <p className="text-xs text-[#687385]">{queueHeading[queue].subtitle}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canExport && (
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 rounded border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-medium text-[#202938] hover:bg-[#F5F6F8] whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5 text-[#687385]" />
              <span>Export CSV</span>
            </button>
          )}
          {currentUser && hasPermission(currentUser.role, 'assign_complaint') && (
            <Link
              to="/assign"
              className="rounded bg-[#2457C5] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[#1D46A3] whitespace-nowrap"
            >
              Assign Complaints
            </Link>
          )}
        </div>
      </div>

      {/* Synced Queue Navigation Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-[#E5E7EB]">
        {queueTabs.map((tab) => {
          const active = tab.key === queue;
          return (
            <Link
              key={tab.key}
              to={tab.to}
              className={`inline-flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                active
                  ? 'border-[#2457C5] text-[#2457C5]'
                  : 'border-transparent text-[#687385] hover:text-[#202938]'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`font-mono-tabular text-[11px] rounded-sm px-1.5 py-0.5 ${
                  active ? 'bg-[#EFF4FF] text-[#2457C5]' : 'bg-[#F3F4F6] text-[#687385]'
                }`}
              >
                {tab.count}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Priority Summary Strip on Escalation View */}
      {queue === 'escalated' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#E5E7EB] rounded-md border border-[#E5E7EB] bg-white">
          {(['Critical', 'High', 'Medium', 'Low'] as PriorityLevel[]).map((level) => {
            const count = complaints.filter(
              (c) => c.priority === level && c.status !== 'Resolved' && c.status !== 'Rejected'
            ).length;
            return (
              <div key={level} className="px-4 py-3">
                <div className="text-xs text-[#687385]">{level} Priority (Open)</div>
                <div className="mt-1 font-mono-tabular text-xl font-semibold text-[#202938]">
                  {count}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Clean Single-Row Primary Filter Bar + Expandable Advanced Filters */}
      <section className="rounded-md border border-[#E5E7EB] bg-white p-3.5 space-y-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#687385]" />
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              placeholder="Search Complaint ID, issue title, address, or citizen..."
              className="w-full rounded border border-[#E5E7EB] bg-[#F9FAFB] py-1.5 pl-8 pr-3 text-xs text-[#202938] focus:border-[#2457C5] focus:bg-white focus:outline-none"
            />
          </div>

          <select
            aria-label="Category filter"
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value as ComplaintCategory | 'All');
              setPage(1);
            }}
            className="rounded border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-xs text-[#202938] focus:border-[#2457C5] focus:outline-none"
          >
            <option value="All">All Categories</option>
            <option value="Road Maintenance">Road Maintenance</option>
            <option value="Sanitation">Sanitation</option>
            <option value="Water Supply">Water Supply</option>
            <option value="Electricity">Electricity</option>
            <option value="Drainage">Drainage</option>
            <option value="Public Infrastructure">Public Infrastructure</option>
          </select>

          <select
            aria-label="Priority filter"
            value={priorityFilter}
            onChange={(e) => {
              setPriorityFilter(e.target.value as PriorityLevel | 'All');
              setPage(1);
            }}
            className="rounded border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-xs text-[#202938] focus:border-[#2457C5] focus:outline-none"
          >
            <option value="All">All Priorities</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>

          <select
            aria-label="Status filter"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as ComplaintStatus | 'All');
              setPage(1);
            }}
            className="rounded border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-xs text-[#202938] focus:border-[#2457C5] focus:outline-none"
          >
            <option value="All">All Statuses</option>
            <option value="New">New</option>
            <option value="Reviewed">Reviewed</option>
            <option value="Pending">Pending</option>
            <option value="In Progress">In Progress</option>
            <option value="Resolution Submitted">Resolution Submitted</option>
            <option value="Escalated">Escalated</option>
            <option value="Resolved">Resolved</option>
            <option value="Rejected">Rejected</option>
          </select>

          <button
            type="button"
            onClick={() => setShowAdvancedFilters((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap ${
              showAdvancedFilters || activeAdvancedCount > 0
                ? 'border-[#2457C5] bg-[#EFF4FF] text-[#2457C5]'
                : 'border-[#E5E7EB] bg-white text-[#202938] hover:bg-[#F5F6F8]'
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>
              More Filters{activeAdvancedCount > 0 ? ` (${activeAdvancedCount})` : ''}
            </span>
          </button>

          <button
            type="button"
            onClick={resetFilters}
            className="text-xs font-medium text-[#687385] hover:text-[#202938] px-2 py-1"
          >
            Reset
          </button>
        </div>

        {/* Collapsible Secondary Filters + Sorting */}
        {showAdvancedFilters && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E5E7EB] pt-3">
            <div className="flex flex-wrap items-center gap-3">
              <select
                aria-label="Ward filter"
                value={wardFilter}
                onChange={(e) => {
                  setWardFilter(e.target.value);
                  setPage(1);
                }}
                className="rounded border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-xs text-[#202938]"
              >
                <option value="All">All Wards</option>
                {uniqueWards.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>

              <select
                aria-label="Department filter"
                value={departmentFilter}
                onChange={(e) => {
                  setDepartmentFilter(e.target.value);
                  setPage(1);
                }}
                className="rounded border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-xs text-[#202938]"
              >
                <option value="All">All Departments</option>
                <option value="unassigned">Unassigned Only</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-1.5 text-xs text-[#687385]">
                <span>From:</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    setPage(1);
                  }}
                  className="rounded border border-[#E5E7EB] px-2 py-1 text-xs text-[#202938]"
                />
                <span>To:</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    setPage(1);
                  }}
                  className="rounded border border-[#E5E7EB] px-2 py-1 text-xs text-[#202938]"
                />
              </div>

              <label className="inline-flex items-center gap-1.5 text-xs font-medium text-[#202938] cursor-pointer">
                <input
                  type="checkbox"
                  checked={overdueOnly}
                  onChange={(e) => {
                    setOverdueOnly(e.target.checked);
                    setPage(1);
                  }}
                  className="h-3.5 w-3.5 rounded border-[#E5E7EB] text-[#2457C5]"
                />
                <span>Overdue SLA Only</span>
              </label>
            </div>

            <div className="flex items-center gap-2">
              <select
                aria-label="Sort field"
                value={sortBy}
                onChange={(e) =>
                  setSortBy(e.target.value as 'reportedAt' | 'deadline' | 'priority')
                }
                className="rounded border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-xs text-[#202938]"
              >
                <option value="reportedAt">Sort: Submission Date</option>
                <option value="deadline">Sort: Resolution Deadline</option>
                <option value="priority">Sort: Priority</option>
              </select>
              <button
                type="button"
                onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
                className="inline-flex items-center gap-1 rounded border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-xs text-[#202938] hover:bg-[#F5F6F8]"
              >
                <ArrowUpDown className="h-3.5 w-3.5 text-[#687385]" />
                <span>{sortDir === 'desc' ? 'Desc' : 'Asc'}</span>
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Complaints Data Table */}
      <section className="rounded-md border border-[#E5E7EB] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[#E5E7EB] bg-[#F9FAFB] text-[11px] font-semibold text-[#687385]">
                <th className="px-4 py-2.5 whitespace-nowrap">Complaint ID</th>
                <th className="px-4 py-2.5">Issue & Location</th>
                <th className="px-4 py-2.5 whitespace-nowrap">Category</th>
                <th className="px-4 py-2.5 whitespace-nowrap">Priority</th>
                <th className="px-4 py-2.5 whitespace-nowrap">Department & Officer</th>
                <th className="px-4 py-2.5 whitespace-nowrap">Submitted</th>
                <th className="px-4 py-2.5 whitespace-nowrap">SLA Deadline</th>
                <th className="px-4 py-2.5 whitespace-nowrap">Status</th>
                <th className="px-4 py-2.5 text-right whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB] text-xs">
              {pagedComplaints.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-[#687385]">
                    No complaints found matching the selected filters.
                  </td>
                </tr>
              ) : (
                pagedComplaints.map((c) => {
                  const dept = c.assignedDepartmentId ? deptMap[c.assignedDepartmentId] : null;
                  const officer = c.assignedOfficerId ? officerMap[c.assignedOfficerId] : null;
                  const sla = formatTimeRemaining(c.resolutionDeadline, c.status, REFERENCE_NOW);
                  return (
                    <tr
                      key={c.id}
                      className={`hover:bg-[#F9FAFB] ${sla.isOverdue ? 'bg-[#FFF9F9]' : ''}`}
                    >
                      <td className="px-4 py-3 font-mono-tabular font-semibold text-[#2457C5] whitespace-nowrap">
                        <Link to={`/complaints/${c.id}`} className="hover:underline">
                          {c.id}
                        </Link>
                      </td>
                      <td className="px-4 py-3 max-w-[280px]">
                        <Link
                          to={`/complaints/${c.id}`}
                          className="font-medium text-[#202938] hover:text-[#2457C5] line-clamp-1"
                        >
                          {c.title}
                        </Link>
                        <div className="mt-0.5 text-[11px] text-[#687385] truncate">
                          {c.ward} · {c.address}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[#687385] whitespace-nowrap">{c.category}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <PriorityLabel priority={c.priority} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-[#202938]">
                          {dept ? dept.name : <span className="text-[#687385]">Unassigned</span>}
                        </div>
                        <div className="text-[11px] text-[#687385]">
                          {officer ? officer.name : 'No officer assigned'}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono-tabular text-[#687385] whitespace-nowrap">
                        {formatShortDate(c.reportedAt)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-mono-tabular text-[11px] text-[#202938]">
                          {formatShortDate(c.resolutionDeadline)}
                        </div>
                        <div
                          className={`font-mono-tabular text-[11px] ${
                            sla.isOverdue
                              ? 'font-semibold text-[#D94B4B]'
                              : sla.hoursDelta > 0 && sla.hoursDelta <= 6
                              ? 'font-medium text-[#D99A32]'
                              : 'text-[#687385]'
                          }`}
                        >
                          {sla.label}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <StatusLabel status={c.status} />
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap space-x-2">
                        <Link
                          to={`/complaints/${c.id}`}
                          className="text-xs font-medium text-[#2457C5] hover:underline"
                        >
                          Open
                        </Link>
                        {queue === 'escalated' &&
                          canEscalate &&
                          c.status !== 'Resolved' &&
                          c.status !== 'Rejected' && (
                            <button
                              type="button"
                              onClick={() => {
                                setEscalateTarget(c);
                                setEscalateReason('');
                              }}
                              className="rounded border border-[#D94B4B] px-2 py-0.5 text-[11px] font-medium text-[#D94B4B] hover:bg-[#FEF0F0]"
                            >
                              Escalate
                            </button>
                          )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="flex items-center justify-between border-t border-[#E5E7EB] px-4 py-3 text-xs text-[#687385]">
          <span className="tabular-nums">
            Showing {pagedComplaints.length} of {filteredComplaints.length} matching records
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded border border-[#E5E7EB] bg-white px-2 py-1 text-xs text-[#202938] hover:bg-[#F5F6F8] disabled:opacity-40"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="px-2 font-mono-tabular text-[#202938]">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded border border-[#E5E7EB] bg-white px-2 py-1 text-xs text-[#202938] hover:bg-[#F5F6F8] disabled:opacity-40"
              aria-label="Next page"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </section>

      {/* Escalation Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(escalateTarget)}
        title={`Escalate Complaint ${escalateTarget?.id ?? ''}`}
        description="Escalating this complaint elevates its priority to Critical, increments the escalation level, and logs an official audit entry."
        confirmLabel="Confirm Escalation"
        confirmVariant="danger"
        disabled={!escalateReason.trim()}
        onCancel={() => setEscalateTarget(null)}
        onConfirm={async () => {
          if (!escalateTarget || !escalateReason.trim()) return;
          await performComplaintAction(escalateTarget.id, {
            actionType: 'escalate',
            reason: escalateReason,
          });
          setEscalateTarget(null);
        }}
      >
        <div>
          <label className="block text-xs font-medium text-[#202938] mb-1">
            Official Escalation Justification (Required)
          </label>
          <textarea
            rows={3}
            value={escalateReason}
            onChange={(e) => setEscalateReason(e.target.value)}
            placeholder="Specify SLA breach impact, public safety urgency, or supervisory directive..."
            className="w-full rounded border border-[#E5E7EB] p-2 text-xs text-[#202938] focus:border-[#2457C5] focus:outline-none"
          />
        </div>
      </ConfirmDialog>
    </div>
  );
};
