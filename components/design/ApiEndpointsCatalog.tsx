'use client';

interface ApiEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  description: string;
}

interface ApiEndpointsCatalogProps {
  apiEndpoints?: ApiEndpoint[];
}

export default function ApiEndpointsCatalog({ apiEndpoints }: ApiEndpointsCatalogProps) {
  if (!apiEndpoints || apiEndpoints.length === 0) return null;

  return (
    <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm lg:col-span-2 flex flex-col">
      <div className="mb-4">
        <h4 className="font-extrabold text-slate-900 text-lg">Target API Catalog</h4>
        <p className="text-xs text-slate-400 mt-1">Proposed API layer handling the transformed legacy transaction capability.</p>
      </div>
      
      <div className="flex-1 overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Method</th>
              <th className="py-3 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Route Path</th>
              <th className="py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Action Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 text-xs">
            {apiEndpoints.map((route, idx) => {
              const methodColors = {
                GET: 'bg-green-50 text-green-700 border-green-200',
                POST: 'bg-blue-50 text-blue-700 border-blue-200',
                PUT: 'bg-amber-50 text-amber-700 border-amber-200',
                DELETE: 'bg-red-50 text-red-700 border-red-200'
              };
              return (
                <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-3.5">
                    <span className={`inline-flex px-2 py-0.5 rounded-md font-extrabold border text-[9px] ${methodColors[route.method] || 'bg-slate-100 text-slate-700'}`}>
                      {route.method}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-mono font-bold text-slate-800 select-all">{route.path}</td>
                  <td className="py-3.5 text-slate-600 leading-relaxed">{route.description}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
