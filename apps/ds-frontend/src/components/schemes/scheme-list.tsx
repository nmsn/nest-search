import { Link } from '@tanstack/react-router';

interface Scheme {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'archived';
}

interface SchemeListProps {
  schemes: Scheme[];
}

const statusMap: Record<string, string> = {
  draft: '草稿',
  active: '启用',
  archived: '归档',
};

export function SchemeList({ schemes }: SchemeListProps) {
  if (!schemes?.length) return <p className="text-gray-500">暂无方案数据</p>;

  return (
    <div className="bg-white rounded shadow">
      <table className="w-full">
        <thead>
          <tr className="border-b">
            <th className="p-3 text-left">名称</th>
            <th className="p-3 text-left">状态</th>
            <th className="p-3 text-left">操作</th>
          </tr>
        </thead>
        <tbody>
          {schemes.map((scheme) => (
            <tr key={scheme.id} className="border-b">
              <td className="p-3 font-medium">{scheme.name}</td>
              <td className="p-3">
                <span className="px-2 py-1 text-xs rounded bg-gray-100">{statusMap[scheme.status] || scheme.status}</span>
              </td>
              <td className="p-3">
                <Link to="/schemes/$id" params={{ id: scheme.id }} className="text-blue-600 hover:underline">查看</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
