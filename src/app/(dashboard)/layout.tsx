import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { Toaster } from "@/components/ui/toast";
import { Dialogs } from "@/components/ui/dialogs";
import AccessGate from "@/components/layout/AccessGate";
import MobileNav from "@/components/layout/MobileNav";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full relative">
      <Sidebar />
      <div className="dashboard-content">
        <Header />
        <main className="dashboard-main flex-1 overflow-y-auto min-h-0"><AccessGate>{children}</AccessGate></main>
      </div>
      <MobileNav />
      <Toaster />
      <Dialogs />
    </div>
  );
}
