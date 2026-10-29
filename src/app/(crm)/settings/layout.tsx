import { requireAdmin } from "@/lib/crm/require-admin";
import { SettingsNav } from "@/components/settings/SettingsNav";
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <div className="h-full flex flex-col md:flex-row"><SettingsNav /><div className="flex-1 min-h-0 overflow-auto p-3 md:p-4">{children}</div></div>;
}
