import axios from "axios";

// ─── Base Instance ─────────────────────────────────────────────────────────────

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:8000",
  headers: { "Content-Type": "application/json" },
  timeout: 15000,
});

// ─── Token helpers (localStorage for hackathon persistence) ───────────────────

export const tokenStorage = {
  get:    ()      => localStorage.getItem("access_token"),
  set:    (token) => localStorage.setItem("access_token", token),
  clear:  ()      => localStorage.removeItem("access_token"),
};

// ─── Request interceptor — attach Bearer token ────────────────────────────────

client.interceptors.request.use(
  (config) => {
    const token = tokenStorage.get();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ─── Response interceptor — normalise errors ──────────────────────────────────

client.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;

    // 401 — clear token and bounce to login
    if (status === 401) {
      tokenStorage.clear();
      // avoid redirect loop if already on auth pages
      if (!window.location.pathname.startsWith("/login") &&
          !window.location.pathname.startsWith("/register")) {
        window.location.href = "/login";
      }
    }

    // Normalise the error so call sites always get a plain string message
    // Handles FastAPI 422 shape: { detail: [{msg, loc, type}] }
    // Handles our 404/401 shape:  { detail: "string" }
    const detail = error.response?.data?.detail;

    let message = "An unexpected error occurred.";

    if (typeof detail === "string") {
      message = detail;
    } else if (Array.isArray(detail) && detail.length > 0) {
      // FastAPI validation errors — join all messages
      message = detail
        .map((d) => {
          const field = d.loc?.filter((l) => l !== "body").join(" → ");
          return field ? `${field}: ${d.msg}` : d.msg;
        })
        .join(" • ");
    } else if (error.message === "Network Error") {
      message = "Cannot reach the server. Is the backend running?";
    } else if (error.code === "ECONNABORTED") {
      message = "Request timed out. Please try again.";
    }

    // Attach the clean message so consumers can do: error.message
    error.message = message;

    return Promise.reject(error);
  }
);

export default client;