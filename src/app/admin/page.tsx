import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isValidSessionCookieValue, sessionCookieName } from "@/lib/admin-auth";
import { listClinics } from "@/lib/clinics";

export const dynamic = "force-dynamic";

function fmt(d: Date | null): string {
  return d ? new Date(d).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "—";
}

/** Clinic list: status, plan, expiry, fingerprint bound?, last-seen heartbeat. */
export default async function AdminPage() {
  const jar = await cookies();
  if (!isValidSessionCookieValue(jar.get(sessionCookieName())?.value)) redirect("/admin/login");

  const clinics = await listClinics();
  const th = { textAlign: "left" as const, padding: "8px 10px", fontSize: 12, color: "#64748b" };
  const td = { padding: "8px 10px", fontSize: 14, borderTop: "1px solid #e2e8f0" };

  return (
    <main style={{ maxWidth: 1080, margin: "40px auto", padding: "0 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 22 }}>Licensed clinics</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <a
            href="/admin/new"
            style={{
              background: "#0891b2",
              color: "#fff",
              padding: "9px 14px",
              borderRadius: 8,
              textDecoration: "none",
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            + New clinic
          </a>
          <form method="post" action="/api/admin/logout">
            <button style={{ padding: "9px 14px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer" }}>
              Sign out
            </button>
          </form>
        </div>
      </div>

      <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,.06)", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Clinic</th>
              <th style={th}>Contact</th>
              <th style={th}>Plan</th>
              <th style={th}>Status</th>
              <th style={th}>Expires</th>
              <th style={th}>Install bound</th>
              <th style={th}>Last heartbeat</th>
              <th style={th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {clinics.length === 0 && (
              <tr>
                <td style={{ ...td, color: "#64748b" }} colSpan={8}>
                  No clinics yet — create the first one.
                </td>
              </tr>
            )}
            {clinics.map((c) => (
              <tr key={c.id}>
                <td style={td}>{c.name}</td>
                <td style={td}>{c.contact || "—"}</td>
                <td style={td}>
                  <form method="post" action={`/api/admin/clinics/${c.id}`} style={{ display: "flex", gap: 6 }}>
                    <input type="hidden" name="action" value="update" />
                    <input name="plan" defaultValue={c.plan} size={8} style={{ padding: 4, border: "1px solid #cbd5e1", borderRadius: 6 }} />
                    <input
                      name="expires_at"
                      type="date"
                      defaultValue={c.expires_at ? new Date(c.expires_at).toISOString().slice(0, 10) : ""}
                      style={{ padding: 4, border: "1px solid #cbd5e1", borderRadius: 6 }}
                    />
                    <button style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #cbd5e1", background: "#f8fafc", cursor: "pointer" }}>
                      Save
                    </button>
                  </form>
                </td>
                <td style={{ ...td, fontWeight: 700, color: c.status === "ACTIVE" ? "#059669" : "#b91c1c" }}>
                  {c.status}
                </td>
                <td style={td}>{c.expires_at ? new Date(c.expires_at).toISOString().slice(0, 10) : "—"}</td>
                <td style={td}>{c.fingerprint ? `yes (${c.fingerprint.slice(0, 8)}…)` : "no"}</td>
                <td style={td}>{fmt(c.last_seen_at)}</td>
                <td style={td}>
                  <form method="post" action={`/api/admin/clinics/${c.id}`}>
                    <input type="hidden" name="action" value={c.status === "ACTIVE" ? "suspend" : "reactivate"} />
                    <button
                      style={{
                        padding: "5px 10px",
                        borderRadius: 6,
                        border: 0,
                        cursor: "pointer",
                        fontWeight: 700,
                        background: c.status === "ACTIVE" ? "#fee2e2" : "#d1fae5",
                        color: c.status === "ACTIVE" ? "#b91c1c" : "#059669",
                      }}
                    >
                      {c.status === "ACTIVE" ? "Suspend" : "Reactivate"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 14 }}>
        This service stores licensing data only — it never sees patient or clinic-operational data
        (docs/11 §8).
      </p>
    </main>
  );
}
