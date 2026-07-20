/** Admin login — one password field, errors via query param (no client JS). */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <form
        method="post"
        action="/api/admin/login"
        style={{
          background: "#fff",
          padding: 32,
          borderRadius: 12,
          boxShadow: "0 4px 16px rgba(0,0,0,.08)",
          width: 340,
        }}
      >
        <h1 style={{ fontSize: 20, marginTop: 0 }}>Deno License Server</h1>
        <p style={{ fontSize: 13, color: "#64748b" }}>Vendor admin — authorized access only.</p>
        {error === "bad" && <p style={{ color: "#b91c1c", fontSize: 13 }}>Wrong password.</p>}
        {error === "rate" && (
          <p style={{ color: "#b91c1c", fontSize: 13 }}>Too many attempts — wait a minute.</p>
        )}
        <input
          type="password"
          name="password"
          placeholder="Admin password"
          autoFocus
          style={{
            width: "100%",
            padding: 10,
            border: "1.5px solid #cbd5e1",
            borderRadius: 8,
            boxSizing: "border-box",
          }}
        />
        <button
          type="submit"
          style={{
            width: "100%",
            marginTop: 12,
            padding: 10,
            border: 0,
            borderRadius: 8,
            background: "#0891b2",
            color: "#fff",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Sign in
        </button>
      </form>
    </main>
  );
}
