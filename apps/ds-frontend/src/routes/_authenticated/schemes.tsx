import { createFileRoute } from '@tanstack/react-router';
import { useSchemes } from '~/hooks/use-schemes';
import { SchemeList } from '~/components/schemes/scheme-list';

export const Route = createFileRoute('/_authenticated/schemes')({
  component: SchemesPage,
});

function SchemesPage() {
  const { data, isLoading, error } = useSchemes();

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 mb-4">加载失败</p>
        <button onClick={() => window.location.reload()} className="text-blue-600 underline">重试</button>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">方案管理</h2>
      {isLoading ? <div>加载中...</div> : <SchemeList schemes={data as unknown[]} />}
    </div>
  );
}
