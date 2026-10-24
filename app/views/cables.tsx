"use client";

import { useState } from "react";
import { Kpi } from "@/app/ui/kpi";

const cables = [
  ["C-0012", "TGBT-01", "MCC-03", "U1000 R2V 4G25", "86 m", "Tiré"],
  ["C-0013", "TGBT-01", "MCC-04", "U1000 R2V 4G16", "64 m", "À tirer"],
  ["C-0014", "API-01", "CAP-117", "LiYCY 2x2x0,75", "42 m", "Raccordé"],
  ["C-0015", "MCC-03", "MOT-208", "U1000 R2V 4G6", "118 m", "Tiré"],
  ["C-0016", "API-01", "EV-042", "LiYCY 4x0,75", "35 m", "À tirer"],
];

export function Cables({ toast }: { toast: (s: string) => void }) {
  const [imported, setImported] = useState(false);
  return (
    <div className="content page-content">
      <div className="page-head">
        <div>
          <h2>Carnet de câbles</h2>
          <p>
            Importez, contrôlez et suivez les tirages fournis par le client.
          </p>
        </div>
        <button
          className="primary"
          onClick={() => {
            setImported(true);
            toast("Import terminé : 142 lignes reconnues");
          }}
        >
          ⇧ Importer un fichier Excel
        </button>
      </div>
      {imported && (
        <div className="import-success">
          ✓{" "}
          <div>
            <b>carnet_cables_client_v4.xlsx importé</b>
            <small>
              142 lignes reconnues · 3 doublons ignorés · il y a quelques
              secondes
            </small>
          </div>
          <button>Voir le rapport</button>
        </div>
      )}
      <div className="cable-kpis">
        <Kpi
          label="TOTAL CÂBLES"
          value="328"
          detail="24 680 m cumulés"
          tone="blue"
        />
        <Kpi
          label="À TIRER"
          value="146"
          detail="10 420 m restants"
          tone="gold"
        />
        <Kpi label="TIRÉS" value="124" detail="38% du carnet" tone="green" />
        <Kpi
          label="RACCORDÉS"
          value="58"
          detail="18% du carnet"
          tone="purple"
        />
      </div>
      <div className="panel data-panel">
        <div className="filters">
          <input placeholder="⌕  Repère, origine, destination…" />
          <button>État du câble⌄</button>
          <button>Type de câble⌄</button>
          <em>328 résultats</em>
        </div>
        <table>
          <thead>
            <tr>
              <th>REPÈRE</th>
              <th>ORIGINE</th>
              <th>DESTINATION</th>
              <th>TYPE</th>
              <th>LONGUEUR</th>
              <th>ÉTAT</th>
            </tr>
          </thead>
          <tbody>
            {cables.map((c) => (
              <tr key={c[0]}>
                {c.slice(0, 5).map((v, i) => (
                  <td key={v}>
                    <b>{i === 0 ? v : null}</b>
                    {i !== 0 ? v : null}
                  </td>
                ))}
                <td>
                  <span
                    className={`state ${c[5].replace("À ", "").toLowerCase()}`}
                  >
                    ● {c[5]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
