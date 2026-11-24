import React, { useMemo, useState } from 'react';
import { BrainCircuit, Download } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { usePortal } from '../context/PortalContext';
import { hasPermission, isComplaintOverdue } from '../lib/rbac';
import type { OperationalBriefingResult } from '../types/civic';
import { exportToCsv } from '../utils/csvExport';

const REFERENCE_NOW = new Date('2026-11-24T09:15:00Z').getTime();

export const AnalyticsPage: React.FC = () => {
  const { currentUser, complaints, departments, requestOperationalBriefing } = usePortal();
  const [dateFilter, setDateFilter] = useState<'7d' | '30d' | 'all'>('all');
  const [deptFilter, setDeptFilter] = useState<string>('All');

  // Complex Operational Query (Thinking Mode)
  const [queryText, setQueryText] = useState(
    'Identify the highest-risk SLA bottlenecks across wards and recommend cross-department resource adjustments.'
  );
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [briefing, setBriefing] = useState<OperationalBriefingResult | null>(null);
  const [briefingError, setBriefingError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const cutoff =
      dateFilter === 'all'
        ? 0
        : REFERENCE_NOW - (dateFilter === '7d' ? 7 : 30) * 24 * 60 * 60 * 1000;

    return complaints.filter((c) => {
      if (cutoff && new Date(c.reportedAt).getTime() < cutoff) return false;
      if (deptFilter !== 'All' && c.assignedDepartmentId !== deptFilter) return false;
      return true;
    });
  }, [complaints, dateFilter, deptFilter]);

  const byCategory = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach((c) => {
      map[c.category] = (map[c.category] || 0) + 1;
    });
    return Object.entries(map).map(([name, count]) => ({ name, count }));
  }, [filtered]);

  const byStatus = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach((c) => {
      map[c.status] = (map[c.status] || 0) + 1;
    });
    return Object.entries(map).map(([name, count]) => ({ name, count }));
  }, [filtered]);

  const byWard = useMemo(() => {
    const map: Record<string, { total: number; critical: number; overdue: number }> = {};
    filtered.forEach((c) => {
      if (!map[c.ward]) map[c.ward] = { total: 0, critical: 0, overdue: 0 };
      map[c.ward].total += 1;
      if (c.priority === 'Critical') map[c.ward].critical += 1;
      if (isComplaintOverdue(c, REFERENCE_NOW)) map[c.ward].overdue += 1;
    });
    return Object.entries(map)
      .map(([ward, d]) => ({
        ward,
        ...d,
        sharePct: filtered.length > 0 ? Math.round((d.total / filtered.length) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [filtered]);

  const overTime = useMemo(() => {
    const dateCounts: Record<string, { date: string; submitted: number; resolved: number }> = {};
    filtered.forEach((c) => {
      const day = c.reportedAt.slice(5, 10);
      if (!dateCounts[day]) dateCounts[day] = { date: day, submitted: 0, resolved: 0 };
      dateCounts[day].submitted += 1;
      if (c.status === 'Resolved') dateCounts[day].resolved += 1;
    });
    return Object.values(dateCounts).sort((a, b) => a.date.localeCompare(b.date));
  }, [filtered]);

  if (!currentUser || !hasPermission(currentUser.role, 'view_analytics')) {
    return (
      <div className="rounded-md border border-[#E5E7EB] bg-white p-8 text-center">
        <h2 className="text-sm font-semibold text-[#202938]">Access Restricted</h2>
        <p className="mt-1 text-xs text-[#687385]">
          Analytics & Reports are restricted to authorized supervisory and administrative officials.
        </p>
      </div>
    );
  }

  const handleExport = () => {
    exportToCsv(
      'civictrack-analytics-report.csv',
      ['Ward', 'Total Complaints', 'Critical Issues', 'Overdue SLA', 'Share %'],
      byWard.map((w) => [w.ward, w.total, w.critical, w.overdue, `${w.sharePct}%`])
    );
  };

  const handleBriefingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAnalyzing(true);
    setBriefingError(null);
    try {
      const res = await requestOperationalBriefing({ query: queryText });
      setBriefing(res);
    } catch (err: unknown) {
      setBriefingError(err instanceof Error ? err.message : 'Unable to generate operational report.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="space-y-5 max-w-[1440px]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[#202938]">Analytics & Reports</h2>
          <p className="text-xs text-[#687385]">
            Complaint distributions, temporal volume, geographic ward concentration, and CSV export
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Date range filter"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as '7d' | '30d' | 'all')}
            className="rounded border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-xs text-[#202938]"
          >
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="all">All Recorded</option>
          </select>
          <select
            aria-label="Department filter"
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="rounded border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-xs text-[#202938]"
          >
            <option value="All">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          {hasPermission(currentUser.role, 'export_reports') && (
            <button
              type="button"
              onClick={handleExport}
              className="inline-flex items-center gap-1.5 rounded border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-medium text-[#202938] hover:bg-[#F5F6F8]"
            >
              <Download className="h-3.5 w-3.5 text-[#687385]" />
              <span>Export CSV</span>
            </button>
          )}
        </div>
      </div>

      {/* Primary Charts Grid */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Complaints by Category */}
        <section className="rounded-md border border-[#E5E7EB] bg-white p-4">
          <h3 className="text-sm font-semibold text-[#202938]">Complaints by Category</h3>
          <p className="text-xs text-[#687385] mb-3">Total submissions grouped by civic domain</p>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byCategory} margin={{ top: 8, right: 12, left: -16, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: '#687385' }}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                />
                <YAxis tick={{ fontSize: 11, fill: '#687385' }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" name="Complaints" fill="#2457C5" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Complaints by Status */}
        <section className="rounded-md border border-[#E5E7EB] bg-white p-4">
          <h3 className="text-sm font-semibold text-[#202938]">Complaints by Status</h3>
          <p className="text-xs text-[#687385] mb-3">Current workflow stage breakdown</p>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byStatus} margin={{ top: 8, right: 12, left: -16, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: '#687385' }}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                />
                <YAxis tick={{ fontSize: 11, fill: '#687385' }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" name="Records" fill="#23845B" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Complaints Over Time */}
        <section className="rounded-md border border-[#E5E7EB] bg-white p-4">
          <h3 className="text-sm font-semibold text-[#202938]">Complaints Over Time</h3>
          <p className="text-xs text-[#687385] mb-3">Daily submission vs. closure volume</p>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={overTime} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#687385' }} />
                <YAxis tick={{ fontSize: 11, fill: '#687385' }} allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="submitted" name="Submitted" stroke="#2457C5" strokeWidth={2} />
                <Line type="monotone" dataKey="resolved" name="Resolved" stroke="#23845B" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Geographic Ward Concentration Table */}
        <section className="rounded-md border border-[#E5E7EB] bg-white">
          <div className="border-b border-[#E5E7EB] px-4 py-3">
            <h3 className="text-sm font-semibold text-[#202938]">
              Geographic Analytics — High-Complaint Wards
            </h3>
            <p className="text-xs text-[#687385]">
              Complaint density and SLA breach incidence across municipal wards
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-[#E5E7EB] bg-[#F9FAFB] text-[11px] font-semibold text-[#687385]">
                  <th className="px-4 py-2.5">Ward</th>
                  <th className="px-4 py-2.5 text-right">Total</th>
                  <th className="px-4 py-2.5 text-right">Critical</th>
                  <th className="px-4 py-2.5 text-right">Overdue</th>
                  <th className="px-4 py-2.5 w-32">Density Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB] text-xs">
                {byWard.map((w) => (
                  <tr key={w.ward} className="hover:bg-[#F9FAFB]">
                    <td className="px-4 py-2.5 font-medium text-[#202938]">{w.ward}</td>
                    <td className="px-4 py-2.5 text-right font-mono-tabular">{w.total}</td>
                    <td className="px-4 py-2.5 text-right font-mono-tabular text-[#D99A32]">
                      {w.critical}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right font-mono-tabular ${
                        w.overdue > 0 ? 'font-semibold text-[#D94B4B]' : 'text-[#687385]'
                      }`}
                    >
                      {w.overdue}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 rounded-sm bg-[#E5E7EB]">
                          <div
                            className="h-full bg-[#2457C5]"
                            style={{ width: `${w.sharePct}%` }}
                          />
                        </div>
                        <span className="font-mono-tabular text-[11px] text-[#687385]">
                          {w.sharePct}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* High-Thinking Operational Analysis Query */}
      <section className="rounded-md border border-[#E5E7EB] bg-white p-5 space-y-3">
        <div className="flex items-center gap-2">
          <BrainCircuit className="h-4 w-4 text-[#2457C5]" />
          <h3 className="text-sm font-semibold text-[#202938]">
            Municipal Operations Briefing (Deep Analysis)
          </h3>
        </div>
        <form onSubmit={handleBriefingSubmit} className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            placeholder="Ask a complex operational or resource allocation question..."
            className="flex-1 rounded border border-[#E5E7EB] px-3 py-2 text-xs text-[#202938] focus:border-[#2457C5] focus:outline-none"
          />
          <button
            type="submit"
            disabled={isAnalyzing}
            className="shrink-0 rounded bg-[#2457C5] px-4 py-2 text-xs font-medium text-white hover:bg-[#1D46A3] disabled:opacity-50"
          >
            {isAnalyzing ? 'Analyzing Operations...' : 'Run Briefing'}
          </button>
        </form>

        {briefingError && (
          <div className="rounded border border-[#F4C2C2] bg-[#FEF0F0] p-3 text-xs text-[#D94B4B]">
            {briefingError}
          </div>
        )}

        {briefing && (
          <div className="grid grid-cols-1 gap-4 rounded border border-[#E5E7EB] bg-[#F9FAFB] p-4 md:grid-cols-2 text-xs">
            <div className="space-y-2">
              <div>
                <div className="font-semibold text-[#202938]">Executive Summary</div>
                <p className="mt-0.5 text-[#687385]">{briefing.summary}</p>
              </div>
              <div>
                <div className="font-semibold text-[#202938]">Root-Cause Assessment</div>
                <p className="mt-0.5 text-[#687385]">{briefing.rootCauseAssessment}</p>
              </div>
            </div>
            <div className="space-y-2">
              <div>
                <div className="font-semibold text-[#202938]">SLA Risk Assessment</div>
                <p className="mt-0.5 text-[#687385]">{briefing.slaRiskAssessment}</p>
              </div>
              {briefing.recommendedActions?.length > 0 && (
                <div>
                  <div className="font-semibold text-[#202938]">Recommended Actions</div>
                  <ul className="mt-1 list-disc pl-4 text-[#202938] space-y-0.5">
                    {briefing.recommendedActions.map((a, idx) => (
                      <li key={idx}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="text-[11px] text-[#687385] pt-1">{briefing.advisoryNotice}</div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
