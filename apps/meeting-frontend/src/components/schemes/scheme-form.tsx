import { useState } from 'react';
import { useUpdateScheme } from '~/hooks/use-schemes';

interface SchemeFormProps {
  initialData?: Record<string, unknown>;
  schemeId?: string;
}

export function SchemeForm({ initialData, schemeId }: SchemeFormProps) {
  const [name, setName] = useState((initialData?.name as string) || '');
  const [status, setStatus] = useState((initialData?.status as string) || 'draft');
  const updateMutation = useUpdateScheme(schemeId || '');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    updateMutation.mutate({ name, status });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
      <div className="space-y-2">
        <label className="block text-sm font-medium">方案名称</label>
        <input value={name} onChange={(e) => setName(e.target.value)} required className="w-full px-3 py-2 border rounded-md" />
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-medium">状态</label>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full px-3 py-2 border rounded-md">
          <option value="draft">草稿</option>
          <option value="active">启用</option>
          <option value="archived">归档</option>
        </select>
      </div>
      <button type="submit" disabled={updateMutation.isPending} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
        {updateMutation.isPending ? '保存中...' : '保存'}
      </button>
    </form>
  );
}
