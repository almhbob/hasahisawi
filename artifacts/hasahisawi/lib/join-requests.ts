import { fetchWithTimeout, getApiUrl } from "@/lib/query-client";

type JoinRequestPayload = {
  request_type: string;
  applicant_name: string;
  entity_name?: string;
  phone: string;
  email?: string;
  [key: string]: unknown;
};

export async function submitJoinRequest(payload: JoinRequestPayload, path = "/api/join-requests") {
  const apiUrl = getApiUrl();
  const clean = {
    ...payload,
    applicant_name: String(payload.applicant_name || "").trim(),
    phone: String(payload.phone || "").replace(/[^0-9+]/g, "").trim(),
    entity_name: payload.entity_name ? String(payload.entity_name).trim() : undefined,
  };
  if (!clean.applicant_name || !clean.phone) {
    throw new Error("الاسم ورقم الهاتف مطلوبان");
  }
  const res = await fetchWithTimeout(`${apiUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(clean),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || "تعذر إرسال طلب الانضمام");
  return json;
}
