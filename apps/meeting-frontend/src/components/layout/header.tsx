import { useAuth } from '@nest-search/frontend-shared';

export function Header() {
  const { user, logout } = useAuth();
  return (
    <header className="h-14 border-b bg-white flex items-center justify-between px-6">
      <h1 className="text-lg font-semibold">会议业务系统</h1>
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-600">{user?.username}</span>
        <button onClick={logout} className="text-sm text-red-500 hover:underline">退出</button>
      </div>
    </header>
  );
}
