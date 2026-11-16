"use client";

import { PrivacyBoot } from "@/components/ui/Privacy";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 3000, refetchOnWindowFocus: false } },
  }));

  return <QueryClientProvider client={queryClient}><PrivacyBoot />{children}</QueryClientProvider>;
}
