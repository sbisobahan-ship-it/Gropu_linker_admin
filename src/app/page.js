"use client";

import Image from "next/image";
import { startTransition, useCallback, useEffect, useMemo, useState } from "react";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://buildbdapp.shop/walinker_config/api/v1";
const CLIENT_API_PROXY_BASE = "/api/admin-proxy";
const SCRAPER_API = "/api/scrape-whatsapp";
const TOKEN_KEY = "group_linker_admin_token";
const LOGIN_ID_KEY = "group_linker_admin_login_id";
const PENDING_GROUPS_KEY = "group_linker_pending_groups";

const ENDPOINTS = {
  adminLogin: "/admin/auth/login.php",
  adminVerifyOtp: "/admin/auth/verify_otp.php",
  adminDeviceRegister: "/admin/device/register.php",
  dashboardStats: "/admin/dashboard/stats.php",
  analyticsOverview: "/admin/analytics/overview.php",
  analyticsDateRange: "/admin/analytics/date_range.php",
  usersList: "/admin/users/list.php",
  userPosts: "/admin/users/posts.php",
  usersDelete: "/admin/users/delete",
  postsList: "/admin/posts/list.php",
  postsPending: "/admin/posts/pending.php",
  postsReported: "/admin/posts/reported.php",
  postsAdd: "/admin/posts/add.php",
  postsApprove: "/admin/posts/approve.php",
  postsReject: "/admin/posts/reject.php",
  postsDelete: "/admin/posts/delete.php",
  postsTrending: "/admin/posts/set_trending.php",
  postsBoss: "/admin/posts/boss.php",
  systemSettings: "/system/settings.php",
  toggleAds: "/admin/settings/toggle_ads.php",
  settingsUpdate: "/admin/settings/update.php",
  categoriesList: "/categories/list.php",
  categoryAdd: "/admin/categories/add.php",
  categoryEdit: "/admin/categories/edit.php",
  categoryDelete: "/admin/categories/delete.php",
  countriesList: "/countries/list.php",
  countryAdd: "/admin/countries/add.php",
  countryEdit: "/admin/countries/edit.php",
  countryDelete: "/admin/countries/delete.php",
  smsList: "/admin/sms/list.php",
  smsSend: "/admin/sms/send",
  smsEdit: "/admin/sms/edit.php",
  notificationsSend: "/admin/notifications/send.php",
  rewardsBulkUpdate: "/admin/rewards/update_bulk.php",
};

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", index: "01" },
  { id: "users", label: "Users", index: "02" },
  { id: "posts", label: "Posts", index: "03" },
  { id: "pending-groups", label: "Bulk Automation", index: "04" },
  { id: "categories", label: "Categories", index: "05" },
  { id: "countries", label: "Countries", index: "06" },
  { id: "settings", label: "Settings", index: "07" },
  { id: "sms", label: "SMS", index: "08" },
  { id: "notifications", label: "Notifications", index: "09" },
  { id: "rewards", label: "Rewards", index: "10" },
];

const initialCollections = {
  stats: null,
  overview: null,
  users: [],
  userPosts: [],
  posts: [],
  pendingPosts: [],
  reportedPosts: [],
  activeGroups: [],
  categories: [],
  countries: [],
  settings: null,
  sms: [],
  rewards: [],
  pendingGroups: [],
  dateRangeAnalytics: null,
};

const initialForms = {
  login: { email: "", password: "" },
  otp: { email: "", otp: "" },
  category: { id: "", name: "", image_link: "", status: "active" },
  country: { id: "", name: "", code: "", status: "active" },
  notification: { target: "all", target_value: "", title: "", body: "" },
  sms: { id: "", app_id: "", text: "", status: "active" },
  reward: { amount: "", bulk_data: "" },
  analyticsRange: { start_date: "", end_date: "" },
  adminDevice: { fcm_token: "" },
  trending: { id: "", position: "1", duration_value: "24", duration_unit: "hours" },
  bulkAutomation: {
    default_category_id: "",
    default_country_id: "",
    group_links: "",
  },
};

const initialBulkValidation = {
  running: false,
  page: 1,
  checked: 0,
  inactiveFound: 0,
};

const initialPagination = {
  page: 1,
  limit: 20,
  totalPages: 1,
  totalUsers: 0,
  filteredTotalUsers: 0,
};

function normalizeList(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  const listKey = Object.keys(payload).find((key) => Array.isArray(payload[key]));
  return listKey ? payload[listKey] : [];
}

function normalizeObject(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  return payload;
}

function buildEndpointWithQuery(endpoint, params) {
  const searchParams = new URLSearchParams();

  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    searchParams.set(key, String(value));
  });

  const query = searchParams.toString();
  return query ? `${endpoint}?${query}` : endpoint;
}

function getErrorMessage(error) {
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

function createDebugInfo({ endpoint, method, status, requestBody, responseText, parseError, cause }) {
  return {
    endpoint: `${CLIENT_API_PROXY_BASE}?path=${encodeURIComponent(endpoint)}`,
    upstreamEndpoint: `${API_BASE_URL}${endpoint}`,
    method,
    status: status ?? "network-error",
    requestBody: requestBody ?? null,
    responseText: responseText ? responseText.slice(0, 1200) : "",
    parseError: parseError || "",
    cause: cause || "",
    time: new Date().toLocaleString(),
  };
}

function looksLikeSuccess(message) {
  const value = message.toLowerCase();
  return ["success", "updated", "sent", "approved", "deleted", "saved"].some((item) =>
    value.includes(item)
  );
}

function toDisplayValue(value) {
  if (value === null || value === undefined || value === "") return "--";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function toCountValue(...values) {
  const value = values.find((item) => item !== null && item !== undefined && item !== "");
  if (value === null || value === undefined || value === "") return "0";

  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) return String(value);
  return String(numericValue);
}

function parseBulkGroupLinks(rawValue) {
  return String(rawValue ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const parts = line.split("|").map((part) => part.trim());
      const [groupLink = "", categoryId = "", countryId = ""] = parts;
      return {
        index: index + 1,
        group_link: groupLink,
        category_id: categoryId,
        country_id: countryId,
      };
    })
    .filter((item) => item.group_link);
}

function renderGroupImageCell(row, className = "h-14 w-14 rounded-2xl object-cover ring-1 ring-slate-200") {
  return row.group_image ? (
    <Image
      alt={row.group_name || "WhatsApp Group"}
      className={className}
      height={56}
      src={row.group_image}
      unoptimized
      width={56}
    />
  ) : (
    <div className="image-fallback">No Image</div>
  );
}

function getItemId(row, fallback) {
  return (
    row.id ??
    row.post_id ??
    row.app_id ??
    row.user_id ??
    row.group_link ??
    row.group_name ??
    fallback
  );
}

function readPendingGroups() {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(PENDING_GROUPS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistPendingGroups(groups) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PENDING_GROUPS_KEY, JSON.stringify(groups));
}

function parseJwtExpiry(token) {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded =
      typeof window !== "undefined" ? window.atob(normalized) : Buffer.from(normalized, "base64").toString();
    const parsed = JSON.parse(decoded);
    return typeof parsed.exp === "number" ? parsed.exp * 1000 : null;
  } catch {
    return null;
  }
}

