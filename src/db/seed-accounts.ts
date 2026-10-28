/** Fictional demo accounts created by `npm run db:seed`. Safe to display on a demo instance. */
export const DEMO_PASSWORD = "Orbit-Demo-2026";

export const DEMO_ACCOUNTS = [
  { email: "admin@northstar.demo", name: "Alex Morgan", role: "tenant_admin" as const, label: "Tenant Admin" },
  { email: "manager@northstar.demo", name: "Priya Raman", role: "facilities_manager" as const, label: "Facilities Manager" },
  { email: "supervisor@northstar.demo", name: "Marcus Bell", role: "supervisor" as const, label: "Supervisor" },
  { email: "tech@northstar.demo", name: "Jordan Lee", role: "technician" as const, label: "Technician" },
  { email: "tech2@northstar.demo", name: "Sam Ortiz", role: "technician" as const, label: "Technician (expired licence)" },
  { email: "contractor@northstar.demo", name: "Dana Fox", role: "contractor_manager" as const, label: "Contractor Manager" },
  { email: "client@northstar.demo", name: "Olivia Chen", role: "client_approver" as const, label: "Client Approver" },
  { email: "auditor@northstar.demo", name: "Ken Ito", role: "auditor" as const, label: "Read-only Auditor" },
  { email: "admin@harbourline.demo", name: "Hana Walsh", role: "tenant_admin" as const, label: "Second tenant admin" },
];
