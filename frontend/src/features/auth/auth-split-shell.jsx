"use client";

import { HeartPulse } from "lucide-react";

export function AuthSplitShell({ children }) {
  return (
    <div className="grid h-full min-h-0 w-full grid-cols-1 overflow-hidden lg:grid-cols-2">
      <section className="relative hidden min-h-0 flex-col bg-primary-500 text-white lg:flex">
        <div className="flex min-h-0 flex-1 flex-col px-10 py-8 xl:px-16 xl:py-12">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-white/20">
              <HeartPulse className="h-5 w-5 text-white" strokeWidth={2.25} />
            </div>
            <span className="font-heading text-[1.35rem] font-bold tracking-tight text-white">
              ClaudMD
            </span>
          </div>

          <div className="flex min-h-0 flex-1 flex-col justify-center py-8">
            <div className="max-w-md">
              <h1 className="font-heading text-4xl leading-[1.12] font-bold text-white xl:text-[3.1rem]">
                Unified Healthcare Portal
              </h1>
              <p className="mt-5 max-w-[26rem] font-body text-base leading-[1.65] text-white/90 xl:text-[1.05rem]">
                Securely access your healthcare information, manage appointments,
                and review documents all in one place.
              </p>
            </div>
          </div>

          <p className="font-body text-sm text-white/70">
            © 2026 ClaudMD Healthcare Systems
          </p>
        </div>
      </section>

      <section className="flex min-h-0 flex-col overflow-y-auto overscroll-contain bg-white">
        <div className="flex flex-1 items-start justify-center px-4 py-8 sm:items-center sm:px-8 sm:py-10 md:px-10">
          <div className="w-full max-w-[392px]">
            <div className="mb-7 flex items-center gap-2.5 sm:mb-8 lg:hidden">
              <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-primary-500 text-white sm:h-10 sm:w-10">
                <HeartPulse className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2.25} />
              </div>
              <span className="font-heading text-lg font-bold tracking-tight text-foreground-900 sm:text-xl">
                ClaudMD
              </span>
            </div>
            {children}
          </div>
        </div>
      </section>
    </div>
  );
}
