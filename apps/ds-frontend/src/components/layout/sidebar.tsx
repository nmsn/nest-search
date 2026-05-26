import { Link } from '@tanstack/react-router';

const navItems = [
  { to: '/products', label: '产品搜索' },
  { to: '/schemes', label: '方案管理' },
  { to: '/forms', label: '表单管理' },
];

export function Sidebar() {
  return (
    <aside className="w-64 bg-gray-900 text-white flex flex-col">
      <div className="p-4 text-xl font-bold border-b border-gray-700">商显管理</div>
      <nav className="flex-1 p-4 space-y-2">
        {navItems.map((item) => (
          <Link key={item.to} to={item.to} className="block px-3 py-2 rounded hover:bg-gray-700 [&.active]:bg-gray-700">
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
