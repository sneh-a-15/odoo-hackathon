import axios from "axios";

const api = axios.create({ baseURL: "http://localhost:8000/api/v1" });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const msg = err.response?.data?.detail || "Something went wrong";
    return Promise.reject(new Error(msg));
  }
);

export default api;