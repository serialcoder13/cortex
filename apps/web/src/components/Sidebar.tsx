import { NavLink } from "react-router-dom";

const navItems = [
  { to: "/", label: "Calendar", icon: "📅" },
  { to: "/doc", label: "Documents", icon: "📄" },
  { to: "/todos", label: "Todos", icon: "✅" },
  { to: "/settings", label: "Settings", icon: "⚙️" },
];

export function Sidebar() {
  return (
    <aside className="flex w-56 flex-col border-r border-neutral-800 bg-neutral-900">
      <div className="p-4">
        <h1 className="text-lg font-bold tracking-tight">Cortex</h1>
      </div>
      <nav className="flex-1 space-y-1 px-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                isActive
                  ? "bg-neutral-800 text-white"
                  : "text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200"
              }`
            }
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
