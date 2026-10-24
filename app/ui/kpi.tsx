"use client";


type KpiProps = {
  label: string;
  value: string;
  detail: string;
  tone: string;
  ring?: number;
  progress?: number;
  avatars?: boolean;
};

export function Kpi({ label, value, detail, tone, ring, progress, avatars }: KpiProps) {
  return (
    <div className={`kpi ${tone}`}>
      <span>{label}</span>
      <div className="kpi-main">
        <div>
          <b>{value}</b>
          <small>{detail}</small>
        </div>
        {ring && (
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
      {progress && (
        <div className="bar">
          <i style={{ width: `${progress}%` }} />
        </div>
      )}
      {avatars && (
        <div className="avatars">
          <i>JM</i>
          <i>SB</i>
          <i>ML</i>
          <i>+9</i>
        </div>
      )}
    </div>
  );
}
