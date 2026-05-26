import { useState } from 'react';

interface ProductSearchProps {
  onSearch: (params: URLSearchParams) => void;
}

export function ProductSearch({ onSearch }: ProductSearchProps) {
  const [query, setQuery] = useState('');

  function handleSearch() {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    onSearch(params);
  }

  return (
    <div className="flex gap-4 items-end">
      <div className="flex-1 max-w-md">
        <input
          placeholder="搜索产品..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          className="w-full px-3 py-2 border rounded-md"
        />
      </div>
      <button onClick={handleSearch} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
        搜索
      </button>
    </div>
  );
}
