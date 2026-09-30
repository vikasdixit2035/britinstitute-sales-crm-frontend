import axios, { type AxiosResponse } from 'axios';
import type { 
  ApiResponse, 
  PaginatedResponse,
  LoginCredentials, 
  User, 
  Lead, 
  CreateLeadForm, 
  UpdateLeadForm, 
  AssignLeadForm,
  AddNoteForm,
  DashboardStats,
  PeriodLeadStats,
  LeadFilters,
  ExcelUploadResponse,
  CreateUserForm,
  ExcelFileAnalysis,
  SheetPreviewData,
  DynamicImportRequest,
  LeadFieldDefinition,
  GoogleSheetImportResponse,
  ZoomPhoneAnalyticsResponse,
  ZoomPhoneInventoryResponse,
  ZoomPhoneLeadCallsResponse,
  ZoomPhoneLeadRecordingsResponse,
  ZoomPhoneLiveStatusResponse,
  ZoomPhoneNumberAssignment,
  ZoomPhoneNumberAssignmentRequest,
  ZoomPhoneNumberAssignmentsResponse,
  ZoomPhoneStatus,
  ZoomTalkTimeResponse,
  ZoomUserCallSummary,
} from '../types';
import { defaultStatusOptions } from '../types';

const isLoopbackHost = (hostname: string) => hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';

const resolveApiBaseUrl = () => {
  const configuredUrl = import.meta.env.VITE_API_URL;

  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location;

    if (configuredUrl) {
      try {
        const url = new URL(configuredUrl);
        if (!isLoopbackHost(hostname) && isLoopbackHost(url.hostname)) {
          url.protocol = protocol;
          url.hostname = hostname;
          return url.toString().replace(/\/$/, '');
        }
      } catch {
        return configuredUrl;
      }

      return configuredUrl;
    }

    return `${protocol}//${hostname}:8000/api`;
  }

  return configuredUrl || 'http://localhost:8000/api';
};

