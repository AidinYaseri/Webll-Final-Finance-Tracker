import axios from "axios";

const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

// Auth endpoints
export const authAPI = {
  register: (username: string, email: string, password: string) =>
    apiClient.post("/auth/register", { username, email, password }),
  login: (email: string, password: string, rememberMe = false) =>
    apiClient.post("/auth/login", { email, password, rememberMe }),
  logout: () => apiClient.post("/auth/logout"),
  getCurrentUser: () => apiClient.get("/auth/me"),
};

// Transaction endpoints
export const transactionAPI = {
  getAll: () => apiClient.get("/transactions"),
  getById: (id: number) => apiClient.get(`/transactions/${id}`),
  create: (data: any) => apiClient.post("/transactions", data),
  update: (id: number, data: any) => apiClient.put(`/transactions/${id}`, data),
  delete: (id: number) => apiClient.delete(`/transactions/${id}`),
};

// Category endpoints
export const categoryAPI = {
  getAll: () => apiClient.get("/categories"),
  create: (data: any) => apiClient.post("/categories", data),
  delete: (id: number) => apiClient.delete(`/categories/${id}`),
};

// Dashboard endpoints
export const dashboardAPI = {
  getSummary: () => apiClient.get("/dashboard/summary"),
  getMonthly: () => apiClient.get("/dashboard/monthly"),
  getCategories: () => apiClient.get("/dashboard/categories"),
};

// Admin endpoints
export const adminAPI = {
  getAdminUsers: () => apiClient.get("/admin/users"),
  deleteAdminUser: (id: number) => apiClient.delete(`/admin/users/${id}`),
  getAdminStats: () => apiClient.get("/admin/stats"),
};

export default apiClient;
