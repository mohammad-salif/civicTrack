import React from 'react';
import { Landmark, ShieldCheck } from 'lucide-react';
import { usePortal } from '../context/PortalContext';

export const SignInView: React.FC = () => {
  const { directoryAccounts, signInAs, settings, isLoading } = usePortal();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F5F6F8] p-4">
      <div className="w-full max-w-lg rounded-md border border-[#E5E7EB] bg-white">
        <div className="border-b border-[#E5E7EB] px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded bg-[#2457C5] text-white">
              <Landmark className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-[#202938]">
                CivicTrack — Government Administration Portal
              </h1>
              <p className="text-xs text-[#687385]">{settings.municipalityName}</p>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="rounded border border-[#E5E7EB] bg-[#F9FAFB] p-3 text-xs text-[#687385]">
            Authorized Municipal Officials Only. Select an official credential profile below to
            establish a role-scoped administrative session.
          </div>

          <div className="divide-y divide-[#E5E7EB] rounded border border-[#E5E7EB]">
            {directoryAccounts.map((acc) => (
              <div
                key={acc.id}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[#F9FAFB]"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[#202938]">{acc.name}</span>
                    <span className="font-mono-tabular text-[11px] text-[#687385]">
                      {acc.employeeId}
                    </span>
                  </div>
                  <div className="text-xs text-[#687385]">
                    {acc.role} · {acc.designation} · {acc.jurisdiction}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => signInAs(acc.id)}
                  className="shrink-0 rounded bg-[#2457C5] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1D46A3] disabled:opacity-50 whitespace-nowrap"
                >
                  Sign In
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-[#E5E7EB] bg-[#F9FAFB] px-6 py-3 text-[11px] text-[#687385]">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-[#2457C5]" />
            <span>Role-Based Access Enforced</span>
          </span>
          <span>Portal Code: {settings.portalCode}</span>
        </div>
      </div>
    </div>
  );
};
