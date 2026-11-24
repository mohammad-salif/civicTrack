import React, { useMemo, useState } from 'react';
import { ArrowUpDown, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PriorityLabel, StatusLabel, formatDateTime, formatShortDate } from '../components/StatusLabels';
import { usePortal } from '../context/PortalContext';
import { formatTimeRemaining, hasPermission, isComplaintOverdue } from '../lib/rbac';
import type { ComplaintCategory, ComplaintStatus } from '../types/civic';

type DateRangeOption = '7d' | '30d' | '90d' | 'all';

const REFERENCE_NOW = new Date('2026-11-24T09:15:00Z').getTime();

export const DashboardPage: React.FC = () => {
  const { currentUser, complaints, departments, officers, activityLogs } = usePortal();
  const [dateRange, setDateRange] = useState<DateRangeOption>('30d');
  const [tableSearch, setTableSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ComplaintStatus | 'All'>('All');
  const [categoryFilter, setCategoryFilter] = useState<ComplaintCategory | 'All'>('All');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [page, setPage] = useState(1);
  const [attentionTab, setAttentionTab] = useState<'alerts' | 'overdue'>('alerts');
  const [opsTab, setOpsTab] = useState<'workload' | 'unassigned' | 'high_priority'>('workload');
  const pageSize = 6;

  const rangeFilteredComplaints = useMemo(() => {
    if (dateRange === 'all') return complaints;
    const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
    const cutoff = REFERENCE_NOW - days * 24 * 60 * 60 * 1000;
    return complaints.filter((c) => new Date(c.reportedAt).getTime() >= cutoff);
  }, [complaints, dateRange]);

  const stats = useMemo(() => {
    const todayPrefix = '2026-11-24';
    const total = rangeFilteredComplaints.length;
    const newToday = rangeFilteredComplaints.filter((c) =>
      c.reportedAt.startsWith(todayPrefix)
    ).length;
    const pending = rangeFilteredComplaints.filter(
      (c) => c.status === 'New' || c.status === 'Reviewed' || c.status === 'Pending'
    ).length;
    const inProgress = rangeFilteredComplaints.filter(
      (c) => c.status === 'In Progress' || c.status === 'Resolution Submitted'
    ).length;
    const resolved = rangeFilteredComplaints.filter((c) => c.status === 'Resolved').length;
    const slaBreaches = rangeFilteredComplaints.filter((c) =>
      isComplaintOverdue(c, REFERENCE_NOW)
    ).length;

    return { total, newToday, pending, inProgress, resolved, slaBreaches };
  }, [rangeFilteredComplaints]);

  const deptMap = useMemo(
    () => Object.fromEntries(departments.map((d) => [d.id, d])),
    [departments]
  );
  const officerMap = useMemo(
    () => Object.fromEntries(officers.map((o) => [o.id, o])),
    [officers]
  );

  const filteredTableComplaints = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    return rangeFilteredComplaints
      .filter((c) => {
        if (statusFilter !== 'All' && c.status !== statusFilter) return false;
        if (categoryFilter !== 'All' && c.category !== categoryFilter) return false;
        if (!q) return true;
        return (
          c.id.toLowerCase().includes(q) ||
          c.title.toLowerCase().includes(q) ||
          c.ward.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const diff = new Date(a.reportedAt).getTime() - new Date(b.reportedAt).getTime();
        return sortOrder === 'desc' ? -diff : diff;
      });
  }, [rangeFilteredComplaints, tableSearch, statusFilter, categoryFilter, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(filteredTableComplaints.length / pageSize));
  const pagedComplaints = filteredTableComplaints.slice((page - 1) * pageSize, page * pageSize);

  const highPriorityIssues = useMemo(() => {
    return rangeFilteredComplaints.filter(
      (c) =>
        (c.priority === 'Critical' || c.priority === 'High') &&
        c.status !== 'Resolved' &&
        c.status !== 'Rejected'
    );
  }, [rangeFilteredComplaints]);

  const awaitingAssignment = useMemo(() => {
    return rangeFilteredComplaints.filter(
      (c) => !c.assignedDepartmentId && c.status !== 'Resolved' && c.status !== 'Rejected'
    );
  }, [rangeFilteredComplaints]);

  const departmentWorkload = useMemo(() => {
    return departments.map((d) => {
      const items = rangeFilteredComplaints.filter((c) => c.assignedDepartmentId === d.id);
      const activeCount = items.filter(
        (c) => c.status === 'Pending' || c.status === 'In Progress' || c.status === 'Escalated'
      ).length;
      const resolvedCount = items.filter((c) => c.status === 'Resolved').length;
      const overdueCount = items.filter((c) => isComplaintOverdue(c, REFERENCE_NOW)).length;
      return {
        department: d,
        total: items.length,
        active: activeCount,
        resolved: resolvedCount,
        overdue: overdueCount,
      };
    });
  }, [departments, rangeFilteredComplaints]);

  const overdueComplaints = useMemo(() => {
    return rangeFilteredComplaints.filter((c) => isComplaintOverdue(c, REFERENCE_NOW));
  }, [rangeFilteredComplaints]);

  const criticalAlerts = useMemo(() => {
    return rangeFilteredComplaints.filter(
      (c) =>
        (c.status === 'Escalated' || c.priority === 'Critical') &&
        c.status !== 'Resolved' &&
        c.status !== 'Rejected'
    );
  }, [rangeFilteredComplaints]);

  const performanceTrend = useMemo(
    () => [
      { day: 'Nov 18', reported: 3, resolved: 1 },
      { day: 'Nov 19', reported: 2, resolved: 2 },
      { day: 'Nov 20', reported: 4, resolved: 2 },
      { day: 'Nov 21', reported: 3, resolved: 1 },
      { day: 'Nov 22', reported: 5, resolved: 3 },
      { day: 'Nov 23', reported: 4, resolved: 2 },
      { day: 'Nov 24', reported: 5, resolved: 3 },
    ],
    []
  );

  const slaComplianceRate = useMemo(() => {
    if (rangeFilteredComplaints.length === 0) return 100;
    const breached = rangeFilteredComplaints.filter((c) =>
      isComplaintOverdue(c, REFERENCE_NOW)
    ).length;
    return Math.round(
      ((rangeFilteredComplaints.length - breached) / rangeFilteredComplaints.length) * 100
    );
  }, [rangeFilteredComplaints]);

  const canAssign = currentUser ? hasPermission(currentUser.role, 'assign_complaint') : false;

  return (
    <div className="space-y-6">
      {/* 1. Welcome Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-[#202938]">
            Good morning, {currentUser?.name || 'Official'}
          </h2>
          <p className="mt-0.5 text-sm text-[#687385]">
            Here is the current overview of civic complaints and municipal operations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <div className="flex items-center gap-2 rounded border border-[#E5E7EB] bg-white px-3 py-1.5">
            <label htmlFor="dashboard-date-range" className="text-xs font-medium text-[#687385]">
              Period:
            </label>
            <select
              id="dashboard-date-range"
              value={dateRange}
              onChange={(e) => {
                setDateRange(e.target.value as DateRangeOption);
                setPage(1);
              }}
              className="bg-transparent text-xs font-medium text-[#202938] focus:outline-none"
            >
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="90d">Quarter to Date</option>
              <option value="all">All Recorded</option>
            </select>
          </div>
          {canAssign && awaitingAssignment.length > 0 && (
            <Link
              to="/assign"
              className="rounded bg-[#2457C5] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[#1D46A3] whitespace-nowrap"
            >
              Assign Unassigned ({awaitingAssignment.length})
            </Link>
          )}
        </div>
      </div>

      {/* 2. Operational Statistics Bar (Clickable quick-jump metrics) */}
      <section
        aria-label="Operational Statistics"
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-y sm:divide-y-0 sm:divide-x divide-[#E5E7EB] rounded-md border border-[#E5E7EB] bg-white"
      >
        <Link to="/complaints" className="block px-4 py-3.5 hover:bg-[#F9FAFB] transition-colors">
          <div className="text-xs font-medium text-[#687385]">Total Complaints</div>
          <div className="mt-1 font-mono-tabular text-2xl font-semibold text-[#202938]">
            {stats.total}
          </div>
        </Link>
        <Link
          to="/complaints/new"
          className="block px-4 py-3.5 hover:bg-[#F9FAFB] transition-colors"
        >
          <div className="text-xs font-medium text-[#687385]">New Today</div>
          <div className="mt-1 font-mono-tabular text-2xl font-semibold text-[#2457C5]">
            {stats.newToday}
          </div>
        </Link>
        <Link
          to="/complaints/pending"
          className="block px-4 py-3.5 hover:bg-[#F9FAFB] transition-colors"
        >
          <div className="text-xs font-medium text-[#687385]">Pending</div>
          <div className="mt-1 font-mono-tabular text-2xl font-semibold text-[#D99A32]">
            {stats.pending}
          </div>
        </Link>
        <Link
          to="/complaints/in-progress"
          className="block px-4 py-3.5 hover:bg-[#F9FAFB] transition-colors"
        >
          <div className="text-xs font-medium text-[#687385]">In Progress</div>
          <div className="mt-1 font-mono-tabular text-2xl font-semibold text-[#2457C5]">
            {stats.inProgress}
          </div>
        </Link>
        <Link
          to="/complaints/resolved"
          className="block px-4 py-3.5 hover:bg-[#F9FAFB] transition-colors"
        >
          <div className="text-xs font-medium text-[#687385]">Resolved</div>
          <div className="mt-1 font-mono-tabular text-2xl font-semibold text-[#23845B]">
            {stats.resolved}
          </div>
        </Link>
        <Link
          to="/complaints/escalated"
          className="block px-4 py-3.5 hover:bg-[#F9FAFB] transition-colors"
        >
          <div className="text-xs font-medium text-[#687385]">SLA Breaches</div>
          <div className="mt-1 font-mono-tabular text-2xl font-semibold text-[#D94B4B]">
            {stats.slaBreaches}
          </div>
        </Link>
      </section>

      {/* 3. Full-Width Recent Complaints Registry (Zero cramping, all 9 columns crisp) */}
      <section className="rounded-md border border-[#E5E7EB] bg-white">
        <div className="flex flex-col gap-3 border-b border-[#E5E7EB] px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[#202938]">Recent Complaints</h3>
            <p className="text-xs text-[#687385]">
              Latest civic reports registered within your administrative scope
            </p>
          </div>
          <Link
            to="/complaints"
            className="text-xs font-medium text-[#2457C5] hover:underline whitespace-nowrap"
          >
            View All Complaints →
          </Link>
        </div>

        {/* Filter Toolbar */}
        <div className="flex flex-wrap items-center gap-2.5 border-b border-[#E5E7EB] bg-[#FAFBFC] px-5 py-2.5">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#687385]" />
            <input
              type="search"
              value={tableSearch}
              onChange={(e) => {
                setTableSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Filter by ID, issue title, or ward..."
              className="w-full rounded border border-[#E5E7EB] bg-white py-1.5 pl-8 pr-3 text-xs text-[#202938] placeholder:text-[#687385] focus:border-[#2457C5] focus:outline-none"
            />
          </div>
          <select
            aria-label="Filter by category"
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
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as ComplaintStatus | 'All');
              setPage(1);
            }}
            className="rounded border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-xs text-[#202938] focus:border-[#2457C5] focus:outline-none"
          >
            <option value="All">All Statuses</option>
            <option value="New">New</option>
            <option value="Pending">Pending</option>
            <option value="In Progress">In Progress</option>
            <option value="Resolution Submitted">Resolution Submitted</option>
            <option value="Escalated">Escalated</option>
            <option value="Resolved">Resolved</option>
            <option value="Rejected">Rejected</option>
          </select>
          <button
            type="button"
            onClick={() => setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'))}
            className="inline-flex items-center gap-1.5 rounded border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-xs font-medium text-[#202938] hover:bg-[#F5F6F8] whitespace-nowrap"
          >
            <ArrowUpDown className="h-3.5 w-3.5 text-[#687385]" />
            <span>Date: {sortOrder === 'desc' ? 'Newest' : 'Oldest'}</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[#E5E7EB] bg-[#F9FAFB] text-[11px] font-semibold text-[#687385]">
                <th className="px-4 py-2.5 whitespace-nowrap">Complaint ID</th>
                <th className="px-4 py-2.5">Issue Title</th>
                <th className="px-4 py-2.5 whitespace-nowrap">Category</th>
                <th className="px-4 py-2.5 whitespace-nowrap">Ward / Location</th>
                <th className="px-4 py-2.5 whitespace-nowrap">Priority</th>
                <th className="px-4 py-2.5 whitespace-nowrap">Assigned Department</th>
                <th className="px-4 py-2.5 whitespace-nowrap">Reported Date</th>
                <th className="px-4 py-2.5 whitespace-nowrap">Current Status</th>
                <th className="px-4 py-2.5 text-right whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB] text-xs">
              {pagedComplaints.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-[#687385]">
                    No complaints match the current filter criteria.
                  </td>
                </tr>
              ) : (
                pagedComplaints.map((c) => {
                  const dept = c.assignedDepartmentId ? deptMap[c.assignedDepartmentId] : null;
                  return (
                    <tr key={c.id} className="hover:bg-[#F9FAFB]">
                      <td className="px-4 py-2.5 font-mono-tabular font-semibold text-[#2457C5] whitespace-nowrap">
                        <Link to={`/complaints/${c.id}`} className="hover:underline">
                          {c.id}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 max-w-[260px]">
                        <Link
                          to={`/complaints/${c.id}`}
                          className="font-medium text-[#202938] hover:text-[#2457C5] line-clamp-1"
                        >
                          {c.title}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-[#687385] whitespace-nowrap">{c.category}</td>
                      <td className="px-4 py-2.5 text-[#687385] whitespace-nowrap">{c.ward}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <PriorityLabel priority={c.priority} />
                      </td>
                      <td className="px-4 py-2.5 text-[#202938] whitespace-nowrap">
                        {dept ? dept.name : <span className="text-[#687385]">Unassigned</span>}
                      </td>
                      <td className="px-4 py-2.5 font-mono-tabular text-[#687385] whitespace-nowrap">
                        {formatShortDate(c.reportedAt)}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <StatusLabel status={c.status} />
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <Link
                          to={`/complaints/${c.id}`}
                          className="text-xs font-medium text-[#2457C5] hover:underline"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-[#E5E7EB] px-5 py-2.5 text-xs text-[#687385]">
          <span className="tabular-nums">
            Showing {pagedComplaints.length} of {filteredTableComplaints.length} complaints
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center rounded border border-[#E5E7EB] bg-white px-2 py-1 text-xs text-[#202938] hover:bg-[#F5F6F8] disabled:opacity-40"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="px-2 font-mono-tabular text-xs text-[#202938]">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="inline-flex items-center rounded border border-[#E5E7EB] bg-white px-2 py-1 text-xs text-[#202938] hover:bg-[#F5F6F8] disabled:opacity-40"
              aria-label="Next page"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </section>

      {/* 4. Balanced Two-Column Operational Monitoring Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-stretch">
        {/* Main Section (7 cols): Tabbed Operations Queue (Department Workload / Awaiting Assignment / High Priority) */}
        <section className="flex flex-col rounded-md border border-[#E5E7EB] bg-white lg:col-span-7">
          <div className="flex flex-col gap-3 border-b border-[#E5E7EB] px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-1 rounded bg-[#F5F6F8] p-1">
              <button
                type="button"
                onClick={() => setOpsTab('workload')}
                className={`rounded px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  opsTab === 'workload'
                    ? 'bg-white text-[#202938] shadow-xs'
                    : 'text-[#687385] hover:text-[#202938]'
                }`}
              >
                Department Workload
              </button>
              <button
                type="button"
                onClick={() => setOpsTab('unassigned')}
                className={`rounded px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  opsTab === 'unassigned'
                    ? 'bg-white text-[#202938] shadow-xs'
                    : 'text-[#687385] hover:text-[#202938]'
                }`}
              >
                Awaiting Assignment ({awaitingAssignment.length})
              </button>
              <button
                type="button"
                onClick={() => setOpsTab('high_priority')}
                className={`rounded px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  opsTab === 'high_priority'
                    ? 'bg-white text-[#202938] shadow-xs'
                    : 'text-[#687385] hover:text-[#202938]'
                }`}
              >
                High Priority ({highPriorityIssues.length})
              </button>
            </div>
            <Link
              to={opsTab === 'workload' ? '/departments' : opsTab === 'unassigned' ? '/assign' : '/complaints/escalated'}
              className="text-xs font-medium text-[#2457C5] hover:underline whitespace-nowrap"
            >
              Open Module →
            </Link>
          </div>

          <div className="flex-1">
            {opsTab === 'workload' && (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-[#E5E7EB] bg-[#F9FAFB] text-[11px] font-semibold text-[#687385]">
                      <th className="px-4 py-2.5">Department</th>
                      <th className="px-4 py-2.5 text-right">Assigned</th>
                      <th className="px-4 py-2.5 text-right">Active</th>
                      <th className="px-4 py-2.5 text-right">Resolved</th>
                      <th className="px-4 py-2.5 text-right">Overdue</th>
                      <th className="px-4 py-2.5 w-36">Resolution Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E7EB] text-xs">
                    {departmentWorkload.map((row) => {
                      const pct = row.total > 0 ? Math.round((row.resolved / row.total) * 100) : 0;
                      return (
                        <tr key={row.department.id} className="hover:bg-[#F9FAFB]">
                          <td className="px-4 py-2.5">
                            <div className="font-medium text-[#202938]">{row.department.name}</div>
                            <div className="text-[11px] text-[#687385]">
                              {row.department.headName}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono-tabular text-[#202938]">
                            {row.total}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono-tabular text-[#2457C5]">
                            {row.active}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono-tabular text-[#23845B]">
                            {row.resolved}
                          </td>
                          <td
                            className={`px-4 py-2.5 text-right font-mono-tabular ${
                              row.overdue > 0 ? 'font-semibold text-[#D94B4B]' : 'text-[#687385]'
                            }`}
                          >
                            {row.overdue}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 flex-1 rounded-sm bg-[#E5E7EB] overflow-hidden">
                                <div className="h-full bg-[#2457C5]" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="w-8 text-right font-mono-tabular text-[11px] text-[#687385]">
                                {pct}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {opsTab === 'unassigned' && (
              <div className="divide-y divide-[#E5E7EB]">
                {awaitingAssignment.length === 0 ? (
                  <div className="p-8 text-center text-xs text-[#687385]">
                    All active complaints have been assigned to municipal departments.
                  </div>
                ) : (
                  awaitingAssignment.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-[#F9FAFB]"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-xs">
                          <Link
                            to={`/complaints/${c.id}`}
                            className="font-mono-tabular font-semibold text-[#2457C5] hover:underline"
                          >
                            {c.id}
                          </Link>
                          <span className="text-[#687385]">·</span>
                          <PriorityLabel priority={c.priority} />
                          <span className="text-[#687385]">·</span>
                          <span className="text-[11px] text-[#687385]">{c.category}</span>
                        </div>
                        <div className="mt-1 truncate text-xs font-medium text-[#202938]">
                          {c.title}
                        </div>
                        <div className="mt-0.5 text-[11px] text-[#687385]">
                          {c.ward} · Reported {formatShortDate(c.reportedAt)}
                        </div>
                      </div>
                      {canAssign ? (
                        <Link
                          to={`/assign?complaintId=${c.id}`}
                          className="shrink-0 rounded border border-[#2457C5] bg-white px-3 py-1.5 text-xs font-medium text-[#2457C5] hover:bg-[#EFF4FF] whitespace-nowrap"
                        >
                          Assign
                        </Link>
                      ) : (
                        <Link
                          to={`/complaints/${c.id}`}
                          className="shrink-0 text-xs font-medium text-[#2457C5] hover:underline"
                        >
                          Open
                        </Link>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {opsTab === 'high_priority' && (
              <div className="divide-y divide-[#E5E7EB]">
                {highPriorityIssues.length === 0 ? (
                  <div className="p-8 text-center text-xs text-[#687385]">
                    No active Critical or High priority issues.
                  </div>
                ) : (
                  highPriorityIssues.slice(0, 6).map((c) => {
                    const sla = formatTimeRemaining(c.resolutionDeadline, c.status, REFERENCE_NOW);
                    return (
                      <Link
                        key={c.id}
                        to={`/complaints/${c.id}`}
                        className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-[#F9FAFB]"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-mono-tabular font-semibold text-[#2457C5]">
                              {c.id}
                            </span>
                            <PriorityLabel priority={c.priority} />
                            <StatusLabel status={c.status} />
                          </div>
                          <div className="mt-1 truncate text-xs font-medium text-[#202938]">
                            {c.title}
                          </div>
                          <div className="mt-0.5 text-[11px] text-[#687385]">
                            {c.ward} · {c.category}
                          </div>
                        </div>
                        <span
                          className={`shrink-0 font-mono-tabular text-[11px] whitespace-nowrap ${
                            sla.isOverdue ? 'font-semibold text-[#D94B4B]' : 'text-[#687385]'
                          }`}
                        >
                          {sla.label}
                        </span>
                      </Link>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </section>

        {/* Secondary Section (5 cols): Critical Alerts & Overdue Tabbed + Resolution Performance */}
        <section className="flex flex-col rounded-md border border-[#E5E7EB] bg-white lg:col-span-5">
          <div className="flex items-center justify-between border-b border-[#E5E7EB] px-5 py-3">
            <div className="flex items-center gap-1 rounded bg-[#F5F6F8] p-1">
              <button
                type="button"
                onClick={() => setAttentionTab('alerts')}
                className={`rounded px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  attentionTab === 'alerts'
                    ? 'bg-white text-[#202938] shadow-xs'
                    : 'text-[#687385] hover:text-[#202938]'
                }`}
              >
                Critical Alerts ({criticalAlerts.length})
              </button>
              <button
                type="button"
                onClick={() => setAttentionTab('overdue')}
                className={`rounded px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  attentionTab === 'overdue'
                    ? 'bg-white text-[#202938] shadow-xs'
                    : 'text-[#687385] hover:text-[#202938]'
                }`}
              >
                Overdue ({overdueComplaints.length})
              </button>
            </div>
            <Link
              to="/complaints/escalated"
              className="text-xs font-medium text-[#2457C5] hover:underline whitespace-nowrap"
            >
              SLA Matrix →
            </Link>
          </div>

          <div className="flex-1 divide-y divide-[#E5E7EB]">
            {attentionTab === 'alerts' ? (
              criticalAlerts.length === 0 ? (
                <div className="p-6 text-center text-xs text-[#687385]">
                  No critical escalations at this time.
                </div>
              ) : (
                criticalAlerts.slice(0, 5).map((c) => (
                  <Link
                    key={c.id}
                    to={`/complaints/${c.id}`}
                    className="block px-5 py-3 hover:bg-[#F9FAFB]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono-tabular text-xs font-semibold text-[#D94B4B]">
                        {c.id}
                      </span>
                      <StatusLabel status={c.status} />
                    </div>
                    <p className="mt-1 text-xs font-medium text-[#202938] line-clamp-1">
                      {c.title}
                    </p>
                    <div className="mt-0.5 text-[11px] text-[#687385]">
                      {c.ward} ·{' '}
                      {c.assignedOfficerId
                        ? officerMap[c.assignedOfficerId]?.name
                        : 'Unassigned'}
                    </div>
                  </Link>
                ))
              )
            ) : overdueComplaints.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#687385]">
                All active complaints are within SLA deadlines.
              </div>
            ) : (
              overdueComplaints.slice(0, 5).map((c) => {
                const sla = formatTimeRemaining(c.resolutionDeadline, c.status, REFERENCE_NOW);
                return (
                  <Link
                    key={c.id}
                    to={`/complaints/${c.id}`}
                    className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-[#F9FAFB]"
                  >
                    <div className="min-w-0">
                      <div className="font-mono-tabular text-xs font-semibold text-[#202938]">
                        {c.id}
                      </div>
                      <div className="truncate text-xs text-[#687385]">{c.title}</div>
                    </div>
                    <span className="shrink-0 font-mono-tabular text-[11px] font-semibold text-[#D94B4B] whitespace-nowrap">
                      {sla.label}
                    </span>
                  </Link>
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* 5. Bottom Balanced Row: Resolution Performance + Recent Administrative Activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-stretch">
        <section className="rounded-md border border-[#E5E7EB] bg-white lg:col-span-6 flex flex-col">
          <div className="flex items-center justify-between border-b border-[#E5E7EB] px-5 py-3">
            <div>
              <h3 className="text-sm font-semibold text-[#202938]">Resolution Performance</h3>
              <p className="text-xs text-[#687385]">7-day intake vs. verified closures</p>
            </div>
            <div className="text-right">
              <div className="font-mono-tabular text-base font-semibold text-[#23845B]">
                {slaComplianceRate}%
              </div>
              <div className="text-[11px] text-[#687385]">SLA Compliance</div>
            </div>
          </div>
          <div className="flex-1 p-4 min-h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={performanceTrend} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 11, fill: '#687385' }}
                  axisLine={{ stroke: '#E5E7EB' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#687385' }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    borderColor: '#E5E7EB',
                    fontSize: '12px',
                    borderRadius: '4px',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="reported"
                  name="Reported"
                  stroke="#2457C5"
                  strokeWidth={2}
                  dot={{ r: 2.5 }}
                />
                <Line
                  type="monotone"
                  dataKey="resolved"
                  name="Resolved"
                  stroke="#23845B"
                  strokeWidth={2}
                  dot={{ r: 2.5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-md border border-[#E5E7EB] bg-white lg:col-span-6 flex flex-col">
          <div className="flex items-center justify-between border-b border-[#E5E7EB] px-5 py-3">
            <div>
              <h3 className="text-sm font-semibold text-[#202938]">
                Recent Administrative Activity
              </h3>
              <p className="text-xs text-[#687385]">Latest official reviews, assignments, and closures</p>
            </div>
            {hasPermission(currentUser?.role || 'Field Officer', 'view_activity_logs') && (
              <Link
                to="/activity-logs"
                className="text-xs font-medium text-[#2457C5] hover:underline whitespace-nowrap"
              >
                Full Log →
              </Link>
            )}
          </div>
          <div className="flex-1 divide-y divide-[#E5E7EB]">
            {activityLogs.slice(0, 5).map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between gap-3 px-5 py-3 text-xs"
              >
                <div className="min-w-0">
                  <div className="font-medium text-[#202938] truncate">{log.action}</div>
                  <div className="mt-0.5 text-[11px] text-[#687385] truncate">
                    {log.actorName} ({log.actorRole}) · {formatDateTime(log.timestamp)}
                  </div>
                </div>
                {log.complaintId && (
                  <Link
                    to={`/complaints/${log.complaintId}`}
                    className="shrink-0 font-mono-tabular text-[11px] font-semibold text-[#2457C5] hover:underline"
                  >
                    {log.complaintId}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
