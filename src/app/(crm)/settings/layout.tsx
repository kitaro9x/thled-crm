import { SettingsNav } from "@/components/settings/SettingsNav";
export default function Layout({ children }: { children: React.ReactNode }) {
  return <div className="h-full flex flex-col md:flex-row"><SettingsNav /><div className="flex-1 min-h-0 overflow-auto p-3 md:p-4">{children}</div></div>;
}