async function apiRequest(endpoint, { method = "GET", token, body } = {}) {
  const headers = { Accept: "application/json" };

  if (body) headers["Content-Type"] = "application/json";
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
    headers["X-Admin-Token"] = token;
    headers["Token"] = token;
    headers["X-API-KEY"] = token;
    
    const savedEmail = typeof window !== "undefined" ? window.localStorage.getItem("group_linker_admin_login_id") : null;
    if (savedEmail) {
      headers["X-Admin-Email"] = savedEmail;
    }
  }

  console.log(`[API Request] ${method} ${endpoint}`, { hasToken: !!token });

  let response;

  try {
    response = await fetch(`${CLIENT_API_PROXY_BASE}?path=${encodeURIComponent(endpoint)}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      credentials: "omit", // Using headers for proxy
    });
  } catch (networkError) {
    const error = new Error("Network request failed. Check API URL or backend availability.");
    error.debugInfo = createDebugInfo({
      endpoint,
      method,
      requestBody: body,
      cause: networkError instanceof Error ? networkError.message : String(networkError),
    });
    throw error;
  }

  const responseText = await response.text();
  let json = null;
  let parseError = "";

  if (responseText) {
    try {
      json = JSON.parse(responseText);
    } catch (error) {
      parseError = error instanceof Error ? error.message : "JSON parse failed";
    }
  }

  const unauthorized =
    response.status === 401 || json?.message?.toLowerCase?.().includes("unauthorized");

  if (!response.ok || json?.status === "error") {
    const htmlMessage =
      responseText && responseText.startsWith("<!DOCTYPE")
        ? `HTTP ${response.status}: server returned HTML instead of JSON.`
        : "";
    const plainText = responseText && !json ? responseText.slice(0, 180).trim() : "";
    const error = new Error(
      json?.message || htmlMessage || plainText || `HTTP ${response.status}: Request failed.`
    );
    error.unauthorized = unauthorized;
    error.debugInfo = createDebugInfo({
      endpoint,
      method,
      status: response.status,
      requestBody: body,
      responseText,
      parseError,
    });
    throw error;
  }

  return json?.data ?? json;
}

async function scrapeWhatsappGroup(groupLink, options = {}) {
  const response = await fetch(SCRAPER_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      groupLink,
      strictClassesOnly: Boolean(options.strictClassesOnly),
    }),
  });

  const payload = await response.json();

  if (!response.ok || payload?.status === "error") {
    throw new Error(payload?.message || "Unable to scrape WhatsApp group.");
  }

  return payload.data;
}

function StatCard({ title, value, note }) {
  return (
    <article className="panel-card">
      <p className="text-sm text-[var(--muted)]">{title}</p>
      <h3 className="mt-3 text-3xl font-semibold text-[var(--ink)]">{value ?? "--"}</h3>
      <p className="mt-2 text-xs text-[var(--muted)]">{note}</p>
    </article>
  );
}

function SectionHeader({ title, description, action }) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <h2 className="text-2xl font-semibold text-[var(--ink)]">{title}</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>
      </div>
      {action}
    </div>
  );
}

function TableCard({ title, rows, columns, emptyText = "No data found.", actions, onScrollBottom, loadingMore }) {
  const handleScroll = (e) => {
    if (!onScrollBottom) return;
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    if (scrollHeight - scrollTop <= clientHeight + 5) {
      onScrollBottom();
    }
  };

  return (
    <section className="panel-card flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 px-1">
        <h3 className="text-lg font-semibold text-[var(--ink)]">{title}</h3>
        {actions}
      </div>
      <div className="relative overflow-hidden rounded-2xl border border-[var(--line)]/60">
        <div className="max-h-[550px] overflow-auto" onScroll={handleScroll}>
          <table className="w-full min-w-[720px] text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur-md">
              <tr className="border-b border-[var(--line)] text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                {columns.map((column) => (
                  <th key={column.key} className="px-4 py-4 font-medium">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((row, index) => (
                  <tr
                    key={getItemId(row, index)}
                    className="group border-b border-[var(--line)]/50 last:border-0 align-top transition-colors hover:bg-slate-50/50"
                  >
                    {columns.map((column) => (
                      <td key={column.key} className="px-4 py-5 text-sm text-[var(--body)]">
                        {column.render ? column.render(row) : toDisplayValue(row[column.key])}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-4 py-16 text-center text-sm text-[var(--muted)]"
                  >
                    {emptyText}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {loadingMore && (
            <div className="py-4 text-center text-sm text-[var(--muted)]">Loading more...</div>
          )}
        </div>
      </div>
    </section>
  );
}

function PaginationControls({ page, totalPages, onPrevious, onNext, disabled }) {
  return (
    <div className="flex flex-col gap-3 border-t border-[var(--line)] pt-4 text-sm text-[var(--muted)] md:flex-row md:items-center md:justify-between">
      <p>
        Page {page} of {totalPages}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          className="ghost-button"
          disabled={disabled || page <= 1}
          onClick={onPrevious}
          type="button"
        >
          Previous
        </button>
        <button
          className="secondary-button"
          disabled={disabled || page >= totalPages}
          onClick={onNext}
          type="button"
        >
          Next
        </button>
      </div>
    </div>
  );
}

function Modal({ open, title, onClose, children }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-10 backdrop-blur-sm">
      <div className="w-full max-w-4xl rounded-[28px] border border-white/60 bg-white p-6 shadow-[0_30px_90px_rgba(15,23,42,0.2)]">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h3 className="text-xl font-semibold text-[var(--ink)]">{title}</h3>
          <button className="ghost-button" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function PendingGroupApprovalPreview({ group, onApprove, onCancel, busy }) {
  return (
    <div className="space-y-6 text-center">
      <div className="flex flex-col items-center gap-4">
        {group.group_image ? (
          <Image
            alt={group.group_name || "WhatsApp Group"}
            className="h-24 w-24 rounded-full object-cover ring-2 ring-sky-100"
            height={96}
            src={group.group_image}
            unoptimized
            width={96}
          />
        ) : (
          <div className="image-fallback h-24 w-24 rounded-full">No Image</div>
        )}
        <div className="space-y-2">
          <p className="break-all text-xs text-[var(--muted)]">{group.group_image}</p>
          <p className="text-lg font-semibold text-[var(--ink)]">{group.group_name}</p>
          <p className="text-sm text-[var(--muted)]">{group.group_type}</p>
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <button className="primary-button" disabled={busy} onClick={onApprove} type="button">
          {busy ? "Approving..." : "Approve"}
        </button>
        <button className="ghost-button" disabled={busy} onClick={onCancel} type="button">
          Cancel
        </button>
      </div>
    </div>
  );
}

function BulkAutomationLogTable({ title, rows, emptyText }) {
  return (
    <TableCard
      title={title}
      rows={rows}
      emptyText={emptyText}
      columns={[
        { key: "index", label: "#" },
        { key: "group_link", label: "Group Link" },
        { key: "group_name", label: "Group Name" },
        { key: "category_id", label: "Category ID" },
        { key: "country_id", label: "Country ID" },
        {
          key: "status",
          label: "Status",
          render: (row) => <span className={`status-pill status-${row.status}`}>{row.status}</span>,
        },
        { key: "message", label: "Message" },
      ]}
    />
  );
}

function TerminalConsole({ logs, title = "Validation Console" }) {
  const scrollRef = useCallback((node) => {
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, []);

  return (
    <div className="flex flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/50 px-5 py-3">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="h-3 w-3 rounded-full bg-rose-500" />
            <div className="h-3 w-3 rounded-full bg-amber-500" />
            <div className="h-3 w-3 rounded-full bg-emerald-500" />
          </div>
          <span className="ml-3 text-xs font-medium uppercase tracking-widest text-slate-400">
            {title}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-slate-500">UT-8</span>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="h-80 overflow-y-auto p-5 font-mono text-sm leading-relaxed text-slate-300"
      >
        {logs.length === 0 ? (
          <div className="text-slate-600 italic">Waiting for logs...</div>
        ) : (
          logs.map((log, index) => (
            <div key={index} className="mb-1 flex gap-3">
              <span className="shrink-0 text-slate-600">[{new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}]</span>
              <span className={
                log.includes("Success") || log.includes("Valid") ? "text-emerald-400" :
                log.includes("Error") || log.includes("Inactive") ? "text-rose-400" :
                log.includes("Checking") ? "text-sky-400" : "text-slate-300"
              }>
                {log}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function TrendingGroupForm({ form, group, busy, onChange, onSubmit, onCancel }) {
  return (
    <form className="space-y-5" onSubmit={onSubmit}>
      <div className="rounded-3xl border border-[var(--line)] bg-slate-50 p-4">
        <p className="text-xs uppercase tracking-[0.25em] text-[var(--muted)]">Selected Group</p>
        <p className="mt-2 text-lg font-semibold text-[var(--ink)]">
          {toDisplayValue(group.group_name ?? group.title)}
        </p>
        <p className="mt-1 text-sm text-[var(--muted)]">ID: {toDisplayValue(group.id ?? group.post_id)}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="field">
          <span>Trending Position</span>
          <input
            className="input"
            min="1"
            name="position"
            onChange={onChange}
            required
            type="number"
            value={form.position}
          />
        </label>
        <label className="field">
          <span>Time Value</span>
          <input
            className="input"
            min="1"
            name="duration_value"
            onChange={onChange}
            required
            type="number"
            value={form.duration_value}
          />
        </label>
      </div>

      <label className="field">
        <span>Time Unit</span>
        <select className="input" name="duration_unit" onChange={onChange} value={form.duration_unit}>
          <option value="minutes">Minutes</option>
          <option value="hours">Hours</option>
        </select>
      </label>

      <div className="flex flex-wrap justify-end gap-3">
        <button className="ghost-button" disabled={busy} onClick={onCancel} type="button">
          Cancel
        </button>
        <button className="primary-button" disabled={busy} type="submit">
          {busy ? "Saving..." : "Set Trending"}
        </button>
      </div>
    </form>
  );
}

function LoginView({ loginForm, otpForm, phase, busy, message, onChange, onLogin, onVerify }) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.22),_transparent_24%),linear-gradient(135deg,_#0f172a_0%,_#111827_48%,_#164e63_100%)] px-4 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl flex-col overflow-hidden rounded-[32px] border border-white/10 bg-white/10 shadow-[0_20px_70px_rgba(8,15,29,0.35)] backdrop-blur-xl lg:grid lg:grid-cols-[1.15fr_0.85fr]">
        <div className="flex flex-col justify-between p-8 text-white md:p-12">
          <div>
            <p className="text-sm uppercase tracking-[0.4em] text-cyan-100/80">Group Linker</p>
            <h1 className="mt-6 max-w-xl text-4xl font-semibold leading-tight md:text-6xl">
              Admin control with one focused workspace.
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-7 text-slate-200">
              Dashboard stats, moderation, approvals, notifications, rewards, and WhatsApp
              submission review from one responsive admin panel.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {["OTP secured login", "Live API actions", "Pending group workflow"].map((item) => (
              <div
                key={item}
                className="rounded-3xl border border-white/10 bg-white/8 p-4 text-sm text-slate-100"
              >
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[linear-gradient(180deg,_rgba(255,255,255,0.96),_rgba(239,246,255,0.92))] p-6 md:p-10">
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.12)] md:p-8">
            <p className="text-sm uppercase tracking-[0.35em] text-sky-700">
              {phase === "login" ? "Admin Login" : "OTP Verification"}
            </p>
            <h2 className="mt-4 text-3xl font-semibold text-[var(--ink)]">
              {phase === "login" ? "Sign in to continue" : "Verify your secure access"}
            </h2>
            <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
              {phase === "login"
                ? "Use admin email and password. The API sends an OTP before dashboard access."
                : "Enter the OTP received by the admin account to finish authentication."}
            </p>

            {message ? (
              <div className={`mt-6 ${looksLikeSuccess(message) ? "alert-success" : "alert-error"}`}>
                {message}
              </div>
            ) : null}

            {phase === "login" ? (
              <form className="mt-8 space-y-4" onSubmit={onLogin}>
                <label className="field">
                  <span>Email</span>
                  <input
                    className="input"
                    name="email"
                    type="email"
                    value={loginForm.email}
                    onChange={onChange}
                    placeholder="admin@example.com"
                    required
                  />
                </label>
                <label className="field">
                  <span>Password</span>
                  <input
                    className="input"
                    name="password"
                    type="password"
                    value={loginForm.password}
                    onChange={onChange}
                    placeholder="Enter password"
                    required
                  />
                </label>
                <button className="primary-button w-full" disabled={busy} type="submit">
                  {busy ? "Sending OTP..." : "Continue with OTP"}
                </button>
              </form>
            ) : (
              <form className="mt-8 space-y-4" onSubmit={onVerify}>
                <label className="field">
                  <span>OTP Code</span>
                  <input
                    className="input"
                    name="otp"
                    value={otpForm.otp}
                    onChange={onChange}
                    placeholder="6 digit OTP"
                    required
                  />
                </label>
                <label className="field">
                  <span>Admin Email</span>
                  <input className="input bg-slate-100" value={otpForm.email} readOnly />
                </label>
                <button className="primary-button w-full" disabled={busy} type="submit">
                  {busy ? "Verifying..." : "Verify & Enter Dashboard"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}

export default function Home() {
  const [activeSection, setActiveSection] = useState("dashboard");
  const [token, setToken] = useState("");
  const [authPhase, setAuthPhase] = useState("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [debugInfo, setDebugInfo] = useState(null);
  const [collections, setCollections] = useState(initialCollections);
  const [usersPagination, setUsersPagination] = useState(initialPagination);
  const [activeGroupsPagination, setActiveGroupsPagination] = useState({ page: 1, limit: 20, totalPages: 1, loadingMore: false });
  const [modalState, setModalState] = useState({
    open: false,
    title: "",
    content: null,
    approvalGroup: null,
  });
  const [loginForm, setLoginForm] = useState(initialForms.login);
  const [otpForm, setOtpForm] = useState(initialForms.otp);
  const [settingsDraft, setSettingsDraft] = useState({});
  const [categoryDraft, setCategoryDraft] = useState(initialForms.category);
  const [countryDraft, setCountryDraft] = useState(initialForms.country);
  const [notificationForm, setNotificationForm] = useState(initialForms.notification);
  const [smsForm, setSmsForm] = useState(initialForms.sms);
  const [rewardForm, setRewardForm] = useState(initialForms.reward);
  const [analyticsRangeForm, setAnalyticsRangeForm] = useState(initialForms.analyticsRange);
  const [adminDeviceForm, setAdminDeviceForm] = useState(initialForms.adminDevice);
  const [trendingForm, setTrendingForm] = useState(initialForms.trending);
  const [bulkAutomationForm, setBulkAutomationForm] = useState(initialForms.bulkAutomation);
  const [bulkPostingLogs, setBulkPostingLogs] = useState([]);
  const [inactiveGroups, setInactiveGroups] = useState([]);
  const [bulkValidation, setBulkValidation] = useState(initialBulkValidation);
  const [validationLogs, setValidationLogs] = useState([]);

  const dashboardStats = useMemo(() => {
    const stats = normalizeObject(collections.stats);
    const overview = normalizeObject(collections.overview);

    return [
      {
        title: "Total Users",
        value: stats.total_users ?? overview.total_users,
        note: "Registered users in the system",
      },
      {
        title: "Total Posts",
        value: stats.total_posts ?? overview.total_posts,
        note: "Published and stored posts",
      },
      {
        title: "Total Clicks",
        value: stats.total_clicks ?? overview.total_clicks,
        note: "Interaction count from analytics",
      },
      {
        title: "Total Views",
        value: stats.total_views ?? overview.total_views,
        note: "Content view volume across app",
      },
      {
        title: "Total Reports",
        value: stats.total_reports ?? overview.total_reports,
        note: "Reported content awaiting review",
      },
    ];
  }, [collections.overview, collections.stats]);

  const guardedRequest = useCallback(
    async (endpoint, options) => {
      try {
        return await apiRequest(endpoint, { ...options, token });
      } catch (requestError) {
        // Removed auto-logout to prevent unexpected redirection
        throw requestError;
      }
    },
    [token]
  );

  const updateCollection = useCallback((key, value) => {
    setCollections((current) => ({ ...current, [key]: value }));
  }, []);

  const syncPendingGroups = useCallback((updater) => {
    setCollections((current) => {
      const nextPendingGroups =
        typeof updater === "function" ? updater(current.pendingGroups) : updater;
      persistPendingGroups(nextPendingGroups);
      return { ...current, pendingGroups: nextPendingGroups };
    });
  }, []);

  const loadUsersPage = useCallback(
    async (page = 1) => {
      const response = await guardedRequest(
        buildEndpointWithQuery(ENDPOINTS.usersList, {
          page,
          limit: usersPagination.limit,
        })
      );
      const normalized = normalizeObject(response);

      setCollections((current) => ({
        ...current,
        users: normalizeList(normalized),
      }));
      setUsersPagination((current) => ({
        ...current,
        page: Number(normalized.page) || page,
        limit: Number(normalized.limit) || current.limit,
        totalPages: Math.max(Number(normalized.total_pages) || 1, 1),
        totalUsers: Number(normalized.total_users) || 0,
        filteredTotalUsers:
          Number(normalized.filtered_total_users) || Number(normalized.total_users) || 0,
      }));

      return response;
    },
    [guardedRequest, usersPagination.limit]
  );

  const loadCoreData = useCallback(async () => {
    setBusy(true);
    setMessage("");
    setDebugInfo(null);

    try {
      const [
        stats,
        overview,
        _usersResponse,
        posts,
        pendingPosts,
        reportedPosts,
        activeGroups,
        settings,
        sms,
        categories,
        countries,
      ] = await Promise.all([
        guardedRequest(ENDPOINTS.dashboardStats),
        guardedRequest(ENDPOINTS.analyticsOverview),
        loadUsersPage(1),
        guardedRequest(ENDPOINTS.postsList),
        guardedRequest(ENDPOINTS.postsPending),
        guardedRequest(ENDPOINTS.postsReported),
        guardedRequest(buildEndpointWithQuery(ENDPOINTS.postsBoss, { page: 1, limit: 20 })),
        guardedRequest(ENDPOINTS.systemSettings),
        guardedRequest(ENDPOINTS.smsList),
        guardedRequest(ENDPOINTS.categoriesList),
        guardedRequest(ENDPOINTS.countriesList),
      ]);

      setCollections((current) => ({
        ...current,
        stats,
        overview,
        userPosts: [],
        posts: normalizeList(posts),
        pendingPosts: normalizeList(pendingPosts),
        reportedPosts: normalizeList(reportedPosts),
        activeGroups: normalizeList(normalizeObject(activeGroups)),
        categories: normalizeList(categories),
        countries: normalizeList(countries),
        settings: normalizeObject(settings),
        sms: normalizeList(sms),
        rewards: settings ? [normalizeObject(settings)] : [],
      }));
      setSettingsDraft(normalizeObject(settings));
      
      const normalizedActiveGroupsObj = normalizeObject(activeGroups);
      setActiveGroupsPagination((current) => ({
        ...current,
        page: 1,
        totalPages: Math.max(Number(normalizedActiveGroupsObj.total_pages) || 1, 1),
      }));
    } catch (loadError) {
      setMessage(getErrorMessage(loadError));
      setDebugInfo(loadError?.debugInfo ?? null);
    } finally {
      setBusy(false);
    }
  }, [guardedRequest, loadUsersPage]);

  const loadMoreActiveGroups = useCallback(async () => {
    if (activeGroupsPagination.loadingMore) return;
    if (activeGroupsPagination.page >= activeGroupsPagination.totalPages) return;
    
    setActiveGroupsPagination((curr) => ({ ...curr, loadingMore: true }));
    try {
      const nextPage = activeGroupsPagination.page + 1;
      const response = await guardedRequest(
        buildEndpointWithQuery(ENDPOINTS.postsBoss, {
          page: nextPage,
          limit: activeGroupsPagination.limit,
        })
      );
      const normalizedObj = normalizeObject(response);
      const newItems = normalizeList(normalizedObj);
      
      setCollections((curr) => ({
        ...curr,
        activeGroups: [...curr.activeGroups, ...newItems],
      }));
      
      setActiveGroupsPagination((curr) => ({
        ...curr,
        page: nextPage,
        totalPages: Math.max(Number(normalizedObj.total_pages) || 1, 1),
      }));
    } catch (err) {
      console.error("Failed to load more active groups", err);
    } finally {
      setActiveGroupsPagination((curr) => ({ ...curr, loadingMore: false }));
    }
  }, [activeGroupsPagination, guardedRequest]);

  useEffect(() => {
    const restoreAuth = () => {
      const savedToken = window.localStorage.getItem(TOKEN_KEY) ?? "";
      const savedLoginId = window.localStorage.getItem(LOGIN_ID_KEY) ?? "";
      const pendingGroups = readPendingGroups();
      const expiry = savedToken ? parseJwtExpiry(savedToken) : null;
      const isExpired = expiry ? Date.now() >= expiry : false;

      if (isExpired) {
        window.localStorage.removeItem(TOKEN_KEY);
      }

      startTransition(() => {
        setCollections((current) => ({ ...current, pendingGroups }));
        setToken(isExpired ? "" : savedToken);
        setOtpForm((current) => ({ ...current, email: savedLoginId }));
        setAuthPhase(isExpired ? "login" : savedToken ? "ready" : savedLoginId ? "otp" : "login");
        if (isExpired) {
          setMessage("Stored token expired. Please login again.");
        }
      });
    };

    Promise.resolve().then(restoreAuth);
  }, []);

  useEffect(() => {
    if (!token) return;
    Promise.resolve().then(loadCoreData);
  }, [loadCoreData, token]);

  useEffect(() => {
    if (!token) return undefined;

    const expiry = parseJwtExpiry(token);
    if (!expiry) return undefined;

    const timeoutMs = Math.max(expiry - Date.now(), 0);
    const timer = window.setTimeout(() => {
      logout("Token expired. Please login again.");
    }, timeoutMs);

    return () => window.clearTimeout(timer);
  }, [token]);

  function logout(nextMessage = "Logged out successfully.") {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(LOGIN_ID_KEY);
    setToken("");
    setAuthPhase("login");
    setCollections((current) => ({ ...initialCollections, pendingGroups: current.pendingGroups }));
    setUsersPagination(initialPagination);
    setMessage(nextMessage);
    setDebugInfo(null);
  }

  function handleLoginInputChange(event) {
    const { name, value } = event.target;
    setLoginForm((current) => ({ ...current, [name]: value }));
    if (name === "email") {
      setOtpForm((current) => ({ ...current, email: value }));
    }
  }

  function handleOtpInputChange(event) {
    const { name, value } = event.target;
    setOtpForm((current) => ({ ...current, [name]: value }));
  }

  async function handleLogin(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setDebugInfo(null);

    try {
      const response = await apiRequest(ENDPOINTS.adminLogin, {
        method: "POST",
        body: loginForm,
      });

      const loginId = response?.email ?? loginForm.email;
      window.localStorage.setItem(LOGIN_ID_KEY, loginId);
      setOtpForm({ email: loginId, otp: "" });
      setAuthPhase("otp");
      setMessage("OTP sent successfully. Please verify to continue.");
    } catch (loginError) {
      setMessage(getErrorMessage(loginError));
      setDebugInfo(loginError?.debugInfo ?? null);
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setDebugInfo(null);

    try {
      const response = await apiRequest(ENDPOINTS.adminVerifyOtp, {
        method: "POST",
        body: otpForm,
      });

      const nextToken = response?.token ?? response?.access_token ?? response?.admin_token ?? "";

      if (!nextToken) {
        throw new Error("Token not found in OTP response.");
      }

      window.localStorage.setItem(TOKEN_KEY, nextToken);
      window.localStorage.removeItem(LOGIN_ID_KEY);
      
      // Also set in cookies as fallback
      if (typeof document !== "undefined") {
        document.cookie = `${TOKEN_KEY}=${nextToken}; path=/; max-age=86400; SameSite=Lax`;
      }

      setToken(nextToken);
      setAuthPhase("ready");
      setMessage("Login successful.");
    } catch (verifyError) {
      setMessage(getErrorMessage(verifyError));
      setDebugInfo(verifyError?.debugInfo ?? null);
    } finally {
      setBusy(false);
    }
  }

  async function handleUserPosts(appId) {
    setBusy(true);
    setDebugInfo(null);

    try {
      const userPosts = await guardedRequest(
        `${ENDPOINTS.userPosts}?app_id=${encodeURIComponent(appId)}`
      );
      const rows = normalizeList(userPosts);
      updateCollection("userPosts", rows);
      setModalState({
        open: true,
        title: `Posts of user ${appId}`,
        content: (
          <TableCard
            title="User Posts"
            rows={rows}
            columns={[
              { key: "title", label: "Title" },
              { key: "status", label: "Status" },
              { key: "views", label: "Views" },
              { key: "clicks", label: "Clicks" },
            ]}
          />
        ),
      });
    } catch (requestError) {
      setMessage(getErrorMessage(requestError));
      setDebugInfo(requestError?.debugInfo ?? null);
    } finally {
      setBusy(false);
    }
  }

  async function postAction(endpoint, body, successMessage, afterAction) {
    setBusy(true);
    setMessage("");
    setDebugInfo(null);

    try {
      await guardedRequest(endpoint, { method: "POST", body });
      if (afterAction) {
        await afterAction();
      } else {
        await loadCoreData();
      }
      setMessage(successMessage);
    } catch (requestError) {
      setMessage(getErrorMessage(requestError));
      setDebugInfo(requestError?.debugInfo ?? null);
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings(event) {
    event.preventDefault();
    await postAction(ENDPOINTS.settingsUpdate, settingsDraft, "Settings updated successfully.");
  }

  async function sendNotification(event) {
    event.preventDefault();
    await postAction(
      ENDPOINTS.notificationsSend,
      {
        title: notificationForm.title,
        body: notificationForm.body,
        target: notificationForm.target,
        ...(notificationForm.target === "specific" && notificationForm.target_value
          ? { target_value: notificationForm.target_value }
          : {}),
      },
      "Notification sent successfully."
    );
  }

  async function handleSmsSend(event) {
    event.preventDefault();
    await postAction(
      ENDPOINTS.smsSend,
      { app_id: smsForm.app_id, text: smsForm.text },
      "SMS sent successfully."
    );
  }

  async function handleSmsEdit() {
    await postAction(
      ENDPOINTS.smsEdit,
      { id: smsForm.id, text: smsForm.text, status: smsForm.status },
      "SMS updated successfully."
    );
  }

  async function handleRewardBulk() {
    const amount = Number(rewardForm.amount);

    if (!Number.isFinite(amount)) {
      setMessage("Amount must be a valid number.");
      return;
    }

    await postAction(
      ENDPOINTS.rewardsBulkUpdate,
      { amount },
      "Bulk rewards updated."
    );
  }

  async function handleDateRangeAnalytics(event) {
    event.preventDefault();
    const { start_date, end_date } = analyticsRangeForm;

    if (!start_date || !end_date) {
      setMessage("Start date and end date are required.");
      return;
    }

    setBusy(true);
    setMessage("");
    setDebugInfo(null);

    try {
      const analytics = await guardedRequest(
        `${ENDPOINTS.analyticsDateRange}?start_date=${encodeURIComponent(
          start_date
        )}&end_date=${encodeURIComponent(end_date)}`
      );
      updateCollection("dateRangeAnalytics", normalizeObject(analytics));
      setMessage("Date range analytics loaded successfully.");
    } catch (requestError) {
      setMessage(getErrorMessage(requestError));
      setDebugInfo(requestError?.debugInfo ?? null);
    } finally {
      setBusy(false);
    }
  }

  async function handleAdminDeviceRegister(event) {
    event.preventDefault();

    if (!adminDeviceForm.fcm_token.trim()) {
      setMessage("FCM token is required.");
      return;
    }

    await postAction(
      ENDPOINTS.adminDeviceRegister,
      { fcm_token: adminDeviceForm.fcm_token.trim() },
      "Admin device registered successfully."
    );
    setAdminDeviceForm(initialForms.adminDevice);
  }

  async function saveCategory(event) {
    event.preventDefault();
    const endpoint = categoryDraft.id ? ENDPOINTS.categoryEdit : ENDPOINTS.categoryAdd;
    await postAction(endpoint, categoryDraft, "Category saved successfully.");
    setCategoryDraft(initialForms.category);
  }

  async function saveCountry(event) {
    event.preventDefault();
    const endpoint = countryDraft.id ? ENDPOINTS.countryEdit : ENDPOINTS.countryAdd;
    await postAction(endpoint, countryDraft, "Country saved successfully.");
    setCountryDraft(initialForms.country);
  }

  function closeModal() {
    setModalState({ open: false, title: "", content: null, approvalGroup: null });
    setTrendingForm(initialForms.trending);
  }

  function handleTrendingInputChange(event) {
    const { name, value } = event.target;
    setTrendingForm((current) => ({ ...current, [name]: value }));
  }

  function handleBulkAutomationInputChange(event) {
    const { name, value } = event.target;
    setBulkAutomationForm((current) => ({ ...current, [name]: value }));
  }

  function openTrendingModal(group) {
    setTrendingForm({
      id: String(group.id ?? group.post_id ?? ""),
      position: "1",
      duration_value: "24",
      duration_unit: "hours",
    });
    setModalState({
      open: true,
      title: "Set Active Group Trending",
      content: null,
      approvalGroup: null,
      trendingGroup: group,
    });
  }

  async function submitTrendingGroup(event) {
    event.preventDefault();

    const id = Number(trendingForm.id);
    const position = Number(trendingForm.position);
    const durationValue = Number(trendingForm.duration_value);

    if (!Number.isFinite(id) || id <= 0) {
      setMessage("Valid group ID is required for trending.");
      return;
    }

    if (!Number.isFinite(position) || position <= 0) {
      setMessage("Trending position must be greater than 0.");
      return;
    }

    if (!Number.isFinite(durationValue) || durationValue <= 0) {
      setMessage("Trending duration must be greater than 0.");
      return;
    }

    const durationHours =
      trendingForm.duration_unit === "minutes" ? durationValue / 60 : durationValue;

    await postAction(
      ENDPOINTS.postsTrending,
      { id, position, duration_hours: durationHours },
      "Trending updated successfully.",
      async () => {
        closeModal();
        await loadCoreData();
      }
    );
  }

  async function handleActiveGroupDelete(group) {
    const id = Number(group.id ?? group.post_id);

    if (!Number.isFinite(id) || id <= 0) {
      setMessage("Valid group ID not found for delete action.");
      return;
    }

    await postAction(ENDPOINTS.postsDelete, { id }, "Post deleted successfully.");
  }

  async function handleBulkAutomationSubmit(event) {
    event.preventDefault();

    const entries = parseBulkGroupLinks(bulkAutomationForm.group_links);

    if (!entries.length) {
      setMessage("At least one WhatsApp group link is required.");
      return;
    }

    setBusy(true);
    setMessage("");
    setDebugInfo(null);
    setBulkPostingLogs([]);

    const nextLogs = [];

    try {
      for (const entry of entries) {
        const categoryId = entry.category_id || bulkAutomationForm.default_category_id;
        const countryId = entry.country_id || bulkAutomationForm.default_country_id;

        if (!categoryId || !countryId) {
          nextLogs.push({
            ...entry,
            group_name: "",
            status: "error",
            message: "Category ID and Country ID are required.",
          });
          setBulkPostingLogs([...nextLogs]);
          continue;
        }

        try {
          const scraped = await scrapeWhatsappGroup(entry.group_link, { strictClassesOnly: true });
          const payload = {
            category_id: Number(categoryId) || categoryId,
            country_id: Number(countryId) || countryId,
            group_link: scraped.group_link || entry.group_link,
            group_name: scraped.group_name?.trim(),
            group_image: scraped.group_image?.trim(),
            group_type: scraped.group_type?.trim()?.toLowerCase() || "group",
          };

          await guardedRequest(ENDPOINTS.postsAdd, { method: "POST", body: payload });

          nextLogs.push({
            ...entry,
            category_id: payload.category_id,
            country_id: payload.country_id,
            group_link: payload.group_link,
            group_name: payload.group_name,
            status: "success",
            message: "Posted successfully.",
          });
        } catch (error) {
          nextLogs.push({
            ...entry,
            category_id: categoryId,
            country_id: countryId,
            group_name: "",
            status: "error",
            message: getErrorMessage(error),
          });

          if (error?.debugInfo) {
            setDebugInfo(error.debugInfo);
          }
        }

        setBulkPostingLogs([...nextLogs]);
      }

      const successCount = nextLogs.filter((item) => item.status === "success").length;
      const failCount = nextLogs.length - successCount;
      setMessage(`Bulk posting finished. Success: ${successCount}, Failed: ${failCount}.`);
      setBulkAutomationForm(initialForms.bulkAutomation);
      await loadCoreData();
    } finally {
      setBusy(false);
    }
  }

  async function handleValidateInactiveGroups() {
    setBusy(true);
    setMessage("");
    setDebugInfo(null);
    setInactiveGroups([]);
    setValidationLogs(["Initializing validation process..."]);
    setBulkValidation({ running: true, page: 1, checked: 0, inactiveFound: 0 });

    const foundInactive = [];
    let currentPage = 1;
    let checked = 0;

    try {
      while (true) {
        setValidationLogs(prev => [...prev, `[System] Fetching page ${currentPage}...`]);
        const pageData = await guardedRequest(`${ENDPOINTS.postsBoss}?page=${currentPage}`);
        const rows = normalizeList(pageData);

        if (!rows.length) {
          setValidationLogs(prev => [...prev, `[System] No more groups found at page ${currentPage}.`]);
          break;
        }

        for (const row of rows) {
          checked += 1;
          const groupName = row.group_name || row.title || row.group_link;
          setValidationLogs(prev => [...prev, `[Checking] ${groupName} (ID: ${row.id ?? row.post_id})...`]);

          try {
            const scraped = await scrapeWhatsappGroup(row.group_link, { strictClassesOnly: true });
            if (!scraped?.group_name?.trim()) {
              throw new Error("Empty group name returned.");
            }
            setValidationLogs(prev => [...prev, `[Valid] ${groupName} is active.`]);
          } catch (err) {
            foundInactive.push({
              id: row.id ?? row.post_id,
              group_link: row.group_link,
              status: "inactive",
            });
            setInactiveGroups([...foundInactive]);
            setValidationLogs(prev => [...prev, `[Inactive Found] ${groupName} appears to be broken or empty.`]);
          }

          setBulkValidation({
            running: true,
            page: currentPage,
            checked,
            inactiveFound: foundInactive.length,
          });
          
          // Small delay to prevent rate limiting and let logs be readable
          await new Promise(r => setTimeout(r, 100));
        }

        currentPage += 1;
      }

      const finalMsg = foundInactive.length
        ? `Validation finished. Checked ${checked} groups, found ${foundInactive.length} inactive.`
        : `Validation finished. Checked ${checked} groups, all active.`;
        
      setValidationLogs(prev => [...prev, `[Finished] ${finalMsg}`]);
      setMessage(finalMsg);
    } catch (error) {
      const errMsg = getErrorMessage(error);
      setValidationLogs(prev => [...prev, `[Fatal Error] ${errMsg}`]);
      setMessage(errMsg);
      setDebugInfo(error?.debugInfo ?? null);
    } finally {
      setBulkValidation((current) => ({ ...current, running: false }));
      setBusy(false);
    }
  }

  async function handleInactiveGroupDelete(group) {
    const id = Number(group.id);

    if (!Number.isFinite(id) || id <= 0) {
      setMessage("Valid inactive group ID not found.");
      return;
    }

    await postAction(ENDPOINTS.postsDelete, { id }, "Inactive group deleted successfully.", async () => {
      setInactiveGroups((current) => current.filter((item) => Number(item.id) !== id));
      await loadCoreData();
    });
  }

  async function submitPendingGroupApproval(group, approvedGroup) {
    if (
      !approvedGroup.group_name?.trim() ||
      !approvedGroup.group_type?.trim() ||
      !approvedGroup.group_image?.trim()
    ) {
      setMessage("Invalid group. Group image, group name, and group type are required before approval.");
      closeModal();
      return;
    }

    const endpoint = ENDPOINTS.postsApprove;
    const payload = {
      post_id: approvedGroup.post_id ?? approvedGroup.id,
      group_name: approvedGroup.group_name.trim(),
      group_image: approvedGroup.group_image.trim(),
      group_type: approvedGroup.group_type.trim(),
      category_id: Number(approvedGroup.category_id) || approvedGroup.category_id,
      country_id: Number(approvedGroup.country_id) || approvedGroup.country_id,
      status: "approved",
    };

    await postAction(endpoint, payload, "Pending group approved.", async () => {
      syncPendingGroups((current) =>
        current.map((item) =>
          item.id === group.id ? { ...item, ...approvedGroup, status: "approve" } : item
        )
      );
      closeModal();
      await loadCoreData();
    });
  }

  async function openApprovalPreview(group) {
      setBusy(true);
      setMessage("Validating group link and scraping latest group info...");
      setDebugInfo(null);

      try {
        const scraped = await scrapeWhatsappGroup(group.group_link, { strictClassesOnly: true });
        const approvedGroup = {
          ...group,
          group_image: scraped.group_image.trim(),
          group_name: scraped.group_name.trim(),
          group_type: scraped.group_type.trim(),
          group_link: scraped.group_link || group.group_link,
        };

        setModalState({
          open: true,
          title: "Approve Pending Group",
          content: null,
          approvalGroup: { sourceGroup: group, scrapedGroup: approvedGroup },
        });
        setBusy(false);
        setMessage("Scraping completed. Review the scraped data before approving.");
      } catch (scrapeError) {
        setBusy(false);
        setMessage(getErrorMessage(scrapeError) || "Invalid group.");
      }
  }

  const usersColumns = [
    { key: "name", label: "Name" },
    { key: "email", label: "Email" },
    { key: "app_id", label: "App ID" },
    { key: "status", label: "Status" },
    {
      key: "actions",
      label: "Actions",
      render: (row) => (
        <div className="flex flex-wrap gap-2">
          <button className="secondary-button" onClick={() => handleUserPosts(row.app_id)}>
            View Posts
          </button>
          <button
            className="danger-button"
            onClick={() =>
              postAction(
                ENDPOINTS.usersDelete,
                { app_id: row.app_id },
                "User deleted successfully.",
                () => loadUsersPage(usersPagination.page)
              )
            }
          >
            Delete
          </button>
        </div>
      ),
    },
  ];

  const postsColumns = [
    {
      key: "group_image",
      label: "Group Image",
      render: (row) => renderGroupImageCell(row),
    },
    {
      key: "group",
      label: "Group",
      render: (row) => (
        <div className="post-group-cell">
          {row.group_image ? (
            <Image
              alt={row.group_name || "WhatsApp Group"}
              className="post-group-avatar"
              height={52}
              src={row.group_image}
              unoptimized
              width={52}
            />
          ) : (
            <div className="post-group-avatar post-group-avatar-fallback">No Image</div>
          )}
          <div className="post-group-meta">
            <p className="post-group-name">{toDisplayValue(row.group_name ?? row.title)}</p>
            <p className="post-group-type">{toDisplayValue(row.group_type)}</p>
            <p className="post-group-id">Group ID: {toDisplayValue(row.id ?? row.post_id)}</p>
          </div>
        </div>
      ),
    },
    { key: "status", label: "Status" },
    {
      key: "views",
      label: "Views",
      render: (row) => toCountValue(row.view_count, row.views),
    },
    {
      key: "clicks",
      label: "Clicks",
      render: (row) => toCountValue(row.click_count, row.clicks),
    },
    {
      key: "actions",
      label: "Actions",
      render: (row) => (
        <div className="flex flex-wrap gap-2">
          {row.group_link ? (
            <a className="secondary-button" href={row.group_link} rel="noreferrer" target="_blank">
              Visit
            </a>
          ) : null}
          <button
            className="secondary-button"
            onClick={() => openApprovalPreview(row)}
          >
            Approve
          </button>
          <button
            className="ghost-button"
            onClick={() =>
              postAction(
                ENDPOINTS.postsReject,
                { post_id: row.post_id ?? row.id, reason: "Rejected from admin panel." },
                "Post rejected."
              )
            }
          >
            Reject
          </button>
          <button
            className="secondary-button"
            onClick={() =>
              postAction(
                ENDPOINTS.postsTrending,
                { id: row.post_id ?? row.id, position: 1, duration_hours: 24 },
                "Trending updated."
              )
            }
          >
            Trending
          </button>
          <button
            className="danger-button"
            onClick={() =>
              postAction(ENDPOINTS.postsDelete, { id: row.post_id ?? row.id }, "Post deleted.")
            }
          >
            Delete
          </button>
        </div>
      ),
    },
  ];

  const activeGroupColumns = [
    { key: "id", label: "ID" },
    {
      key: "group_image",
      label: "Group Image",
      render: (row) => renderGroupImageCell(row),
    },
    {
      key: "group_name",
      label: "Group",
      render: (row) => toDisplayValue(row.group_name ?? row.title),
    },
    {
      key: "group_link",
      label: "Link",
      render: (row) =>
        row.group_link ? (
          <a className="link-text" href={row.group_link} rel="noreferrer" target="_blank">
            Open Link
          </a>
        ) : (
          "--"
        ),
    },
    {
      key: "click_count",
      label: "Clicks",
      render: (row) => toDisplayValue(row.click_count ?? row.clicks),
    },
    {
      key: "view_count",
      label: "Views",
      render: (row) => toDisplayValue(row.view_count ?? row.views),
    },
    { key: "status", label: "Status" },
    {
      key: "actions",
      label: "Actions",
      render: (row) => (
        <div className="flex flex-wrap gap-2">
          <button className="secondary-button" onClick={() => openTrendingModal(row)} type="button">
            Trending
          </button>
          <button className="danger-button" onClick={() => handleActiveGroupDelete(row)} type="button">
            Delete
          </button>
        </div>
      ),
    },
  ];

  if (authPhase === "loading") {
    return <div className="screen-loader">Loading admin workspace...</div>;
  }

  if (authPhase !== "ready") {
    return (
      <LoginView
        loginForm={loginForm}
        otpForm={otpForm}
        phase={authPhase}
        busy={busy}
        message={message}
        onChange={authPhase === "login" ? handleLoginInputChange : handleOtpInputChange}
        onLogin={handleLogin}
        onVerify={handleVerify}
      />
    );
  }

  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <div>
          <p className="text-xs uppercase tracking-[0.38em] text-sky-700">Control Room</p>
          <h1 className="mt-4 text-3xl font-semibold text-[var(--ink)]">Group Linker Admin</h1>
          <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
            Full admin workflow connected to the configured backend API and a server-side
            WhatsApp scraping proxy.
          </p>
        </div>

        <nav className="mt-8 flex flex-col gap-2">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`nav-button ${activeSection === item.id ? "active" : ""}`}
              onClick={() => setActiveSection(item.id)}
            >
              <span>{item.index}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <button className="danger-button mt-auto w-full justify-center" onClick={() => logout()}>
          Logout
        </button>
      </aside>

      <main className="content-area">
        <div className="hero-panel">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-200">Live Admin Workspace</p>
            <h2 className="mt-3 text-3xl font-semibold text-white md:text-4xl">
              {NAV_ITEMS.find((item) => item.id === activeSection)?.label}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-200">
              Base URL: <span className="font-mono text-slate-100">{API_BASE_URL}</span>
            </p>
          </div>
          <button
            className="primary-button bg-white text-slate-950 hover:bg-slate-100"
            onClick={loadCoreData}
          >
            {busy ? "Refreshing..." : "Refresh Data"}
          </button>
        </div>

        {message ? (
          <div className={looksLikeSuccess(message) ? "alert-success" : "alert-error"}>{message}</div>
        ) : null}

        {debugInfo ? (
          <section className="panel-card gap-3 border-rose-200 bg-rose-50/90">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-rose-900">Debug Log</h3>
              <span className="text-xs uppercase tracking-[0.2em] text-rose-700">
                {debugInfo.time}
              </span>
            </div>
            <div className="grid gap-3 text-sm text-rose-950 md:grid-cols-2">
              <div>
                <strong>Endpoint:</strong> {debugInfo.endpoint}
              </div>
              <div>
                <strong>Upstream:</strong> {debugInfo.upstreamEndpoint || "--"}
              </div>
              <div>
                <strong>Method:</strong> {debugInfo.method}
              </div>
              <div>
                <strong>Status:</strong> {String(debugInfo.status)}
              </div>
              <div>
                <strong>Cause:</strong> {debugInfo.cause || "--"}
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-semibold text-rose-900">Request Body</p>
                <pre className="overflow-x-auto rounded-2xl bg-rose-100 p-4 text-xs text-rose-950">
                  {JSON.stringify(debugInfo.requestBody, null, 2) || "--"}
                </pre>
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold text-rose-900">Response Snippet</p>
                <pre className="overflow-x-auto rounded-2xl bg-rose-100 p-4 text-xs text-rose-950">
                  {debugInfo.responseText || "--"}
                </pre>
              </div>
            </div>
            {debugInfo.parseError ? (
              <div className="text-sm text-rose-900">
                <strong>Parse Error:</strong> {debugInfo.parseError}
              </div>
            ) : null}
          </section>
        ) : null}

        {activeSection === "dashboard" ? (
          <section className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              {dashboardStats.map((item) => (
                <StatCard key={item.title} {...item} />
              ))}
            </div>

            <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
              <form className="panel-card grid gap-4 md:grid-cols-2" onSubmit={handleDateRangeAnalytics}>
                <label className="field">
                  <span>Start Date</span>
                  <input
                    className="input"
                    type="date"
                    value={analyticsRangeForm.start_date}
                    onChange={(event) =>
                      setAnalyticsRangeForm((current) => ({
                        ...current,
                        start_date: event.target.value,
                      }))
                    }
                    required
                  />
                </label>
                <label className="field">
                  <span>End Date</span>
                  <input
                    className="input"
                    type="date"
                    value={analyticsRangeForm.end_date}
                    onChange={(event) =>
                      setAnalyticsRangeForm((current) => ({
                        ...current,
                        end_date: event.target.value,
                      }))
                    }
                    required
                  />
                </label>
                <div className="md:col-span-2">
                  <button className="secondary-button" disabled={busy} type="submit">
                    {busy ? "Loading..." : "Load Date Range Analytics"}
                  </button>
                </div>
              </form>

              <TableCard
                title="Date Range Analytics"
                rows={collections.dateRangeAnalytics ? [collections.dateRangeAnalytics] : []}
                columns={[
                  { key: "clicks", label: "Clicks" },
                  { key: "views", label: "Views" },
                  { key: "new_posts", label: "New Posts" },
                ]}
                emptyText="Choose a start and end date to load analytics."
              />
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <TableCard
                title="Recent Users"
                rows={collections.users.slice(0, 6)}
                columns={usersColumns.slice(0, 4)}
              />
              <TableCard
                title="Pending Groups Queue"
                rows={collections.pendingGroups.slice(0, 5)}
                columns={[
                  { key: "group_name", label: "Group" },
                  { key: "category_id", label: "Category ID" },
                  { key: "country_id", label: "Country ID" },
                  {
                    key: "status",
                    label: "Status",
                    render: (row) => <span className={`status-pill status-${row.status}`}>{row.status}</span>,
                  },
                ]}
                emptyText="No locally submitted groups yet."
              />
            </div>
          </section>
        ) : null}

        {activeSection === "users" ? (
          <section className="space-y-4">
            <TableCard
              title="User Management"
              rows={collections.users}
              columns={usersColumns}
              actions={
                <span className="text-sm text-[var(--muted)]">
                  Showing {collections.users.length} of {usersPagination.filteredTotalUsers || usersPagination.totalUsers} users
                </span>
              }
            />
            <PaginationControls
              page={usersPagination.page}
              totalPages={usersPagination.totalPages}
              disabled={busy}
              onPrevious={() => loadUsersPage(Math.max(usersPagination.page - 1, 1))}
              onNext={() =>
                loadUsersPage(Math.min(usersPagination.page + 1, usersPagination.totalPages))
              }
            />
          </section>
        ) : null}

        {activeSection === "posts" ? (
          <section className="space-y-6">
            <TableCard title="Pending Groups" rows={collections.pendingPosts} columns={postsColumns} />
            <TableCard title="Reported Groups" rows={collections.reportedPosts} columns={postsColumns} />
            <TableCard
              title="Active Groups"
              rows={collections.activeGroups}
              columns={activeGroupColumns}
              emptyText="No active groups returned by boss endpoint."
              onScrollBottom={loadMoreActiveGroups}
              loadingMore={activeGroupsPagination.loadingMore}
            />
          </section>
        ) : null}

        {activeSection === "pending-groups" ? (
          <section className="space-y-6">
            <SectionHeader
              title="Bulk Automation"
              description="Bulk scrape and post WhatsApp groups, then validate active groups page by page to find inactive entries."
            />

            <form className="panel-card grid gap-4" onSubmit={handleBulkAutomationSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="field">
                  <span>Default Category</span>
                  <select
                    className="input"
                    name="default_category_id"
                    onChange={handleBulkAutomationInputChange}
                    value={bulkAutomationForm.default_category_id}
                  >
                    <option value="">Select default category</option>
                    {collections.categories.map((item) => (
                      <option key={item.id ?? item.name} value={item.id}>
                        {toDisplayValue(item.name)} (ID: {toDisplayValue(item.id)})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Default Country</span>
                  <select
                    className="input"
                    name="default_country_id"
                    onChange={handleBulkAutomationInputChange}
                    value={bulkAutomationForm.default_country_id}
                  >
                    <option value="">Select default country</option>
                    {collections.countries.map((item) => (
                      <option key={item.id ?? item.name} value={item.id}>
                        {toDisplayValue(item.name)} (ID: {toDisplayValue(item.id)})
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="field">
                <span>Group Links</span>
                <textarea
                  className="input min-h-52"
                  name="group_links"
                  onChange={handleBulkAutomationInputChange}
                  placeholder={
                    "One link per line\nhttps://chat.whatsapp.com/abc123\nhttps://chat.whatsapp.com/def456 | 2 | 5"
                  }
                  value={bulkAutomationForm.group_links}
                  required
                />
              </label>

              <p className="text-sm text-[var(--muted)]">
                Each line supports either just the group link, or `group_link | category_id | country_id`
                if you want per-post custom category and country.
              </p>

              <div className="flex flex-wrap gap-3">
                <button className="primary-button" disabled={busy} type="submit">
                  {busy ? "Posting..." : "Start Posting"}
                </button>
                <button
                  className="secondary-button"
                  disabled={busy || bulkValidation.running}
                  onClick={handleValidateInactiveGroups}
                  type="button"
                >
                  {bulkValidation.running ? "Validating..." : "Start Validation Check"}
                </button>
              </div>
            </form>

            <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
              <BulkAutomationLogTable
                title="Posting Logs"
                rows={bulkPostingLogs}
                emptyText="Posting logs will appear here after bulk automation starts."
              />

              <section className="panel-card gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-[var(--muted)]">
                    Validation Summary
                  </p>
                  <h3 className="mt-3 text-2xl font-semibold text-[var(--ink)]">Inactive Group Check</h3>
                </div>

                {bulkValidation.running || validationLogs.length > 0 ? (
                  <TerminalConsole logs={validationLogs} title="Validation Process Log" />
                ) : (
                  <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-1">
                    <div className="rounded-3xl border border-[var(--line)] bg-white p-4">
                      <p className="text-sm text-[var(--muted)]">Running Page</p>
                      <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">{bulkValidation.page}</p>
                    </div>
                    <div className="rounded-3xl border border-[var(--line)] bg-white p-4">
                      <p className="text-sm text-[var(--muted)]">Checked Groups</p>
                      <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">{bulkValidation.checked}</p>
                    </div>
                    <div className="rounded-3xl border border-[var(--line)] bg-white p-4">
                      <p className="text-sm text-[var(--muted)]">Inactive Found</p>
                      <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">{bulkValidation.inactiveFound}</p>
                    </div>
                  </div>
                )}

                <p className="text-sm text-[var(--muted)]">
                  Validator reads `/admin/posts/boss.php?page=1,2,3...` in batches of 20 and scrapes each
                  `group_link`. Groups that fail scraping are listed as inactive below.
                </p>
              </section>
            </div>

            <TableCard
              title="Inactive Groups"
              rows={inactiveGroups}
              emptyText="Inactive groups will appear here after validation."
              columns={[
                { key: "id", label: "Group ID" },
                {
                  key: "group_link",
                  label: "Group Link",
                  render: (row) => (
                    <a className="link-text" href={row.group_link} rel="noreferrer" target="_blank">
                      {row.group_link}
                    </a>
                  ),
                },
                {
                  key: "status",
                  label: "Status",
                  render: (row) => <span className="status-pill status-reject">{row.status}</span>,
                },
                {
                  key: "actions",
                  label: "Actions",
                  render: (row) => (
                    <button
                      className="danger-button"
                      disabled={busy}
                      onClick={() => handleInactiveGroupDelete(row)}
                      type="button"
                    >
                      Delete
                    </button>
                  ),
                },
              ]}
            />
          </section>
        ) : null}

        {activeSection === "categories" ? (
          <section className="space-y-6">
            <SectionHeader title="Category Management" description="Add, update, and remove categories." />
            <form className="panel-card grid gap-4 md:grid-cols-3" onSubmit={saveCategory}>
              <label className="field">
                <span>Category ID</span>
                <input
                  className="input"
                  value={categoryDraft.id}
                  onChange={(event) =>
                    setCategoryDraft((current) => ({ ...current, id: event.target.value }))
                  }
                  placeholder="Optional for edit"
                />
              </label>
              <label className="field">
                <span>Category Name</span>
                <input
                  className="input"
                  value={categoryDraft.name}
                  onChange={(event) =>
                    setCategoryDraft((current) => ({ ...current, name: event.target.value }))
                  }
                  required
                />
              </label>
              <label className="field">
                <span>Image Link</span>
                <input
                  className="input"
                  value={categoryDraft.image_link}
                  onChange={(event) =>
                    setCategoryDraft((current) => ({ ...current, image_link: event.target.value }))
                  }
                  placeholder="https://example.com/cat.png"
                />
              </label>
              <label className="field">
                <span>Status</span>
                <select
                  className="input"
                  value={categoryDraft.status}
                  onChange={(event) =>
                    setCategoryDraft((current) => ({ ...current, status: event.target.value }))
                  }
                >
                  <option value="active">active</option>
                  <option value="inactive">inactive</option>
                </select>
              </label>
              <div className="flex items-end gap-3">
                <button className="primary-button" type="submit">
                  Save Category
                </button>
              </div>
            </form>
            <TableCard
              title="Categories"
              rows={collections.categories}
              columns={[
                { key: "id", label: "ID" },
                { key: "name", label: "Name" },
                { key: "image_link", label: "Image Link" },
                { key: "status", label: "Status" },
                {
                  key: "actions",
                  label: "Actions",
                  render: (row) => (
                    <div className="flex gap-2">
                      <button
                        className="secondary-button"
                        onClick={() =>
                          setCategoryDraft({
                            id: row.id ?? "",
                            name: row.name ?? "",
                            image_link: row.image_link ?? "",
                            status: row.status ?? "active",
                          })
                        }
                      >
                        Edit
                      </button>
                      <button
                        className="danger-button"
                        onClick={() =>
                          postAction(
                            ENDPOINTS.categoryDelete,
                            { id: row.id },
                            "Category deleted."
                          )
                        }
                      >
                        Delete
                      </button>
                    </div>
                  ),
                },
              ]}
            />
          </section>
        ) : null}

        {activeSection === "countries" ? (
          <section className="space-y-6">
            <SectionHeader title="Country Management" description="Maintain supported countries and codes." />
            <form className="panel-card grid gap-4 md:grid-cols-4" onSubmit={saveCountry}>
              <label className="field">
                <span>Country ID</span>
                <input
                  className="input"
                  value={countryDraft.id}
                  onChange={(event) =>
                    setCountryDraft((current) => ({ ...current, id: event.target.value }))
                  }
                  placeholder="Optional for edit"
                />
              </label>
              <label className="field">
                <span>Name</span>
                <input
                  className="input"
                  value={countryDraft.name}
                  onChange={(event) =>
                    setCountryDraft((current) => ({ ...current, name: event.target.value }))
                  }
                  required
                />
              </label>
              <label className="field">
                <span>Code</span>
                <input
                  className="input"
                  value={countryDraft.code}
                  onChange={(event) =>
                    setCountryDraft((current) => ({ ...current, code: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span>Status</span>
                <select
                  className="input"
                  value={countryDraft.status}
                  onChange={(event) =>
                    setCountryDraft((current) => ({ ...current, status: event.target.value }))
                  }
                >
                  <option value="active">active</option>
                  <option value="inactive">inactive</option>
                </select>
              </label>
              <div className="flex items-end gap-3">
                <button className="primary-button" type="submit">
                  Save Country
                </button>
              </div>
            </form>
            <TableCard
              title="Countries"
              rows={collections.countries}
              columns={[
                { key: "id", label: "ID" },
                { key: "name", label: "Name" },
                { key: "code", label: "Code" },
                { key: "status", label: "Status" },
                {
                  key: "actions",
                  label: "Actions",
                  render: (row) => (
                    <div className="flex gap-2">
                      <button
                        className="secondary-button"
                        onClick={() =>
                          setCountryDraft({
                            id: row.id ?? "",
                            name: row.name ?? "",
                            code: row.code ?? "",
                            status: row.status ?? "active",
                          })
                        }
                      >
                        Edit
                      </button>
                      <button
                        className="danger-button"
                        onClick={() =>
                          postAction(
                            ENDPOINTS.countryDelete,
                            { id: row.id },
                            "Country deleted."
                          )
                        }
                      >
                        Delete
                      </button>
                    </div>
                  ),
                },
              ]}
            />
          </section>
        ) : null}

        {activeSection === "settings" ? (
          <section className="space-y-6">
            <SectionHeader
              title="System Settings"
              description="Update system values and toggle ads from one panel."
              action={
                <button
                  className="secondary-button"
                  onClick={() =>
                    postAction(
                      ENDPOINTS.toggleAds,
                      {
                        ads_status:
                          String(settingsDraft.ads_status || "").toLowerCase() === "on" ? "off" : "on",
                      },
                      "Ads status updated."
                    )
                  }
                >
                  Toggle Ads
                </button>
              }
            />
            <form className="panel-card grid gap-4 md:grid-cols-[1fr_auto]" onSubmit={handleAdminDeviceRegister}>
              <label className="field">
                <span>Admin FCM Token</span>
                <input
                  className="input"
                  value={adminDeviceForm.fcm_token}
                  onChange={(event) =>
                    setAdminDeviceForm((current) => ({
                      ...current,
                      fcm_token: event.target.value,
                    }))
                  }
                  placeholder="firebase-token"
                  required
                />
              </label>
              <div className="flex items-end">
                <button className="secondary-button" disabled={busy} type="submit">
                  Register Device
                </button>
              </div>
            </form>
            <form className="panel-card grid gap-4 md:grid-cols-2" onSubmit={saveSettings}>
              {Object.entries(settingsDraft)
                .filter(([, value]) => !Array.isArray(value) && typeof value !== "object")
                .map(([key, value]) => (
                  <label className="field" key={key}>
                    <span>{key}</span>
                    <input
                      className="input"
                      value={String(value ?? "")}
                      onChange={(event) =>
                        setSettingsDraft((current) => ({ ...current, [key]: event.target.value }))
                      }
                    />
                  </label>
                ))}
              <div className="md:col-span-2">
                <button className="primary-button" type="submit">
                  Update Settings
                </button>
              </div>
            </form>
          </section>
        ) : null}

        {activeSection === "sms" ? (
          <section className="space-y-6">
            <SectionHeader title="SMS Management" description="Send, edit, and review outgoing SMS records." />
            <form className="panel-card grid gap-4 md:grid-cols-3" onSubmit={handleSmsSend}>
              <label className="field">
                <span>SMS ID</span>
                <input
                  className="input"
                  value={smsForm.id}
                  onChange={(event) => setSmsForm((current) => ({ ...current, id: event.target.value }))}
                  placeholder="For edit"
                />
              </label>
              <label className="field">
                <span>App ID</span>
                <input
                  className="input"
                  value={smsForm.app_id}
                  onChange={(event) =>
                    setSmsForm((current) => ({ ...current, app_id: event.target.value }))
                  }
                  required
                />
              </label>
              <label className="field">
                <span>Status</span>
                <select
                  className="input"
                  value={smsForm.status}
                  onChange={(event) =>
                    setSmsForm((current) => ({ ...current, status: event.target.value }))
                  }
                >
                  <option value="active">active</option>
                  <option value="inactive">inactive</option>
                </select>
              </label>
              <label className="field md:col-span-3">
                <span>Text</span>
                <textarea
                  className="input min-h-28"
                  value={smsForm.text}
                  onChange={(event) =>
                    setSmsForm((current) => ({ ...current, text: event.target.value }))
                  }
                  required
                />
              </label>
              <div className="flex flex-wrap gap-3 md:col-span-3">
                <button className="primary-button" type="submit">
                  Send SMS
                </button>
                <button className="secondary-button" type="button" onClick={handleSmsEdit}>
                  Edit SMS
                </button>
              </div>
            </form>
            <TableCard
              title="SMS List"
              rows={collections.sms}
              columns={[
                { key: "id", label: "ID" },
                { key: "app_id", label: "App ID" },
                { key: "text", label: "Text" },
                { key: "status", label: "Status" },
              ]}
            />
          </section>
        ) : null}

        {activeSection === "notifications" ? (
          <section className="space-y-6">
            <SectionHeader title="Notifications" description="Broadcast to all users or target a specific user." />
            <form className="panel-card grid gap-4 md:grid-cols-2" onSubmit={sendNotification}>
              <label className="field">
                <span>Target</span>
                <select
                  className="input"
                  value={notificationForm.target}
                  onChange={(event) =>
                    setNotificationForm((current) => ({
                      ...current,
                      target: event.target.value,
                    }))
                  }
                >
                  <option value="all">all</option>
                  <option value="specific">specific</option>
                </select>
              </label>
              <label className="field">
                <span>Title</span>
                <input
                  className="input"
                  value={notificationForm.title}
                  onChange={(event) =>
                    setNotificationForm((current) => ({ ...current, title: event.target.value }))
                  }
                  required
                />
              </label>
              <label className="field md:col-span-2">
                <span>Target Value</span>
                <input
                  className="input"
                  value={notificationForm.target_value}
                  onChange={(event) =>
                    setNotificationForm((current) => ({
                      ...current,
                      target_value: event.target.value,
                    }))
                  }
                  placeholder="Required only for specific target"
                />
              </label>
              <label className="field md:col-span-2">
                <span>Body</span>
                <textarea
                  className="input min-h-32"
                  value={notificationForm.body}
                  onChange={(event) =>
                    setNotificationForm((current) => ({
                      ...current,
                      body: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <div className="md:col-span-2">
                <button className="primary-button" type="submit">
                  Send Notification
                </button>
              </div>
            </form>
          </section>
        ) : null}

        {activeSection === "rewards" ? (
          <section className="space-y-6">
            <SectionHeader title="Rewards System" description="Bulk update all user reward points." />
            <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
              <form className="panel-card grid gap-4" onSubmit={(event) => event.preventDefault()}>
                <label className="field">
                  <span>Amount</span>
                  <input
                    className="input"
                    type="number"
                    value={rewardForm.amount}
                    onChange={(event) =>
                      setRewardForm((current) => ({ ...current, amount: event.target.value }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Bulk Notes</span>
                  <textarea
                    className="input min-h-40 font-mono text-sm"
                    value={rewardForm.bulk_data}
                    onChange={(event) =>
                      setRewardForm((current) => ({ ...current, bulk_data: event.target.value }))
                    }
                    placeholder='Optional local note or draft JSON'
                  />
                </label>
                <button className="ghost-button" type="button" onClick={handleRewardBulk}>
                  Run Bulk Update
                </button>
              </form>
              <TableCard
                title="Settings Snapshot"
                rows={collections.rewards}
                columns={[
                  { key: "reward_points_per_request", label: "Reward / Request" },
                  { key: "reward_interval_seconds", label: "Reward Interval" },
                  { key: "post_submit_interval_seconds", label: "Submit Interval" },
                ]}
              />
            </div>
          </section>
        ) : null}
      </main>

      <Modal
        open={modalState.open}
        title={modalState.title}
        onClose={closeModal}
      >
        {modalState.approvalGroup ? (
          <PendingGroupApprovalPreview
            busy={busy}
            group={modalState.approvalGroup.scrapedGroup}
            onApprove={() =>
              submitPendingGroupApproval(
                modalState.approvalGroup.sourceGroup,
                modalState.approvalGroup.scrapedGroup
              )
            }
            onCancel={closeModal}
          />
        ) : modalState.trendingGroup ? (
          <TrendingGroupForm
            busy={busy}
            form={trendingForm}
            group={modalState.trendingGroup}
            onCancel={closeModal}
            onChange={handleTrendingInputChange}
            onSubmit={submitTrendingGroup}
          />
        ) : (
          modalState.content
        )}
      </Modal>
    </div>
  );
}
