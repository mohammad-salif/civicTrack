import React, { useMemo, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { StatusLabel, formatShortDate } from '../components/StatusLabels';
import { usePortal } from '../context/PortalContext';
import { hasPermission } from '../lib/rbac';
import type { Officer, OfficerAvailability } from '../types/civic';

export const StaffPage: React.FC = () => {
  const { currentUser, officers, departments, complaints, createOfficer, updateOfficer } =
    usePortal();

  const canManage = currentUser ? hasPermission(currentUser.role, 'manage_staff') : false;

  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Inactive'>('All');

  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingOfficer, setEditingOfficer] = useState<Officer | null>(null);
  const [historyOfficer, setHistoryOfficer] = useState<Officer | null>(null);

  // Form fields
  const [employeeId, setEmployeeId] = useState('');
  const [name, setName] = useState('');
  const [designation, setDesignation] = useState('');
  const [departmentId, setDepartmentId] = useState(departments[0]?.id || '');
  const [wardJurisdiction, setWardJurisdiction] = useState('Ward 01 - Central');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [availability, setAvailability] = useState<OfficerAvailability>('Available');

  const deptMap = useMemo(
    () => Object.fromEntries(departments.map((d) => [d.id, d])),
    [departments]
  );

  const enrichedOfficers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return officers
      .filter((o) => {
        if (deptFilter !== 'All' && o.departmentId !== deptFilter) return false;
        if (statusFilter !== 'All' && o.status !== statusFilter) return false;
        if (!q) return true;
        return (
          o.name.toLowerCase().includes(q) ||
          o.employeeId.toLowerCase().includes(q) ||
          o.designation.toLowerCase().includes(q) ||
          o.wardJurisdiction.toLowerCase().includes(q)
        );
      })
      .map((o) => {
        const assignedCount = complaints.filter(
          (c) =>
            c.assignedOfficerId === o.id && c.status !== 'Resolved' && c.status !== 'Rejected'
        ).length;
        const workloadPct = Math.min(100, assignedCount * 25);
        return { officer: o, assignedCount, workloadPct };
      });
  }, [officers, complaints, search, deptFilter, statusFilter]);

  const openCreate = () => {
    setEditingOfficer(null);
    setEmployeeId('');
    setName('');
    setDesignation('');
    setDepartmentId(departments[0]?.id || '');
    setWardJurisdiction('Ward 01 - Central');
    setEmail('');
    setPhone('');
    setAvailability('Available');
    setModalMode('create');
  };

  const openEdit = (o: Officer) => {
    setEditingOfficer(o);
    setEmployeeId(o.employeeId);
    setName(o.name);
    setDesignation(o.designation);
    setDepartmentId(o.departmentId);
    setWardJurisdiction(o.wardJurisdiction);
    setEmail(o.email);
    setPhone(o.phone);
    setAvailability(o.availability);
    setModalMode('edit');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (modalMode === 'create') {
      const ok = await createOfficer({
        employeeId,
        name,
        designation,
        departmentId,
        wardJurisdiction,
        email,
        phone,
        availability,
      });
      if (ok) setModalMode(null);
    } else if (modalMode === 'edit' && editingOfficer) {
      const ok = await updateOfficer(editingOfficer.id, {
        name,
        designation,
        departmentId,
        wardJurisdiction,
        email,
        phone,
        availability,
      });
      if (ok) setModalMode(null);
    }
  };

  const officerWorkHistory = useMemo(() => {
    if (!historyOfficer) return [];
    return complaints.filter((c) => c.assignedOfficerId === historyOfficer.id);
  }, [complaints, historyOfficer]);

  return (
    <div className="space-y-4 max-w-[1440px]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[#202938]">Officers & Staff Management</h2>
          <p className="text-xs text-[#687385]">
            Municipal field personnel directory, ward jurisdictions, workload allocation, and account status
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 rounded bg-[#2457C5] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[#1D46A3] whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Officer</span>
          </button>
        )}
      </div>

      {/* Filters */}
      <section className="flex flex-wrap items-center gap-3 rounded-md border border-[#E5E7EB] bg-white p-3.5">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#687385]" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search officer name, employee ID, or ward..."
            className="w-full rounded border border-[#E5E7EB] bg-[#F9FAFB] py-1.5 pl-8 pr-3 text-xs text-[#202938] focus:border-[#2457C5] focus:bg-white focus:outline-none"
          />
        </div>
        <select
          aria-label="Filter by department"
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
        <select
          aria-label="Filter by account status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'All' | 'Active' | 'Inactive')}
          className="rounded border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-xs text-[#202938]"
        >
          <option value="All">All Account Statuses</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>
      </section>

      {/* Officers Table */}
      <section className="rounded-md border border-[#E5E7EB] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[#E5E7EB] bg-[#F9FAFB] text-[11px] font-semibold text-[#687385]">
                <th className="px-4 py-2.5">Employee ID</th>
                <th className="px-4 py-2.5">Officer & Designation</th>
                <th className="px-4 py-2.5">Department</th>
                <th className="px-4 py-2.5">Ward / Jurisdiction</th>
                <th className="px-4 py-2.5 text-right">Assigned</th>
                <th className="px-4 py-2.5 text-right">Completed</th>
                <th className="px-4 py-2.5 w-32">Workload</th>
                <th className="px-4 py-2.5">Account Status</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB] text-xs">
              {enrichedOfficers.map(({ officer: o, assignedCount, workloadPct }) => (
                <tr key={o.id} className="hover:bg-[#F9FAFB]">
                  <td className="px-4 py-3 font-mono-tabular font-semibold text-[#2457C5] whitespace-nowrap">
                    {o.employeeId}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-[#202938]">{o.name}</div>
                    <div className="text-[11px] text-[#687385]">{o.designation}</div>
                  </td>
                  <td className="px-4 py-3 text-[#202938] whitespace-nowrap">
                    {deptMap[o.departmentId]?.name || '—'}
                  </td>
                  <td className="px-4 py-3 text-[#687385] whitespace-nowrap">
                    {o.wardJurisdiction}
                  </td>
                  <td className="px-4 py-3 text-right font-mono-tabular text-[#202938]">
                    {assignedCount}
                  </td>
                  <td className="px-4 py-3 text-right font-mono-tabular text-[#23845B]">
                    {o.completedComplaints}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-sm bg-[#E5E7EB]">
                        <div
                          className={`h-full ${
                            workloadPct >= 75 ? 'bg-[#D99A32]' : 'bg-[#2457C5]'
                          }`}
                          style={{ width: `${workloadPct}%` }}
                        />
                      </div>
                      <span className="font-mono-tabular text-[11px] text-[#687385]">
                        {workloadPct}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`inline-block rounded-sm border px-2 py-0.5 text-[11px] font-medium ${
                        o.status === 'Active'
                          ? 'border-[#B7E1CE] bg-[#ECF7F2] text-[#1D6B4A]'
                          : 'border-[#D1D5DB] bg-[#F3F4F6] text-[#687385]'
                      }`}
                    >
                      {o.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap space-x-3">
                    <button
                      type="button"
                      onClick={() => setHistoryOfficer(o)}
                      className="text-xs font-medium text-[#2457C5] hover:underline"
                    >
                      Work History
                    </button>
                    {canManage && (
                      <>
                        <button
                          type="button"
                          onClick={() => openEdit(o)}
                          className="text-xs font-medium text-[#202938] hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateOfficer(o.id, {
                              status: o.status === 'Active' ? 'Inactive' : 'Active',
                            })
                          }
                          className={`text-xs font-medium hover:underline ${
                            o.status === 'Active' ? 'text-[#D94B4B]' : 'text-[#23845B]'
                          }`}
                        >
                          {o.status === 'Active' ? 'Deactivate' : 'Activate'}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Work History Drawer */}
      {historyOfficer && (
        <section className="rounded-md border border-[#E5E7EB] bg-white p-5">
          <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3">
            <div>
              <h3 className="text-sm font-semibold text-[#202938]">
                Work History — {historyOfficer.name} ({historyOfficer.employeeId})
              </h3>
              <p className="text-xs text-[#687385]">
                {historyOfficer.designation} · {deptMap[historyOfficer.departmentId]?.name} ·{' '}
                {historyOfficer.completedComplaints} career completions
              </p>
            </div>
            <button
              type="button"
              onClick={() => setHistoryOfficer(null)}
              className="rounded p-1 text-[#687385] hover:bg-[#F5F6F8]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 divide-y divide-[#E5E7EB]">
            {officerWorkHistory.length === 0 ? (
              <div className="py-6 text-center text-xs text-[#687385]">
                No current complaints assigned to this officer.
              </div>
            ) : (
              officerWorkHistory.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-3 py-2.5 text-xs"
                >
                  <div className="min-w-0">
                    <Link
                      to={`/complaints/${c.id}`}
                      className="font-mono-tabular font-semibold text-[#2457C5] hover:underline"
                    >
                      {c.id}
                    </Link>
                    <span className="ml-2 font-medium text-[#202938]">{c.title}</span>
                    <div className="text-[11px] text-[#687385]">
                      {c.ward} · Reported {formatShortDate(c.reportedAt)}
                    </div>
                  </div>
                  <StatusLabel status={c.status} />
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {/* Add / Edit Officer Modal */}
      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#202938]/40 p-4">
          <div className="w-full max-w-md rounded-md border border-[#E5E7EB] bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] px-5 py-3.5">
              <h3 className="text-sm font-semibold text-[#202938]">
                {modalMode === 'create' ? 'Register Municipal Officer' : 'Edit Officer Details'}
              </h3>
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="text-[#687385] hover:text-[#202938]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-3 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-[#202938] mb-1">Employee ID</label>
                  <input
                    required
                    disabled={modalMode === 'edit'}
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                    placeholder="EMP-2190"
                    className="w-full rounded border border-[#E5E7EB] px-2.5 py-1.5 disabled:bg-[#F5F6F8]"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block font-medium text-[#202938] mb-1">Full Name</label>
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded border border-[#E5E7EB] px-2.5 py-1.5"
                  />
                </div>
              </div>
              <div>
                <label className="block font-medium text-[#202938] mb-1">Designation</label>
                <input
                  required
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  placeholder="e.g. Field Operations Engineer"
                  className="w-full rounded border border-[#E5E7EB] px-2.5 py-1.5"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#202938] mb-1">Department</label>
                  <select
                    value={departmentId}
                    onChange={(e) => setDepartmentId(e.target.value)}
                    className="w-full rounded border border-[#E5E7EB] px-2.5 py-1.5"
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-[#202938] mb-1">
                    Ward / Jurisdiction
                  </label>
                  <select
                    value={wardJurisdiction}
                    onChange={(e) => setWardJurisdiction(e.target.value)}
                    className="w-full rounded border border-[#E5E7EB] px-2.5 py-1.5"
                  >
                    <option value="Ward 01 - Central">Ward 01 - Central</option>
                    <option value="Ward 02 - North Harbor">Ward 02 - North Harbor</option>
                    <option value="Ward 03 - East Market">Ward 03 - East Market</option>
                    <option value="Ward 04 - West Industrial">Ward 04 - West Industrial</option>
                    <option value="Ward 05 - South Riverfront">Ward 05 - South Riverfront</option>
                    <option value="Ward 06 - Midtown">Ward 06 - Midtown</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#202938] mb-1">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded border border-[#E5E7EB] px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#202938] mb-1">Availability</label>
                  <select
                    value={availability}
                    onChange={(e) => setAvailability(e.target.value as OfficerAvailability)}
                    className="w-full rounded border border-[#E5E7EB] px-2.5 py-1.5"
                  >
                    <option value="Available">Available</option>
                    <option value="On Field Duty">On Field Duty</option>
                    <option value="At Capacity">At Capacity</option>
                    <option value="Off Duty">Off Duty</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-[#E5E7EB] pt-3">
                <button
                  type="button"
                  onClick={() => setModalMode(null)}
                  className="rounded border border-[#E5E7EB] bg-white px-3 py-1.5 font-medium text-[#202938]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded bg-[#2457C5] px-3.5 py-1.5 font-medium text-white hover:bg-[#1D46A3]"
                >
                  {modalMode === 'create' ? 'Register Officer' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
