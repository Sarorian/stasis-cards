export default function StatCard({ label, value, sub, tone = '', hero = false }) {
  return (
    <div className={`stat${hero ? ' hero' : ''}`}>
      <div className="label">{label}</div>
      <div className={`value ${tone}`}>{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}
