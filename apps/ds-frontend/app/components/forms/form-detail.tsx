interface FormDetailProps {
  form: Record<string, unknown>;
}

export function FormDetail({ form }: FormDetailProps) {
  if (!form) return <p className="text-gray-500">表单不存在</p>;

  return (
    <div className="bg-white p-6 rounded shadow">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold">{form.name as string}</h3>
        <span className="px-2 py-1 text-xs rounded bg-gray-100">{form.status as string}</span>
      </div>
      <pre className="bg-gray-50 p-4 rounded text-sm overflow-auto">
        {JSON.stringify(form, null, 2)}
      </pre>
    </div>
  );
}
