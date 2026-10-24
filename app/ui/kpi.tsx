"use client";

type KpiProps = {
  label: string;
  value: string;
  detail: string;
  tone: string;
  ring?: number;
  progress?: number;
};

export function Kpi({ label, value, detail, tone, ring, progress }: KpiProps) {
  return (
    <div className={`kpi ${tone}`}>
      <span>{label}</span>
      <div className="kpi-main">
        <div>
          <b>{value}</b>
          <small>{detail}</small>
        </div>
        {ring !== undefined && (
          <div
            className="ring"
            style={{
              background: `conic-gradient(#2d7f65 ${ring}%, #e7ebe9 0)`,
            }}
          >
            <i>{ring}</i>
          </div>
        )}
      </div>
      {progress !== undefined && (
        <div className="bar">
          <i style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  );
}
