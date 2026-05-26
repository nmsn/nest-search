import { Link } from '@tanstack/react-router';

interface Form {
  id: string;
  name: string;
  status: string;
}

interface FormListProps {
  forms: Form[];
}

export function FormList({ forms }: FormListProps) {
  if (!forms?.length) return <p className="text-gray-500">暂无表单数据</p>;

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
          {forms.map((form) => (
            <tr key={form.id} className="border-b">
              <td className="p-3 font-medium">{form.name}</td>
              <td className="p-3">
                <span className="px-2 py-1 text-xs rounded bg-gray-100">{form.status}</span>
              </td>
              <td className="p-3">
                <Link to="/forms/$id" params={{ id: form.id }} className="text-blue-600 hover:underline">查看</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