// Create axios instance with base configuration
const api = axios.create({
  baseURL: resolveApiBaseUrl(),
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Only redirect to login if this is NOT a login request
      // Login requests should handle their own 401 errors
      const isLoginRequest = error.config?.url?.includes('/auth/login');
      
      if (!isLoginRequest) {
        // Clear auth data and redirect to login for expired tokens
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Helper function to handle API responses
const handleResponse = <T>(response: AxiosResponse<ApiResponse<T>>): ApiResponse<T> => {
  return response.data;
};

const handleError = (error: any): ApiResponse => {
  if (error.response?.data) {
    const errorData = error.response.data;
    
    // 📍 Handle Clock-Out Restriction
    if (errorData.isClockedOut === true) {
      // 📍 Dispatch a custom event that the UI will listen for
      const event = new CustomEvent('showRestrictedAccess', { 
        detail: { message: errorData.message } 
      });
      window.dispatchEvent(event);

      return { ...errorData, isClockedOut: true };
    }

    // Handle duplicate errors
    if (errorData.message === 'Duplicate lead detected' || 
        errorData.errors?.some((err: string) => err.includes('already exists'))) {
      return {
        ...errorData,
        message: 'Duplicate lead detected',
        isDuplicate: true
      };
    }

    return errorData;
  }
  
  return {
    success: false,
    message: error.message || 'An unexpected error occurred',
  };
};

const appendLeadDateParams = (params: URLSearchParams, filters?: Partial<LeadFilters>) => {
  if (!filters) return;
  if (filters.date) params.append('date', filters.date);
  if (filters.fromDate) params.append('fromDate', filters.fromDate);
  if (filters.toDate) params.append('toDate', filters.toDate);
  if (filters.createdFromDate) params.append('createdFromDate', filters.createdFromDate);
  if (filters.createdToDate) params.append('createdToDate', filters.createdToDate);
  if (filters.modifiedFromDate) params.append('modifiedFromDate', filters.modifiedFromDate);
  if (filters.modifiedToDate) params.append('modifiedToDate', filters.modifiedToDate);
  if (filters.lastContactedFromDate) params.append('lastContactedFromDate', filters.lastContactedFromDate);
  if (filters.lastContactedToDate) params.append('lastContactedToDate', filters.lastContactedToDate);
  if (filters.dateField) params.append('dateField', filters.dateField);
  if (filters.timezoneOffsetMinutes) params.append('timezoneOffsetMinutes', filters.timezoneOffsetMinutes);
};
// Authentication API
export const authApi = {
  login: async (credentials: LoginCredentials): Promise<ApiResponse<{ user: User; token: string }>> => {
    try {
      const response = await api.post('/auth/login', credentials);
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },

  me: async (): Promise<ApiResponse<User>> => {
    try {
      const response = await api.get('/auth/me');
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },

  logout: async (): Promise<ApiResponse> => {
    try {
      const response = await api.post('/auth/logout');
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },

  updateProfile: async (profileData: { name: string; email?: string; phone?: string }): Promise<ApiResponse<User>> => {
    try {
      const response = await api.put('/auth/profile', profileData);
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },

  changePassword: async (passwordData: { currentPassword: string; newPassword: string }): Promise<ApiResponse> => {
    try {
      const response = await api.put('/auth/change-password', passwordData);
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },

  dangerReset: async (): Promise<ApiResponse> => {
    try {
      const response = await api.post('/auth/danger-reset');
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },
};

// User Management API
export const userApi = {
  getUsers: async (page: number = 1, limit: number = 10, search?: string): Promise<PaginatedResponse<User>> => {
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString()
      });
      
      if (search) {
        params.append('search', search);
      }

      const response = await api.get(`/users?${params.toString()}`);
      return response.data;
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to fetch users',
        data: [],
        pagination: { page: 1, limit: 10, total: 0, totalPages: 0 }
      };
    }
  },

  getAllUsers: async (): Promise<ApiResponse<User[]>> => {
    try {
      const response = await api.get('/users?limit=1000'); // Fetch all users
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },

  createUser: async (userData: CreateUserForm): Promise<ApiResponse<User>> => {
    try {
      const response = await api.post('/users', userData);
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },

  updateUser: async (userId: string, userData: Partial<User>): Promise<ApiResponse<User>> => {
    try {
      const response = await api.put(`/users/${userId}`, userData);
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },

  deleteUser: async (userId: string): Promise<ApiResponse> => {
    try {
      const response = await api.delete(`/users/${userId}`);
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },

  getUserById: async (userId: string): Promise<ApiResponse<User>> => {
    try {
      const response = await api.get(`/users/${userId}`);
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },

  getUserStats: async (): Promise<ApiResponse<{ totalUsers: number; activeUsers: number; adminUsers: number; userUsers: number }>> => {
    try {
      const response = await api.get('/users/stats');
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },
};

// Lead Management API
export const leadApi = {
  getLeads: async (
    filters?: LeadFilters,
    page?: number,
    limit?: number
  ): Promise<PaginatedResponse<Lead>> => {
    try {
      const params = new URLSearchParams();
  
      if (filters) {
        Object.entries(filters).forEach(([key, value]) => {
  
          // ✅ FIX: preserve assignedTo=null (BACKWARD COMPATIBLE)
          if (key === 'assignedTo' && value === null) {
            params.append('assignedTo', 'null');
            return;
          }

          // ✅ FIX: Do not allow status names to be passed as folder filter
          if (key === 'folder') {
            const rawFolders = Array.isArray(value) ? value : [value];
            const cleanFolders = rawFolders.filter(
              f => f && !(defaultStatusOptions as string[]).includes(f.toString())
            );
            cleanFolders.forEach(v => params.append('folder', v.toString()));
            return;
          }

          if (value !== undefined && value !== null) {
  
            // ✅ KEEP: array support (UNCHANGED)
            if (Array.isArray(value)) {
              value.forEach(v => params.append(key, v.toString()));
            }
  
            // ✅ ADD: date filters (SAFE ADDITION)
            else if (
              key === 'date' ||
              key === 'fromDate' ||
              key === 'toDate'
            ) {
              params.append(key, value.toString());
            }
  
            // ✅ KEEP: object support (UNCHANGED)
            else if (typeof value === 'object') {
              params.append(key, JSON.stringify(value));
            }
  
            // ✅ KEEP: primitive support (UNCHANGED)
            else {
              params.append(key, value.toString());
            }
          }
        });
      }
  
      if (page) params.append('page', page.toString());
      if (limit) params.append('limit', limit.toString());
  
      const response = await api.get(`/leads?${params.toString()}`);
      return response.data;
  
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to fetch leads',
        data: [],
        pagination: {
          page: page || 1,
          limit: limit || 10,
          total: 0,
          totalPages: 0
        }
      };
    }
  },
  
/**
   * Admin-only: Fetch all chat history across the platform
   * Maps to: router.get("/getChat", requireAdmin, getAllChats)
   */
/**
   * Admin-only: Fetch all chat history across the platform
   * Maps to: router.get("/getChat", requireAdmin, getAllChats)
   */
getAllChats: async (
  filters?: { phone?: string; search?: string; platform?: string },
  page?: number,
  limit?: number
): Promise<PaginatedResponse<any>> => {
  try {
    const params = new URLSearchParams();

    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, value.toString());
        }
      });
    }

    if (page) params.append('page', page.toString());
    if (limit) params.append('limit', limit.toString());

    // ✅ FIX: Added the leading slash and ensured it points to /leads/getChat
    const response = await api.get(`/chat/getChat?${params.toString()}`);
    return response.data;

  } catch (error) {
    console.error("Fetch all chats error:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to fetch chat history',
      data: [],
      pagination: {
        page: page || 1,
        limit: limit || 50,
        total: 0,
        totalPages: 0
      }
    };
  }
},
  getDuplicateLeads: async (
    filters?: LeadFilters,
    page?: number,
    limit?: number
  ): Promise<PaginatedResponse<Lead>> => {
    try {
      const params = new URLSearchParams();
  
      if (filters) {
        Object.entries(filters).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            if (Array.isArray(value)) {
              value.forEach(v => params.append(key, v));
            } else if (typeof value === 'object') {
              params.append(key, JSON.stringify(value));
            } else {
              params.append(key, value.toString());
            }
          }
        });
      }
  
      // ✅ FORCE Duplicate folder
      params.delete('folder');
      params.append('folder', 'Duplicate');
  
      if (page) params.append('page', page.toString());
      if (limit) params.append('limit', limit.toString());
  
      const response = await api.get(`/leads?${params.toString()}`);
      return response.data;
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to fetch duplicate leads',
        data: [],
        pagination: { page: 1, limit: 10, total: 0, totalPages: 0 }
      };
    }
  },
  

  getLead: async (leadId: string): Promise<ApiResponse<Lead>> => {
    try {
      const response = await api.get(`/leads/${leadId}`);
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },

  createLead: async (leadData: CreateLeadForm): Promise<ApiResponse<Lead>> => {
    try {
      const response = await api.post('/leads', leadData);
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },

  updateLead: async (leadId: string, leadData: UpdateLeadForm): Promise<ApiResponse<Lead>> => {
    try {
      const response = await api.put(`/leads/${leadId}`, leadData);
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },

  deleteLead: async (leadId: string): Promise<ApiResponse> => {
    try {
      const response = await api.delete(`/leads/${leadId}`);
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },

  assignLeads: async (assignmentData: AssignLeadForm): Promise<ApiResponse<Lead[]>> => {
    try {
      const response = await api.post('/leads/assign', assignmentData);
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },

  bulkUpdateStatus: async (
    leadIds: string[],
    status: string,
    statusReminder?: UpdateLeadForm['statusReminder']
  ): Promise<ApiResponse<Lead[]>> => {
    try {
      const response = await api.put('/leads/bulk-status', { leadIds, status, statusReminder });
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },

  unassignLeads: async (data: { leadIds: string[] }): Promise<ApiResponse<Lead[]>> => {
    try {
      const response = await api.post('/leads/unassign', data);
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },

  addNote: async (noteData: AddNoteForm): Promise<ApiResponse<Lead>> => {
    try {
      const response = await api.post('/leads/notes', noteData);
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },

  getMyLeads: async (
    page?: number,
    limit?: number,
    status?: string,
    folder?: string,
    search?: string,
    dateFilters?: Partial<LeadFilters>
  ): Promise<PaginatedResponse<Lead>> => {
    try {
      const params = new URLSearchParams();
      if (page) params.append('page', page.toString());
      if (limit) params.append('limit', limit.toString());
      if (status) params.append('status', status);
      if (folder && !(defaultStatusOptions as string[]).includes(folder)) params.append('folder', folder);
      if (search) params.append('search', search);
      appendLeadDateParams(params, dateFilters);

      const response = await api.get(`/leads/my-leads?${params.toString()}`);
      return response.data;
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to fetch your leads',
        data: [],
        pagination: { page: 1, limit: 10, total: 0, totalPages: 0 }
      };
    }
  },

  // Get stats for all leads assigned to the current user (independent of filters or pagination)
  getMyLeadsStats: async (
    filters?: Partial<LeadFilters>
  ): Promise<ApiResponse<{ total: number; newLeads: number; inProgress: number; closed: number }>> => {
    try {
      const params = new URLSearchParams();
      appendLeadDateParams(params, filters);
      const query = params.toString();
      const response = await api.get(`/leads/my-leads/stats${query ? `?${query}` : ''}`);
      return response.data;
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to fetch your leads stats',
      };
    }
  },

  // Get distinct folders for filtering
  getDistinctFolders: async (): Promise<ApiResponse<string[]>> => {
    try {
      const response = await api.get('/leads/folders');
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },

  // Get folder counts for better performance
  getFolderCounts: async (filters?: Partial<LeadFilters>): Promise<ApiResponse<Record<string, number>>> => {
    try {
      const params = new URLSearchParams();
      appendLeadDateParams(params, filters);
      const query = params.toString();
      const response = await api.get(`/leads/folder-counts${query ? `?${query}` : ''}`);
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },
  getFolderCountForAdmin: async (filters?: Partial<LeadFilters>): Promise<ApiResponse<Record<string, number>>> => {
    try {
      const params = new URLSearchParams();
      appendLeadDateParams(params, filters);
      const query = params.toString();
      const response = await api.get(`/leads/folder-countsALL${query ? `?${query}` : ''}`);
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },
  getLeadsBySearch: async (
    query: string
  ): Promise<ApiResponse<Lead[]>> => {
    try {
      const response = await api.get('/leads/search', {
        params: { q: query }
      })
  
      return handleResponse(response)
    } catch (error) {
      return handleError(error)
    }
  },
  

  // Smart Excel Import APIs
  getLeadFields: async (): Promise<ApiResponse<LeadFieldDefinition[]>> => {
    try {
      const response = await api.get('/leads/import/fields');
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },

  analyzeExcelFile: async (file: File): Promise<ApiResponse<ExcelFileAnalysis>> => {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await api.post('/leads/import/analyze', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },

  getSheetPreview: async (file: File, sheetName: string, previewRows: number = 5): Promise<ApiResponse<SheetPreviewData>> => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('sheetName', sheetName);
      formData.append('previewRows', previewRows.toString());

      const response = await api.post('/leads/import/preview', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },

  importWithMapping: async (file: File, importRequest: Omit<DynamicImportRequest, 'fileName'>): Promise<ExcelUploadResponse> => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('sheetName', importRequest.sheetName);
      formData.append('fieldMappings', JSON.stringify(importRequest.fieldMappings));

      formData.append('skipEmptyRows', importRequest.skipEmptyRows.toString());
      formData.append('startFromRow', importRequest.startFromRow.toString());

      const response = await api.post('/leads/import', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to import Excel file',
        data: {
          totalRows: 0,
          successfulImports: 0,
          failedImports: 0,
          errors: [],
          leads: []
        }
      };
    }
  },

    /* ONLY NEW METHOD ADDED — NOTHING ELSE CHANGED */
    importFromGoogleSheet: async (
      sheetUrl: string
    ): Promise<GoogleSheetImportResponse> => {
      const response = await api.post('/leads/import/google-sheet', { sheetUrl });
      return response.data;
    },
    
    
  };


// Dashboard API
export const dashboardApi = {
  getStats: async (): Promise<ApiResponse<DashboardStats>> => {
    try {
      const response = await api.get('/dashboard/stats');
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },

  getAdminStats: async (): Promise<ApiResponse<DashboardStats>> => {
    try {
      const response = await api.get('/dashboard/admin-stats');
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },

  getLeadsByStatus: async (
    filters?: Partial<LeadFilters>
  ): Promise<ApiResponse<Array<{ status: string; count: number; percentage: number }>>> => {
    try {
      const params = new URLSearchParams();
      appendLeadDateParams(params, filters);
      const query = params.toString();
      const response = await api.get(`/dashboard/leads/by-status${query ? `?${query}` : ''}`);
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },

  getLeadsBySource: async (
    filters?: Partial<LeadFilters>
  ): Promise<ApiResponse<Array<{ source: string; count: number; percentage: number }>>> => {
    try {
      const params = new URLSearchParams();
      appendLeadDateParams(params, filters);
      const query = params.toString();
      const response = await api.get(`/dashboard/leads/by-source${query ? `?${query}` : ''}`);
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },

  getRecentActivity: async (
    filters?: Partial<LeadFilters>
  ): Promise<ApiResponse<Array<{ type: string; description: string; timestamp: string; user: string }>>> => {
    try {
      const params = new URLSearchParams();
      appendLeadDateParams(params, filters);
      const query = params.toString();
      const response = await api.get(`/dashboard/recent-activity${query ? `?${query}` : ''}`);
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },

  getLeadMetrics: async (
    period: '7d' | '30d' | '90d' | 'all' = '30d',
    filters?: Partial<LeadFilters>
  ): Promise<ApiResponse<{ conversionRate: number; leadWon: number; leadsThisWeek: number; leadsThisMonth: number }>> => {
    try {
      const params = new URLSearchParams({ period });
      appendLeadDateParams(params, filters);
      const response = await api.get(`/dashboard/metrics?${params.toString()}`);
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },

  getPeriodStats: async (
    period: 'today' | 'week' | 'month' | 'custom',
    range?: { from?: string; to?: string; timezoneOffsetMinutes?: string }
  ): Promise<ApiResponse<PeriodLeadStats>> => {
    try {
      const params = new URLSearchParams({ period });
      if (range?.from) params.append('from', range.from);
      if (range?.to) params.append('to', range.to);
      if (range?.timezoneOffsetMinutes) params.append('timezoneOffsetMinutes', range.timezoneOffsetMinutes);
      const response = await api.get(`/dashboard/period-stats?${params.toString()}`);
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },
};

// Status API
export const statusApi = {
  getStatuses: async (): Promise<ApiResponse<Array<{ _id: string; name: string; isDefault: boolean; order: number }>>> => {
    try {
      const response = await api.get('/statuses');
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },

  createStatus: async (name: string): Promise<ApiResponse<{ _id: string; name: string; isDefault: boolean; order: number }>> => {
    try {
      const response = await api.post('/statuses', { name });
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },

  deleteStatus: async (id: string): Promise<ApiResponse> => {
    try {
      const response = await api.delete(`/statuses/${id}`);
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },

  updateOrder: async (statuses: Array<{ id: string; order: number }>): Promise<ApiResponse> => {
    try {
      const response = await api.put('/statuses/order', { statuses });
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },
};





/* ================= TYPES ================= */
export interface AttendanceRecord {
  _id: string;
  date: string;
  checkIn: string;
  checkOut?: string;
  workHours: number;
  status: 'Present' | 'Late' | 'Half-day';
  location: {
    lat: number;
    lng: number;
  };
}

export interface MonthlyReport {
  totalDays: number;
  totalHours: number;
  averageHours: number;
}
/* ================= TYPES ================= */
export interface WorkHoursStats {
  totalHours: number;
  daysCount: number;
  period: 'today' | 'monthly' | 'yearly';
}
/* ================= API OBJECT ================= */
export const attendanceApi = {
  /**
   * Clock in with current GPS coordinates
   */
  clockIn: async (lat: number, lng: number): Promise<ApiResponse<AttendanceRecord>> => {
    try {
      const response = await api.post('/attendance/check-in', { lat, lng });
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },



clockOut: async (lat: number, lng: number): Promise<ApiResponse<AttendanceRecord>> => {
  try {
    //  Coordinates must be passed to match the updated backend controller
    const response = await api.post('/attendance/check-out', { lat, lng });
    return handleResponse(response);
  } catch (error) {
    return handleError(error);
  }
},

  /**
   * Get paginated history of current user's attendance
   */
  getMyAttendance: async (page: number = 1, limit: number = 10): Promise<PaginatedResponse<AttendanceRecord>> => {
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString()
      });
      
      const response = await api.get(`/attendance/my-history?${params.toString()}`);
      return response.data;
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to fetch attendance history',
        data: [],
        pagination: { page: 1, limit: 10, total: 0, totalPages: 0 }
      };
    }
  },

  /**
   * Get monthly stats for salary slip calculation
   * @param month (1-12)
   * @param year (e.g. 2026)
   */
  getMonthlyReport: async (month: number, year: number): Promise<ApiResponse<MonthlyReport>> => {
    try {
      const response = await api.get(`/attendance/monthly-report?month=${month}&year=${year}`);
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },


  getWorkHours: async (period: 'today' | 'monthly' | 'yearly' = 'today'): Promise<ApiResponse<WorkHoursStats>> => {
    try {
      // Matches your route: router.get('/getWorkHours', getWorkHours)
      const response = await api.get(`/attendance/getWorkHours?period=${period}`);
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },



  /**
   * Get current attendance status for the UI lockdown and live timer
   */
  getStatus: async (): Promise<ApiResponse<{ isClockedIn: boolean; checkInTime: string | null }>> => {
    try {
      const response = await api.get('/attendance/status');
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },


// Inside attendanceApi in your api.ts file
// src/lib/api.ts
getAdminReport: async (from: string, to: string, page: number = 1, limit: number = 15): Promise<any> => {
  try {
    // We pass page and limit to the backend to handle the large dataset
    const params = new URLSearchParams({ 
      from, 
      to, 
      page: page.toString(), 
      limit: limit.toString() 
    });
    const response = await api.get(`/attendance/admin/report?${params.toString()}`);
    return response.data; 
  } catch (error) {
    return handleError(error);
  }
},

  /**
   * User: Get personal attendance report
   * URL: /attendance/report
   */
  getUserReport: async (): Promise<ApiResponse<any>> => {
    try {
      const response = await api.get('/attendance/report');
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },

  /**
   * Admin/User: Get specific analytics for a user by ID
   * URL: /attendance/analytics/:userId?month=1&year=2025
   */
  getUserAnalytics: async (userId: string, options: { month: number; year: number }): Promise<ApiResponse<any>> => {
    try {
      const params = new URLSearchParams({ 
        month: options.month.toString(), 
        year: options.year.toString() 
      });
      const response = await api.get(`/attendance/analytics/${userId}?${params.toString()}`);
      return response.data;
    } catch (error) {
      return handleError(error);
    }
  },


  getReport: async (
    fromDate: string,
    toDate: string,
    page: number = 1,
    limit: number = 10
  ): Promise<ApiResponse<any>> => {
    try {
      const params = new URLSearchParams({
        fromDate,
        toDate,
        page: page.toString(),
        limit: limit.toString()
      });
  
      const response = await api.get(`/attendance/report?${params.toString()}`);
      return response.data;
    } catch (error) {
      return handleError(error);
    }
  },
  
};


export const performance ={
  // Inside src/lib/api.ts
  getUserPerformance: async (
    userId: string, 
    filters: { range?: string; from?: string; to?: string }
  ): Promise<any> => {
    try {
      const params = new URLSearchParams();
      // Only append if the values actually exist
      if (filters.range) params.append('range', filters.range);
      if (filters.from) params.append('from', filters.from);
      if (filters.to) params.append('to', filters.to);

      // Matches: http://localhost:8000/api/performance/:userId?range=...
      const response = await api.get(`/performance/${userId}?${params.toString()}`);
      return response.data;
    } catch (error) {
      return handleError(error);
    }
  },
  getUserAnalytics: async (userId: string, month: number, year: number): Promise<ApiResponse<any>> => {
    try {
      // Matches: http://localhost:8000/api/attendance/analytics/${userId}?month=${month}&year=${year}
      const response = await api.get(`/attendance/analytics/${userId}?month=${month}&year=${year}`);
      return response.data;
    } catch (error) {
      return handleError(error);
    }
  },
};

interface ZoomPhoneQuery {
  from?: string;
  to?: string;
  type?: string;
  nextPageToken?: string;
  pageSize?: number;
  maxPages?: number;
  includeRecordings?: boolean;
}

const appendZoomPhoneQuery = (params: URLSearchParams, query?: ZoomPhoneQuery) => {
  if (!query) return;
  if (query.from) params.append('from', query.from);
  if (query.to) params.append('to', query.to);
  if (query.type) params.append('type', query.type);
  if (query.nextPageToken) params.append('nextPageToken', query.nextPageToken);
  if (query.pageSize) params.append('pageSize', query.pageSize.toString());
  if (query.maxPages) params.append('maxPages', query.maxPages.toString());
  if (query.includeRecordings !== undefined) params.append('includeRecordings', String(query.includeRecordings));
};

export const zoomPhoneApi = {
  getMyTalkTime: async (timezone: string): Promise<ApiResponse<ZoomTalkTimeResponse>> => {
    try {
      const response = await api.get('/zoom-phone/my/talk-time', { params: { timezone } });
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },
  getUserCallSummary: async (
    userId: string,
    query: Pick<ZoomPhoneQuery, 'from' | 'to'> & { timezone: string }
  ): Promise<ApiResponse<ZoomUserCallSummary>> => {
    try {
      const params = new URLSearchParams();
      if (query.from) params.append('from', query.from);
      if (query.to) params.append('to', query.to);
      params.append('timezone', query.timezone);
      const response = await api.get(`/zoom-phone/users/${encodeURIComponent(userId)}/call-summary?${params.toString()}`);
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },
  getStatus: async (): Promise<ApiResponse<ZoomPhoneStatus>> => {
    try {
      const response = await api.get('/zoom-phone/status');
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },
  getAssignments: async (
    options?: { active?: boolean }
  ): Promise<ApiResponse<ZoomPhoneNumberAssignmentsResponse>> => {
    try {
      const params = new URLSearchParams();
      if (options?.active !== undefined) params.append('active', String(options.active));
      const queryString = params.toString();
      const response = await api.get(`/zoom-phone/assignments${queryString ? `?${queryString}` : ''}`);
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },
  assignNumber: async (
    payload: ZoomPhoneNumberAssignmentRequest
  ): Promise<ApiResponse<ZoomPhoneNumberAssignment>> => {
    try {
      const response = await api.post('/zoom-phone/assignments', payload);
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },
  getRecordingAudioUrl: (
    recordingId: string,
    options?: {
      downloadUrl?: string;
      disposition?: 'inline' | 'attachment';
    }
  ): string => {
    const token = localStorage.getItem('token');
  
    const params = new URLSearchParams();
  
    if (options?.downloadUrl) {
      params.append('downloadUrl', options.downloadUrl);
    }

    if (options?.disposition) {
      params.append('disposition', options.disposition);
    }
  
    if (token) {
      params.append('token', token);
    }
  
    return `${api.defaults.baseURL}/zoom-phone/account/recordings/${encodeURIComponent(
      recordingId
    )}/audio?${params.toString()}`;
  },
  getLeadRecordingAudioUrl: (
    leadId: string,
    recordingId: string,
    options?: {
      downloadUrl?: string;
      callLogId?: string;
      from?: string;
      to?: string;
      disposition?: 'inline' | 'attachment';
    }
  ): string => {
    const token = localStorage.getItem('token');
    const params = new URLSearchParams();

    if (options?.downloadUrl) params.append('downloadUrl', options.downloadUrl);
    if (options?.callLogId) params.append('callLogId', options.callLogId);
    if (options?.from) params.append('from', options.from);
    if (options?.to) params.append('to', options.to);
    if (options?.disposition) params.append('disposition', options.disposition);
    if (token) params.append('token', token);

    return `${api.defaults.baseURL}/zoom-phone/leads/${encodeURIComponent(leadId)}/recordings/${encodeURIComponent(
      recordingId
    )}/audio?${params.toString()}`;
  },
  getAccountCallLogs: async (query?: ZoomPhoneQuery): Promise<ApiResponse<ZoomPhoneLeadCallsResponse>> => {
    try {
      const params = new URLSearchParams();
      appendZoomPhoneQuery(params, query);
      const queryString = params.toString();
      const response = await api.get(`/zoom-phone/account/call-logs${queryString ? `?${queryString}` : ''}`);
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },

  getAccountRecordings: async (query?: ZoomPhoneQuery): Promise<ApiResponse<ZoomPhoneLeadRecordingsResponse>> => {
    try {
      const params = new URLSearchParams();
      appendZoomPhoneQuery(params, query);
      const queryString = params.toString();
      const response = await api.get(`/zoom-phone/account/recordings${queryString ? `?${queryString}` : ''}`);
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },

  getAnalytics: async (query?: ZoomPhoneQuery): Promise<ApiResponse<ZoomPhoneAnalyticsResponse>> => {
    try {
      const params = new URLSearchParams();
      appendZoomPhoneQuery(params, query);
      const queryString = params.toString();
      const response = await api.get(`/zoom-phone/account/analytics${queryString ? `?${queryString}` : ''}`);
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },

  getInventory: async (query?: ZoomPhoneQuery): Promise<ApiResponse<ZoomPhoneInventoryResponse>> => {
    try {
      const params = new URLSearchParams();
      appendZoomPhoneQuery(params, query);
      const queryString = params.toString();
      const response = await api.get(`/zoom-phone/account/inventory${queryString ? `?${queryString}` : ''}`);
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },

  getLiveStatus: async (query?: ZoomPhoneQuery): Promise<ApiResponse<ZoomPhoneLiveStatusResponse>> => {
    try {
      const params = new URLSearchParams();
      appendZoomPhoneQuery(params, query);
      const queryString = params.toString();
      const response = await api.get(`/zoom-phone/account/live${queryString ? `?${queryString}` : ''}`);
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },

  getLeadCalls: async (leadId: string, query?: ZoomPhoneQuery): Promise<ApiResponse<ZoomPhoneLeadCallsResponse>> => {
    try {
      const params = new URLSearchParams();
      appendZoomPhoneQuery(params, query);
      const queryString = params.toString();
      const response = await api.get(`/zoom-phone/leads/${leadId}/calls${queryString ? `?${queryString}` : ''}`);
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },

  getLeadRecordings: async (
    leadId: string,
    query?: ZoomPhoneQuery
  ): Promise<ApiResponse<ZoomPhoneLeadRecordingsResponse>> => {
    try {
      const params = new URLSearchParams();
      appendZoomPhoneQuery(params, query);
      const queryString = params.toString();
      const response = await api.get(`/zoom-phone/leads/${leadId}/recordings${queryString ? `?${queryString}` : ''}`);
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },

  getCallLogRecordings: async (
    leadId: string,
    callLogId: string
  ): Promise<ApiResponse<ZoomPhoneLeadRecordingsResponse>> => {
    try {
      const response = await api.get(
        `/zoom-phone/leads/${leadId}/call-logs/${encodeURIComponent(callLogId)}/recordings`
      );
      return handleResponse(response);
    } catch (error) {
      return handleError(error);
    }
  },

  downloadLeadRecordingAudio: async (
    leadId: string,
    recordingId: string,
    options?: {
      downloadUrl?: string;
      callLogId?: string;
      from?: string;
      to?: string;
    }
  ): Promise<Blob> => {
    const params = new URLSearchParams();
    if (options?.downloadUrl) params.append('downloadUrl', options.downloadUrl);
    if (options?.callLogId) params.append('callLogId', options.callLogId);
    if (options?.from) params.append('from', options.from);
    if (options?.to) params.append('to', options.to);
    const queryString = params.toString();
    const response = await api.get(
      `/zoom-phone/leads/${leadId}/recordings/${encodeURIComponent(recordingId)}/audio${queryString ? `?${queryString}` : ''}`,
      { responseType: 'blob' }
    );
    return response.data;
  },

  downloadAccountRecordingAudio: async (
    recordingId: string,
    options?: {
      downloadUrl?: string;
    }
  ): Promise<Blob> => {
    const params = new URLSearchParams();
    if (options?.downloadUrl) params.append('downloadUrl', options.downloadUrl);
    const queryString = params.toString();
    const response = await api.get(
      `/zoom-phone/account/recordings/${encodeURIComponent(recordingId)}/audio${queryString ? `?${queryString}` : ''}`,
      { responseType: 'blob' }
    );
    return response.data;
  }
};


export default api;
