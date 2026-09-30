// Authentication Types
export interface ZoomCallSummary {
  from: string;
  to: string;
  talk_time_seconds: number;
  total_calls: number;
  inbound_calls: number;
  outbound_calls: number;
  connected_calls: number;
  connected_outbound_calls: number;
  unique_contacts: number;
  unique_outbound_contacts: number;
  connected_unique_contacts: number;
}

export interface ZoomTalkTimePeriod extends ZoomCallSummary {
  date?: string;
  total_connected_calls: number;
  dialed_calls: number;
}

export interface ZoomTalkTimeResponse {
  linked: boolean;
  timezone: string;
  updated_at: string;
  daily: ZoomTalkTimePeriod & { date: string };
  weekly: ZoomTalkTimePeriod;
}

export interface ZoomUserCallSummary extends ZoomCallSummary {
  linked: boolean;
  timezone: string;
  updated_at: string;
}

export interface AssignmentHistoryItem {
  _id: string;
  assignedTo?: User;
  assignedBy?: User | null;
  assignedAt: string;
  source: 'Manual' | 'Bulk' | 'Import' | 'Reimport' | 'System';
}

export interface User {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  role: 'admin' | 'user';
  isActive: boolean;
  lastLogin?: string;
  canWorkFromHome: boolean, 
  createdAt: string;
  updatedAt: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface CreateUserForm {
  name: string;
  email: string;
  password: string;
  role: 'admin' | 'user';
  phone?: string;
  canWorkFromHome: boolean
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface MetaAttribute {
  key: string;
  label: string;
  value: string;
  rawValue?: string;
}

// Lead Types
// Lead Types (BACKWARD COMPATIBLE)
export interface Lead {
  _id: string;
  name: string;
  email: string;
  phone: string;
  whatsapp?: string;
  zoomPhoneNumber?: string;
  position: string;
  folder: string;
  source: LeadSource;
  status: LeadStatus;
  priority: LeadPriority;

  campaignName?: string;
  adsetName?: string;
  adName?: string;
  metaLeadId?: string;
  metaFormId?: string;
  metaPageId?: string;
  metaAdId?: string;
  metaCampaignId?: string;
  metaAdsetId?: string;
  metaFbc?: string;
  metaFbp?: string;
  metaLeadIdHistory?: string[];
  metaCreatedTime?: string;
  metaOriginalName?: string;
  metaOriginalEmail?: string;
  metaOriginalPhone?: string;
  metaAttributes?: MetaAttribute[];
  metaRawPayload?: Record<string, unknown>;
  qualifiedAt?: string;
  convertedAt?: string;
  metaFeedbackLastStatus?: string;
  metaFeedbackLastSentAt?: string;
  metaFeedbackLastError?: string;

  label?: string;
  labels?: string[];
  isRetargeting?: boolean;
  linkedLeadId?: string;
  linkedLead?: {
    _id: string;
    name: string;
    status: LeadStatus;
    folder?: string;
    assignedTo?: string;
  };
  matchReason?: 'EMAIL_EXISTS' | 'PHONE_EXISTS' | 'EMAIL_PHONE_EXISTS';

  assignedTo?: string;
  assignedBy?: string;
  assignedToUser?: User;
  assignedByUser?: User;
  lastContactedAt?: string;
  lastContactedBy?: string;
  lastContactedByName?: string;
  lastContactedByEmail?: string;
  lastContactedByUser?: User;

  notes: LeadNote[];
  leadScore?: number;

  // ✅ NEW — OPTIONAL (won’t break old code)
  assignmentHistory?: AssignmentHistoryItem[];
  assignmentCount?: number;
  wasAssignedInPast?: boolean;

  createdAt: string;
  updatedAt: string;
}



export interface LeadNote {
  id: string;
  content: string;
  createdBy: User;
  createdAt: string;
}

export type LeadSource =
  | 'Website'
  | 'Social Media'
  | 'Referral'
  | 'Import'
  | 'Manual'
  | 'Cold Call'
  | 'Email Campaign'
  | 'strategy_call_modal'
  | 'data_analytics_landing_page'
  | 'Meta';

// LeadStatus is now dynamic - fetched from API
export type LeadStatus = string;

export const defaultStatusOptions: LeadStatus[] = [
  'New',
  'Contacted',
  'Follow-up',
  'Interested',
  'Qualified',
  'Proposal Sent',
  'Negotiating',
  'Sales Done',
  'DNP',
  'Not Interested',
  'Wrong Number',
  'Call Back'
];

export type LeadPriority = 'High' | 'Medium' | 'Low';

// Status Management Types
export interface Status {
  _id: string;
  name: string;
  isDefault: boolean;
  order: number;
  createdAt?: string;
  updatedAt?: string;
}

// Dashboard Types
export interface DashboardStats {
  totalLeads: number;
  newLeads: number;
  contactedLeads: number;
  qualifiedLeads: number;
  salesDone: number;
  dnpLeads: number;
  conversionRate: number;
  averageResponseTime: number;
  leadsThisMonth: number;
  leadsGrowth: number;
  topPerformers: Array<{
    userId: string;
    userName: string;
    leadsAssigned: number;
    leadsConverted: number;
    conversionRate: number;
  }>;
  leadsBySource: Array<{
    source: LeadSource;
    count: number;
    percentage: number;
  }>;
  leadsByStatus: Array<{
    status: LeadStatus;
    count: number;
    percentage: number;
  }>;
  leadsByFolder: Array<{
    folder: string;
    count: number;
    percentage: number;
  }>;
  lastUpdated: string;
}

export interface PeriodLeadStats {
  period: 'today' | 'week' | 'month' | 'custom';
  from: string;
  to: string;
  updatedLeads: number;
  createdLeads: number;
  assignedLeads: number;
  unassignedLeads: number;
  newLeads: number;
  contactedLeads: number;
  qualifiedLeads: number;
  salesDone: number;
  dnpLeads: number;
  statusBreakdown: Array<{
    _id: string;
    count: number;
  }>;
  sourceBreakdown: Array<{
    _id: string;
    count: number;
  }>;
  recentUpdates: Lead[];
  lastUpdated: string;
}

// API Types
export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  errors?: string[];
  pagination?: {
    totalRecords: number;
    totalPages: number;
    currentPage: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export interface PaginatedResponse<T = any> {
  success: boolean;
  message: string;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Form Types
export interface CreateLeadForm {
  name: string;
  email: string;
  phone: string;
  whatsapp?: string;
  zoomPhoneNumber?: string;
  position?: string;
  folder?: string;
  source: LeadSource;
  priority: LeadPriority;
  notes?: string;
}

export interface UpdateLeadForm {
  name?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  zoomPhoneNumber?: string;
  position?: string;
  folder?: string;
  source?: LeadSource;
  status?: LeadStatus;
  statusReminder?: {
    date: string;
    time: string;
    timeZone: 'Europe/London' | 'Asia/Kolkata';
  };
  priority?: LeadPriority;
}

export interface AssignLeadForm {
  leadIds: string[];
  assignToUserId: string;
}

export interface AddNoteForm {
  leadId: string;
  content: string;
}

export interface ZoomPhoneStatus {
  configured: boolean;
  missing: string[];
  provider: string;
  mode: string;
}

export interface ZoomPhoneOwner {
  id?: string;
  name?: string;
  email?: string;
  extension_number?: string;
  phone_number?: string;
  type?: string;
}

export interface ZoomPhoneCrmUserMatch {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ZoomPhoneCrmLeadMatch {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

export interface ZoomPhoneCallLog {
  id?: string;
  call_id?: string;
  call_type?: string;
  direction?: string;
  duration?: number;
  date_time?: string;
  answer_start_time?: string;
  call_end_time?: string;
  caller_number?: string;
  callee_number?: string;
  caller_did_number?: string;
  callee_did_number?: string;
  caller_phone_number?: string;
  callee_phone_number?: string;
  caller_email?: string;
  callee_email?: string;
  user_email?: string;
  caller_name?: string;
  callee_name?: string;
  result?: string;
  path?: string;
  recording_id?: string;
  recording_type?: string;
  owner?: ZoomPhoneOwner;
  user_id?: string;
  site?: {
    id?: string;
    name?: string;
  };
  normalized_direction?: string;
  normalized_status?: string;
  started_at?: string;
  agent_name?: string;
  display_phone?: string;
  recording_count?: number;
  has_recording?: boolean;
  recording_download_url?: string;
  matched_user?: ZoomPhoneCrmUserMatch;
  matched_lead?: ZoomPhoneCrmLeadMatch;
}

export interface ZoomPhoneRecording {
  id?: string;
  call_id?: string;
  call_log_id?: string;
  call_history_id?: string;
  call_element_id?: string;
  caller_number?: string;
  caller_number_type?: string;
  callee_number?: string;
  callee_number_type?: string;
  caller_email?: string;
  callee_email?: string;
  user_email?: string;
  caller_name?: string;
  callee_name?: string;
  direction?: string;
  duration?: number;
  date_time?: string;
  end_time?: string;
  download_url?: string;
  file_url?: string;
  transcript_download_url?: string;
  recording_type?: string;
  owner?: ZoomPhoneOwner;
  site?: {
    id?: string;
    name?: string;
  };
  disclaimer_status?: string;
  matched_user?: ZoomPhoneCrmUserMatch;
  matched_lead?: ZoomPhoneCrmLeadMatch;
}

export interface ZoomPhoneLeadCallsResponse {
  call_logs: ZoomPhoneCallLog[];
  total_records?: number;
  next_page_token?: string;
  page_size?: number;
  page_count?: number;
  matched_numbers?: string[];
}

export interface ZoomPhoneLeadRecordingsResponse {
  recordings: ZoomPhoneRecording[];
  total_records?: number;
  next_page_token?: string;
  page_size?: number;
  page_count?: number;
  matched_numbers?: string[];
}

export interface ZoomPhoneAnalyticsSummary {
  total_calls: number;
  incoming_calls: number;
  outgoing_calls: number;
  missed_calls: number;
  connected_calls: number;
  voicemail_calls: number;
  recorded_calls: number;
  answer_rate: number;
  average_call_duration: number;
  total_talk_time: number;
}

export interface ZoomPhoneAgentAnalytics {
  agent: string;
  extension_number?: string;
  phone_number?: string;
  total_calls: number;
  incoming_calls: number;
  outgoing_calls: number;
  connected_calls: number;
  missed_calls: number;
  recorded_calls: number;
  total_talk_time: number;
  average_call_duration: number;
  answer_rate: number;
}

export interface ZoomPhoneDailyAnalytics {
  date: string;
  total_calls: number;
  incoming_calls: number;
  outgoing_calls: number;
  connected_calls: number;
  missed_calls: number;
  recorded_calls: number;
  total_talk_time: number;
}

export interface ZoomPhoneAnalyticsBreakdown {
  label: string;
  count: number;
  percentage: number;
}

export interface ZoomPhoneAnalyticsResponse {
  from: string;
  to: string;
  page_size: number;
  pages_scanned: number;
  total_records_scanned: number;
  call_logs: ZoomPhoneCallLog[];
  recordings: ZoomPhoneRecording[];
  recordings_error?: string;
  summary: ZoomPhoneAnalyticsSummary;
  agent_stats: ZoomPhoneAgentAnalytics[];
  daily_stats: ZoomPhoneDailyAnalytics[];
  status_breakdown: ZoomPhoneAnalyticsBreakdown[];
  direction_breakdown: ZoomPhoneAnalyticsBreakdown[];
}

export interface ZoomPhoneNumber {
  id?: string;
  number?: string;
  display_number?: string;
  source?: string;
  status?: string;
  capability?: string[];
  assignee?: {
    id?: string;
    name?: string;
    extension_number?: string;
    extension_type?: string;
    type?: string;
  };
  location?: string;
  emergency_address?: {
    address_line1?: string;
    city?: string;
    state_code?: string;
    country?: string;
    zip?: string;
  };
  site?: {
    id?: string;
    name?: string;
  };
}

export interface ZoomPhoneUser {
  id?: string;
  phone_user_id?: string;
  email?: string;
  name?: string;
  extension_id?: string;
  extension_number?: string;
  status?: string;
  activation_status?: string;
  calling_plans?: Array<{
    type?: string;
    name?: string;
    billing_account_id?: string;
  }>;
  phone_numbers?: ZoomPhoneNumber[];
}

export interface ZoomPhoneInventoryResponse {
  phone_numbers: ZoomPhoneNumber[];
  users: ZoomPhoneUser[];
  summary: {
    total_numbers: number;
    assigned_numbers: number;
    unassigned_numbers: number;
    available_numbers: number;
    busy_numbers: number;
    inactive_numbers: number;
    total_users: number;
    active_users: number;
    inactive_users: number;
  };
  number_status_breakdown: ZoomPhoneAnalyticsBreakdown[];
  user_status_breakdown: ZoomPhoneAnalyticsBreakdown[];
  capability_breakdown: ZoomPhoneAnalyticsBreakdown[];
  pages_scanned: {
    numbers: number;
    users: number;
  };
}

export type ZoomPhoneNumberAssignmentSource = 'zoom_inventory' | 'crm_backfill' | 'manual';

export interface ZoomPhoneNumberAssignment {
  id: string;
  normalizedNumber: string;
  displayNumber?: string;
  zoomNumberId?: string;
  zoomPhoneUserId?: string;
  zoomPhoneUserEmail?: string;
  zoomPhoneUserName?: string;
  crmUser: string;
  crmUserEmail: string;
  crmUserName: string;
  assignedAt: string;
  releasedAt?: string;
  source: ZoomPhoneNumberAssignmentSource;
  createdAt?: string;
  updatedAt?: string;
}

export interface ZoomPhoneNumberAssignmentsResponse {
  assignments: ZoomPhoneNumberAssignment[];
}

export interface ZoomPhoneNumberAssignmentRequest {
  userId: string;
  phoneNumber: string;
  assignedAt?: string;
}

export interface ZoomPhoneMetricParty {
  phone_number?: string;
  extension_number?: string;
  email?: string;
  device_type?: string;
  site_id?: string;
  site_name?: string;
  name?: string;
}

export interface ZoomPhoneMetricCall {
  call_id?: string;
  direction?: string;
  duration?: number;
  date_time?: string;
  status?: string;
  result?: string;
  call_type?: string;
  caller?: ZoomPhoneMetricParty;
  callee?: ZoomPhoneMetricParty;
  owner?: ZoomPhoneOwner;
  matched_user?: ZoomPhoneCrmUserMatch;
  connected_number?: string;
  zoom_account?: string;
  live_status?: 'on_call' | 'available' | 'recent';
}

export interface ZoomPhoneLiveUser extends ZoomPhoneUser {
  matched_user?: ZoomPhoneCrmUserMatch;
  connected_numbers: string[];
  live_status: 'on_call' | 'available';
  active_call_id?: string;
}

export interface ZoomPhoneLiveStatusResponse {
  active_calls: ZoomPhoneMetricCall[];
  recent_calls: ZoomPhoneMetricCall[];
  phone_users: ZoomPhoneLiveUser[];
  inventory: ZoomPhoneInventoryResponse;
  updated_at: string;
}

// Excel Import Types
// export interface ExcelUploadResponse {
//   success: boolean;
//   message: string;
//   data: {
//     totalRows: number;
//     successfulImports: number;
//     failedImports: number;
//     errors: Array<{
//       row: number;
//       field: string;
//       message: string;
//     }>;
//     leads: Lead[];
//   };
// }
export interface ExcelUploadResponse {
  success: boolean;
  message?: string;

  // 🔽 NEW (from Google Sheet API)
  duplicateCount?: number;
  duplicateLeads?: {
    row: number;
    name: string;
    email: string;
    phone: string;
    reason: string;
  }[];

  data: {
    totalRows: number;
    successfulImports: number;
    failedImports: number;
    errors: {
      row: number;
      message: string;
    }[];
    leads: any[];
  };
}



export interface GoogleSheetImportResponse {
  success: boolean;
  message: string;
  insertedCount: number;
  duplicateCount?: number;
  duplicateLeads?: Array<{
    row: number;
    name: string;
    email: string;
    phone: string;
    reason: string;
  }>;
  note?: string;
}

// Dynamic Excel Import Types
export interface ExcelSheetInfo {
  name: string;
  rowCount: number;
  columnHeaders: string[];
  hasData: boolean;
}

export interface ExcelFileAnalysis {
  fileName: string;
  fileSize: number;
  sheets: ExcelSheetInfo[];
  uploadedAt: string;
}

export interface FieldMapping {
  leadField: string;
  excelColumn: string;
  isRequired: boolean;
  defaultValue?: string;
}

export interface NoteMapping {
  excelColumns: string[];
  isRequired: boolean;
}

export interface SheetPreviewData {
  headers: string[];
  sampleRows: any[][];
  totalRows: number;
}

export interface DynamicImportRequest {
  fileName: string;
  sheetName: string;
  fieldMappings: FieldMapping[];
  noteMappings?: NoteMapping[];
  skipEmptyRows: boolean;
  startFromRow: number;
}

export interface LeadFieldDefinition {
  name: string;
  label: string;
  type: string;
  required: boolean;
  description: string;
  options?: string[];
  defaultValue?: string;
}

export interface ImportProgress {
  isImporting: boolean;
  progress: number;
  currentStep: string;
  totalRows: number;
  processedRows: number;
}

// Filter Types
export interface LeadFilters {
  status?: LeadStatus[];
  source?: LeadSource[];
  priority?: LeadPriority[];
  assignedTo?: string[];
  folder?: string[];
  date?: string;
  fromDate?: string;
  toDate?: string;
  createdFromDate?: string;
  createdToDate?: string;
  modifiedFromDate?: string;
  modifiedToDate?: string;
  lastContactedFromDate?: string;
  lastContactedToDate?: string;
  dateField?: 'createdAt' | 'updatedAt' | 'lastContactedAt';
  timezoneOffsetMinutes?: string;
  dateRange?: {
    from: string;
    to: string;
  };
  search?: string;
}

// Sidebar Navigation Type
export interface NavItem {
  name: string;
  href: string;
  icon: any;
  adminOnly?: boolean;
  target?: string; // Add this line with the '?' to make it optional
}
