import { SettingsNav } from "@/components/settings/SettingsNav";
export default function Layout({ children }: { children: React.ReactNode }) {
  return <div className="h-full flex"><SettingsNav /><div className="flex-1 overflow-auto p-4">{children}</div></div>;
}
