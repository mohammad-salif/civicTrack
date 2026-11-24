import React, { useEffect, useState } from 'react';
import { usePortal } from '../context/PortalContext';
import { hasPermission } from '../lib/rbac';
import type { SystemSettings } from '../types/civic';

export const SettingsPage: React.FC = () => {
  const { currentUser, settings, updateSettings } = usePortal();
  const [form, setForm] = useState<SystemSettings>(settings);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  if (!currentUser || !hasPermission(currentUser.role, 'manage_settings')) {
    return (
      <div className="rounded-md border border-[#E5E7EB] bg-white p-8 text-center">
        <h2 className="text-sm font-semibold text-[#202938]">Super Admin Authorization Required</h2>
        <p className="mt-1 text-xs text-[#687385]">
          Only Super Admin officials can modify municipal SLA thresholds and portal settings.
        </p>
      </div>
    );
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await updateSettings(form);
    setSaving(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[#202938]">System Settings</h2>
          <p className="text-xs text-[#687385]">
            Configure municipal authority identity, SLA deadline thresholds, and administrative
            governance controls
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 items-start">
          {/* Left 7 Cols: Identity & SLA Thresholds */}
          <div className="space-y-5 lg:col-span-7">
            <section className="rounded-md border border-[#E5E7EB] bg-white p-5 space-y-4">
              <h3 className="text-sm font-semibold text-[#202938] border-b border-[#E5E7EB] pb-2.5">
                Municipal Authority Configuration
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-xs">
                <div>
                  <label className="block font-medium text-[#202938] mb-1">
                    Municipality Name
                  </label>
                  <input
                    value={form.municipalityName}
                    onChange={(e) => setForm({ ...form, municipalityName: e.target.value })}
                    className="w-full rounded border border-[#E5E7EB] px-3 py-2 text-[#202938]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#202938] mb-1">
                    Administrative Region
                  </label>
                  <input
                    value={form.administrativeRegion}
                    onChange={(e) => setForm({ ...form, administrativeRegion: e.target.value })}
                    className="w-full rounded border border-[#E5E7EB] px-3 py-2 text-[#202938]"
                  />
                </div>
              </div>
            </section>

            <section className="rounded-md border border-[#E5E7EB] bg-white p-5 space-y-4">
              <h3 className="text-sm font-semibold text-[#202938] border-b border-[#E5E7EB] pb-2.5">
                Priority SLA Target Windows (Hours)
              </h3>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 text-xs">
                {(['Critical', 'High', 'Medium', 'Low'] as const).map((lvl) => (
                  <div key={lvl}>
                    <label className="block font-medium text-[#202938] mb-1">{lvl} Priority</label>
                    <input
                      type="number"
                      min={1}
                      max={720}
                      value={form.slaHours[lvl]}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          slaHours: { ...form.slaHours, [lvl]: Number(e.target.value) },
                        })
                      }
                      className="w-full rounded border border-[#E5E7EB] px-3 py-2 font-mono-tabular text-[#202938]"
                    />
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Right 5 Cols: Governance Controls */}
          <section className="rounded-md border border-[#E5E7EB] bg-white p-5 space-y-4 lg:col-span-5">
            <h3 className="text-sm font-semibold text-[#202938] border-b border-[#E5E7EB] pb-2.5">
              Governance & Security Controls
            </h3>
            <label className="flex items-start gap-2.5 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={form.requireRejectionReason}
                onChange={(e) => setForm({ ...form, requireRejectionReason: e.target.checked })}
                className="mt-0.5 h-4 w-4 rounded border-[#E5E7EB] text-[#2457C5]"
              />
              <div>
                <div className="font-medium text-[#202938]">Mandatory Rejection Justification</div>
                <div className="text-[#687385]">
                  Officials must enter a formal reason before rejecting any citizen complaint.
                </div>
              </div>
            </label>
            <label className="flex items-start gap-2.5 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={form.citizenMaskingForFieldOfficers}
                onChange={(e) =>
                  setForm({ ...form, citizenMaskingForFieldOfficers: e.target.checked })
                }
                className="mt-0.5 h-4 w-4 rounded border-[#E5E7EB] text-[#2457C5]"
              />
              <div>
                <div className="font-medium text-[#202938]">
                  Mask Citizen Contact Details for Field Officers
                </div>
                <div className="text-[#687385]">
                  Restrict personal phone and email visibility to authorized administrative roles.
                </div>
              </div>
            </label>
            <label className="flex items-start gap-2.5 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={form.autoEscalateOnBreachFlag}
                onChange={(e) => setForm({ ...form, autoEscalateOnBreachFlag: e.target.checked })}
                className="mt-0.5 h-4 w-4 rounded border-[#E5E7EB] text-[#2457C5]"
              />
              <div>
                <div className="font-medium text-[#202938]">
                  Flag SLA Breaches in Escalation Queue
                </div>
                <div className="text-[#687385]">
                  Surface overdue records in the Priority & Escalation Management matrix for human
                  review.
                </div>
              </div>
            </label>

            <div className="border-t border-[#E5E7EB] pt-4 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="rounded bg-[#2457C5] px-4 py-2 text-xs font-medium text-white hover:bg-[#1D46A3] disabled:opacity-50"
              >
                {saving ? 'Saving Configuration...' : 'Save System Settings'}
              </button>
            </div>
          </section>
        </div>
      </form>
    </div>
  );
};
