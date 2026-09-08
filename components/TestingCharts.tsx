'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';

export function TestingPieChart({ pieData, stats }: { pieData: any[], stats: any }) {
  return (
    <div className="relative w-40 h-40 mb-6">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={pieData}
            innerRadius={60}
            outerRadius={80}
            paddingAngle={5}
            dataKey="value"
          >
            {pieData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      {/*
        `passRate` is null when nothing returned a verdict — every test skipped,
        or the runner reported on none of them. Rendering that gave "null%", and
        before the denominator was fixed it gave a confident 0% for a run that had
        simply not measured anything.
      */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {stats.passRate === null || stats.passRate === undefined ? (
          <>
            <span className="text-xl font-black text-amber-600">No verdict</span>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              Nothing ran
            </span>
          </>
        ) : (
          <>
            <span className="text-3xl font-black text-[#0b1c30]">{stats.passRate}%</span>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              Pass Rate
            </span>
          </>
        )}
      </div>
    </div>
  );
}

export function TestingBarChart({ stats }: { stats: any }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={stats.categoryStats} layout="vertical" margin={{ left: 40 }}>
          <XAxis type="number" hide />
          <YAxis 
            dataKey="name" 
            type="category" 
            axisLine={false} 
            tickLine={false} 
            width={120}
            tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }}
          />
          <Tooltip 
            cursor={{ fill: 'transparent' }}
            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
          />
          <Bar dataKey="passed" stackId="a" fill="#006b2c" radius={[0, 0, 0, 0]} barSize={20} />
          <Bar dataKey="failed" stackId="a" fill="#fee2e2" radius={[0, 4, 4, 0]} barSize={20} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const TestingCharts = { TestingPieChart, TestingBarChart };
export default TestingCharts;
