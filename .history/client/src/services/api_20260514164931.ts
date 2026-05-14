import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auth endpoints
export const authAPI = {
  register: (username: string, email: string, password: string) =>
    apiClient.post('/auth/register', { username, email, password }),
  login: (username: string, password: string) =>
    apiClient.post('/auth/login', { username, password }),
  logout: () => apiClient.post('/auth/logout'),
  getCurrentUser: () => apiClient.get('/auth/me'),
};

// Transaction endpoints
export const transactionAPI = {
  getAll: () => apiClient.get('/transactions'),
  getById: (id: number) => apiClient.get(`/transactions/${id}`),
  create: (data: any) => apiClient.post('/transactions', data),
  update: (id: number, data: any) => apiClient.put(`/transactions/${id}`, data),
  delete: (id: number) => apiClient.delete(`/transactions/${id}`),
};

// Category endpoints
export const categoryAPI = {
  getAll: () => apiClient.get('/categories'),
  create: (data: any) => apiClient.post('/categories', data),
  delete: (id: number) => apiClient.delete(`/categories/${id}`),
};

// Dashboard endpoints
export const dashboardAPI = {
  getSummary: () => apiClient.get('/dashboard/summary'),
  getMonthly: () => apiClient.get('/dashboard/monthly'),
  getCategories: () => apiClient.get('/dashboard/categories'),
};

export default apiClient;
