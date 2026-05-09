import { createFileRoute } from '@tanstack/react-router';
import { useScheme } from '~/hooks/use-schemes';
import { SchemeForm } from '~/components/schemes/scheme-form';

export const Route = createFileRoute('/_authenticated/schemes/$id')({
  component: SchemeDetailPage,
});

function SchemeDetailPage() {
  const { id } = Route.useParams();
  const { data, isLoading } = useScheme(id);

  if (isLoading) return <div>加载中...</div>;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">方案详情</h2>
      <SchemeForm initialData={data as Record<string, unknown>} schemeId={id} />
    </div>
  );
}
