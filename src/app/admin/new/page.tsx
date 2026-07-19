import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isValidSessionCookieValue, sessionCookieName } from "@/lib/admin-auth";

/** Create a clinic + license key (the key is rendered ONCE by the POST route). */
export default async function NewClinicPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const jar = await cookies();
  if (!isValidSessionCookieValue(jar.get(sessionCookieName())?.value)) redirect("/admin/login");
  const { error } = await searchParams;

  const label = { display: "block", fontSize: 13, fontWeight: 700, margin: "14px 0 4px" };
  const input = {
    width: "100%",
    padding: 9,
    border: "1.5px solid #cbd5e1",
    borderRadius: 8,
    boxSizing: "border-box" as const,
  };

  return (
    <main style={{ display: "flex", justifyContent: "center", padding: "60px 16px" }}>
      <form
        method="post"
        action="/api/admin/clinics"
        style={{ background: "#fff", padding: 32, borderRadius: 12, boxShadow: "0 4px 16px rgba(0,0,0,.08)", width: 420 }}
      >
        <h1 style={{ fontSize: 20, marginTop: 0 }}>New clinic</h1>
        {error && <p style={{ color: "#b91c1c", fontSize: 13 }}>Check the fields and try again.</p>}
        <label style={label}>Clinic name</label>
        <input name="name" required minLength={2} style={input} />
        <label style={label}>Contact (phone / email — vendor’s records)</label>
        <input name="contact" style={input} />
        <label style={label}>Plan</label>
        <input name="plan" defaultValue="standard" style={input} />
        <label style={label}>Subscription expires</label>
        <input name="expires_at" type="date" style={input} />
        <button
          type="submit"
          style={{ width: "100%", marginTop: 20, padding: 11, border: 0, borderRadius: 8, background: "#0891b2", color: "#fff", fontWeight: 700, cursor: "pointer" }}
        >
          Create clinic + generate license key
        </button>
        <p style={{ fontSize: 12, color: "#94a3b8" }}>
          The license key is shown once on the next page and stored only as a hash.
        </p>
        <a href="/admin" style={{ fontSize: 13 }}>← Back</a>
      </form>
    </main>
  );
}
