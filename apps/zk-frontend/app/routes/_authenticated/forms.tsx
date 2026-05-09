import { createFileRoute } from '@tanstack/react-router';
import { useForms } from '~/hooks/use-forms';
import { FormList } from '~/components/forms/form-list';

export const Route = createFileRoute('/_authenticated/forms')({
  component: FormsPage,
});

function FormsPage() {
  const { data, isLoading, error } = useForms();

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
      <h2 className="text-2xl font-bold mb-4">表单管理</h2>
      {isLoading ? <div>加载中...</div> : <FormList forms={data as unknown[]} />}
    </div>
  );
}
