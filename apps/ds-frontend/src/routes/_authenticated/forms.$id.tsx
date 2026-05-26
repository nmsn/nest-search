import { createFileRoute } from '@tanstack/react-router';
import { useForm } from '~/hooks/use-forms';
import { FormDetail } from '~/components/forms/form-detail';

export const Route = createFileRoute('/_authenticated/forms/$id')({
  component: FormDetailPage,
});

function FormDetailPage() {
  const { id } = Route.useParams();
  const { data, isLoading } = useForm(id);

  if (isLoading) return <div>加载中...</div>;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">表单详情</h2>
      <FormDetail form={data as Record<string, unknown>} />
    </div>
  );
}
