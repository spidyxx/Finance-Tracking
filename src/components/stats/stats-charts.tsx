"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  ComposedChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { StatsData } from "@/services/stats";

const PALETTE = [
  "#2563eb", "#16a34a", "#dc2626", "#d97706", "#7c3aed",
  "#0891b2", "#db2777", "#65a30d", "#ca8a04", "#0d9488",
];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const eur = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const eur2 = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const c = (cents: number) => cents / 100;
const tip = (v: number) => eur2.format(v);
const fmtMonth = (m: string) => `${MON[+m.split("-")[1] - 1]} ${m.split("-")[0].slice(2)}`;
const fmtPeriod = (key: string, gran: "day" | "month") => {
  const parts = key.split("-");
  return gran === "day" ? `${parts[2]}.${parts[1]}` : fmtMonth(key);
};

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-medium text-gray-500">{title}</h2>
      {children}
    </div>
  );
}

export function StatsCharts({ data }: { data: StatsData }) {
  const gran = data.granularity;
  const nw = data.netWorth.map((d) => ({ period: fmtPeriod(d.period, gran), v: c(d.cents) }));
  const ie = data.incomeExpense.map((d) => ({
    month: fmtMonth(d.month),
    income: c(d.incomeCents),
    expense: c(d.expenseCents),
    net: c(d.netCents),
  }));
  const accts = data.accountSeries.map((row) => {
    const o: Record<string, number | string> = { period: fmtPeriod(String(row.period), gran) };
    for (const name of data.accountNames) o[name] = c(Number(row[name] ?? 0));
    return o;
  });
  const pie = data.spending.map((s, i) => ({
    name: s.name,
    value: c(s.cents),
    fill: s.color ?? PALETTE[i % PALETTE.length],
  }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Net worth over time">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={nw} margin={{ left: 8, right: 8, top: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="period" fontSize={11} minTickGap={40} />
            <YAxis tickFormatter={(v) => eur.format(v)} width={70} fontSize={11} />
            <Tooltip formatter={(v) => tip(Number(v))} />
            <Line type="monotone" dataKey="v" name="Net worth" stroke="#2563eb" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Income vs Expenses per month">
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={ie} margin={{ left: 8, right: 8, top: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="month" fontSize={11} />
            <YAxis tickFormatter={(v) => eur.format(v)} width={70} fontSize={11} />
            <Tooltip formatter={(v) => tip(Number(v))} />
            <Legend />
            <Bar dataKey="income" name="Income" fill="#16a34a" />
            <Bar dataKey="expense" name="Expenses" fill="#dc2626" />
            <Line type="monotone" dataKey="net" name="Net" stroke="#111827" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Spending by category">
        {pie.length === 0 ? (
          <p className="text-sm text-gray-400">No expenses in this range.</p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={pie} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={1}>
                  {pie.map((p, i) => (
                    <Cell key={i} fill={p.fill} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => tip(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {pie.map((p, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: p.fill }} />
                  <span className="text-gray-700">{p.name}</span>
                  <span className="text-gray-400">{eur.format(p.value)}</span>
                </span>
              ))}
            </div>
          </>
        )}
      </Card>

      <Card title="Per-account balance over time">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={accts} margin={{ left: 8, right: 8, top: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="period" fontSize={11} minTickGap={40} />
            <YAxis tickFormatter={(v) => eur.format(v)} width={70} fontSize={11} />
            <Tooltip formatter={(v) => tip(Number(v))} />
            <Legend />
            {data.accountNames.map((name, i) => (
              <Line
                key={name}
                type="monotone"
                dataKey={name}
                stroke={PALETTE[i % PALETTE.length]}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
