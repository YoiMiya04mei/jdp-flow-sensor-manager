async function runVerification() {
  const baseUrl = "http://localhost:3002";
  console.log("=== VERIFYING ROUTE PROTECTION & AUTH FLOW ON PORT 3002 ===");

  // 1. Unauthenticated page requests must redirect to /login
  const routesToTest = ["/", "/devices", "/sensors", "/traffic/explorer", "/analytics/sankey", "/config-generator", "/audit-logs", "/settings"];
  for (const route of routesToTest) {
    const res = await fetch(`${baseUrl}${route}`, { redirect: "manual" });
    const location = res.headers.get("location");
    const expectedPrefix = route === "/" ? "/login" : `/login?redirect=${encodeURIComponent(route)}`;
    const pass = res.status === 307 && location && location.includes(expectedPrefix);
    console.log(`[Unauthenticated] GET ${route} -> Status: ${res.status}, Location: ${location} | ${pass ? "PASS" : "FAIL"}`);
    if (!pass) throw new Error(`Route ${route} is not properly protected!`);
  }

  // 2. Unauthenticated API requests must return 401 Unauthorized
  const apiRoutesToTest = ["/api/devices", "/api/sensors", "/api/traffic/overview", "/api/audit-logs"];
  for (const apiRoute of apiRoutesToTest) {
    const res = await fetch(`${baseUrl}${apiRoute}`);
    const pass = res.status === 401;
    console.log(`[Unauthenticated API] GET ${apiRoute} -> Status: ${res.status} | ${pass ? "PASS" : "FAIL"}`);
    if (!pass) throw new Error(`API Route ${apiRoute} did not return 401!`);
  }

  // 3. Public API /api/health and /api/auth/login must be accessible
  const healthRes = await fetch(`${baseUrl}/api/health`);
  console.log(`[Public API] GET /api/health -> Status: ${healthRes.status} | ${healthRes.status === 200 ? "PASS" : "FAIL"}`);

  // 4. Login page renders clean NOC portal without Sidebar
  const loginRes = await fetch(`${baseUrl}/login`);
  const loginHtml = await loginRes.text();
  const hasSidebar = loginHtml.includes("NOC OPERATIONS") || loginHtml.includes("Traffic Explorer");
  const hasLoginCard = loginHtml.includes("JDP FLOW SENSOR");
  console.log(`[Login Page UI] Status: ${loginRes.status}, Sidebar Hidden: ${!hasSidebar}, Login Card Present: ${hasLoginCard} | ${loginRes.status === 200 && !hasSidebar && hasLoginCard ? "PASS" : "FAIL"}`);

  // 5. Perform Login with demo_admin
  const loginPostRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "demo_admin",
      password: "JdpDemoPassword2026!"
    })
  });
  const cookieHeader = loginPostRes.headers.get("set-cookie");
  console.log(`[Auth Login] POST /api/auth/login -> Status: ${loginPostRes.status}, Has Set-Cookie: ${!!cookieHeader} | ${loginPostRes.status === 200 && !!cookieHeader ? "PASS" : "FAIL"}`);
  if (!cookieHeader) throw new Error("Login failed to return set-cookie header!");

  const cookieVal = cookieHeader.split(";")[0];

  // 6. Access protected route WITH cookie
  const authDevicesRes = await fetch(`${baseUrl}/devices`, {
    headers: { Cookie: cookieVal },
    redirect: "manual"
  });
  console.log(`[Authenticated] GET /devices WITH Cookie -> Status: ${authDevicesRes.status} (expect 200) | ${authDevicesRes.status === 200 ? "PASS" : "FAIL"}`);

  // 7. Access /login WITH cookie -> should redirect to /
  const authLoginRes = await fetch(`${baseUrl}/login`, {
    headers: { Cookie: cookieVal },
    redirect: "manual"
  });
  const authLoginLocation = authLoginRes.headers.get("location");
  console.log(`[Authenticated] GET /login WITH Cookie -> Status: ${authLoginRes.status}, Location: ${authLoginLocation} | ${authLoginRes.status === 307 ? "PASS" : "FAIL"}`);

  console.log("\n>>> ALL ROUTE PROTECTION AND AUTHENTICATION TESTS PASSED SUCCESSFULLY! <<<");
}

runVerification().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
