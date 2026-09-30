import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { leadApi, userApi, statusApi } from '../lib/api';
import type { Lead, LeadStatus, LeadSource, LeadPriority, LeadFilters, User } from '../types';
import { defaultStatusOptions, type ReturnState } from './LeadDetails';
import LeadWhatsAppButton from '../components/LeadWhatsAppButton';
import QuickLeadSearch from '../components/QuickLeadSearch';
import StatusReminderDialog from '../components/StatusReminderDialog';
import {
  getLeadThreeDateRangesFilterSummary,
  toLeadCreatedModifiedAndLastContactedDateParams,
  type DateFilterState
} from '../lib/dateFilters';
import { statusNeedsReminder, type StatusReminderSchedule } from '../lib/statusReminder';
import { 
  Search, 
  Filter,
  Plus,
  Eye,
  Trash2,
  UserPlus,
  Phone,
  Mail,
  Calendar,
  RefreshCw,
  FolderOpen,
  Link2,
  ArrowLeft,
  Target,
  Settings,
  CheckCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';

const AllLeads: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const returnState = location.state as ReturnState | null;

  const initialPage = Number.parseInt(searchParams.get('page') || '', 10) || returnState?.currentPage || 1;
  const initialPageSize = Number.parseInt(searchParams.get('size') || '', 10) || returnState?.leadsPerPage || 10;
  const initialSearch = searchParams.get('search') || returnState?.searchQuery || '';

  const isStatusName = (val?: string | null): boolean => {
    if (!val) return false;
    return (defaultStatusOptions as string[]).includes(val);
  };

  const rawStatus = searchParams.get('statusFilter') || searchParams.get('status');
  const urlFolderParam = searchParams.get('folder') || searchParams.get('folderFilter');
  const returnFolderCandidate = returnState?.filters?.folder?.[0] || returnState?.folderFilter || returnState?.selectedFolder;

  const isUrlFolderStatus = Boolean(urlFolderParam) && (urlFolderParam === rawStatus || isStatusName(urlFolderParam));
  const isReturnFolderStatus = Boolean(returnFolderCandidate) && isStatusName(returnFolderCandidate);

  const initialStatuses: LeadStatus[] = rawStatus
    ? (rawStatus.split(',').filter(Boolean) as LeadStatus[])
    : isUrlFolderStatus && urlFolderParam
    ? [urlFolderParam as LeadStatus]
    : (returnState?.filters?.status as LeadStatus[]) ||
      (returnState?.statusFilter ? [returnState.statusFilter as LeadStatus] : []) ||
      (isReturnFolderStatus && returnFolderCandidate ? [returnFolderCandidate as LeadStatus] : []);

  const rawFolderCandidate = (!isUrlFolderStatus && urlFolderParam)
    ? urlFolderParam
    : (!isReturnFolderStatus && returnFolderCandidate)
    ? returnFolderCandidate
    : null;

  const initialFolder = (rawFolderCandidate && !isStatusName(rawFolderCandidate)) ? rawFolderCandidate : null;

  const rawSources = searchParams.get('sourceFilter');
  const initialSources = rawSources
    ? (rawSources.split(',').filter(Boolean) as LeadSource[])
    : (returnState?.filters?.source as LeadSource[]) || [];

  const rawPriorities = searchParams.get('priorityFilter');
  const initialPriorities = rawPriorities
    ? (rawPriorities.split(',').filter(Boolean) as LeadPriority[])
    : (returnState?.filters?.priority as LeadPriority[]) || [];

  const rawAssigned = searchParams.get('assignedTo');
  const initialAssigned = rawAssigned
    ? rawAssigned.split(',').filter(Boolean)
    : returnState?.filters?.assignedTo || [];

  const initialCreatedFrom =
    searchParams.get('createdFromDate') ||
    searchParams.get('createdFrom') ||
    returnState?.createdDateRange?.fromDate ||
    returnState?.createdFromDate ||
    '';
  const initialCreatedTo =
    searchParams.get('createdToDate') ||
    searchParams.get('createdTo') ||
    returnState?.createdDateRange?.toDate ||
    returnState?.createdToDate ||
    '';
  const initialModifiedFrom =
    searchParams.get('modifiedFromDate') ||
    searchParams.get('modifiedFrom') ||
    returnState?.modifiedDateRange?.fromDate ||
    returnState?.modifiedFromDate ||
    '';
  const initialModifiedTo =
    searchParams.get('modifiedToDate') ||
    searchParams.get('modifiedTo') ||
    returnState?.modifiedDateRange?.toDate ||
    returnState?.modifiedToDate ||
    '';
  const initialLastContactedFrom =
    searchParams.get('lastContactedFromDate') ||
    returnState?.lastContactedDateRange?.fromDate ||
    returnState?.lastContactedFromDate ||
    '';
  const initialLastContactedTo =
    searchParams.get('lastContactedToDate') ||
    returnState?.lastContactedDateRange?.toDate ||
    returnState?.lastContactedToDate ||
    '';

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [appliedSearchQuery, setAppliedSearchQuery] = useState(initialSearch);
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(Number.isFinite(initialPage) && initialPage > 1 ? initialPage : 1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLeads, setTotalLeads] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [deleteLead, setDeleteLead] = useState<Lead | null>(null);
  const [availableFolders, setAvailableFolders] = useState<string[]>([]);
  const [currentView, setCurrentView] = useState<'folders' | 'leads'>(() => {
    if (returnState?.currentView) return returnState.currentView as 'folders' | 'leads';
    if (initialFolder || initialStatuses.length > 0 || searchParams.get('view') === 'leads') return 'leads';
    return 'folders';
  });
  const [selectedFolder, setSelectedFolder] = useState<string | null>(() => {
    return initialFolder || initialStatuses[0] || returnState?.selectedFolder || null;
  });
  const [folderStats, setFolderStats] = useState<Record<string, number>>({});
  const [statusStats, setStatusStats] = useState<Record<string, number>>({});
  const [leadsPerPage, setLeadsPerPage] = useState(
    [10, 25, 50, 100].includes(initialPageSize) ? initialPageSize : 10
  );
  const [users, setUsers] = useState<User[]>([]);
  const [statusOptions, setStatusOptions] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<string>('');
  const [bulkAssignee, setBulkAssignee] = useState<string>('');
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [createdDateRange, setCreatedDateRange] = useState<DateFilterState>({
    fromDate: initialCreatedFrom,
    toDate: initialCreatedTo
  });
  const [modifiedDateRange, setModifiedDateRange] = useState<DateFilterState>({
    fromDate: initialModifiedFrom,
    toDate: initialModifiedTo
  });
  const [lastContactedDateRange, setLastContactedDateRange] = useState<DateFilterState>({
    fromDate: initialLastContactedFrom,
    toDate: initialLastContactedTo
  });
  const [pendingBulkReminderStatus, setPendingBulkReminderStatus] = useState<LeadStatus | null>(null);

  const safeReturnFolders = (returnState?.filters?.folder || []).filter(
    (f: string) => Boolean(f) && !isStatusName(f)
  );

  // Filter states
  const [filters, setFilters] = useState<LeadFilters>({
    status: initialStatuses,
    source: initialSources,
    priority: initialPriorities,
    assignedTo: initialAssigned,
    folder: initialFolder ? [initialFolder] : safeReturnFolders
  });

  const sourceOptions: LeadSource[] = [
    'Website',
    'Social Media',
    'Referral',
    'Import',
    'Manual',
    'Cold Call',
    'Email Campaign',
    'strategy_call_modal',
    'data_analytics_landing_page',
    'Meta'
  ];

  const priorityOptions: LeadPriority[] = ['High', 'Medium', 'Low'];
  const assignedToOptions = users.map(user => ({ id: user._id, name: user.name, email: user.email }));
  const getDateFilters = () =>
    toLeadCreatedModifiedAndLastContactedDateParams(
      createdDateRange,
      modifiedDateRange,
      lastContactedDateRange
    );

  useEffect(() => {
    if (currentView === 'folders') {
      fetchFolders();
    } else {
      fetchLeads();
    }
  }, [
    currentPage,
    filters,
    currentView,
    leadsPerPage,
    appliedSearchQuery,
    createdDateRange,
    modifiedDateRange,
    lastContactedDateRange
  ]);

  useEffect(() => {
    fetchUsers();
    fetchStatuses();
  }, []);

  useEffect(() => {
    // If URL has duplicate folder param matching a status, clean it from the URL
    if (isUrlFolderStatus && searchParams.has('folder')) {
      const cleanParams = new URLSearchParams(location.search);
      cleanParams.delete('folder');
      cleanParams.delete('folderFilter');
      if (urlFolderParam && !cleanParams.has('statusFilter') && !cleanParams.has('status')) {
        cleanParams.set('statusFilter', urlFolderParam);
      }
      navigate(`${location.pathname}?${cleanParams.toString()}`, { replace: true });
    }
  }, []);

  const updateUrlParams = (updates: Record<string, string | null | undefined>) => {
    const params = new URLSearchParams(location.search);
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === undefined || value === '') {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    const qs = params.toString();
    navigate(qs ? `${location.pathname}?${qs}` : location.pathname, { replace: true });
  };

  const handleDateChange = (
    type: 'created' | 'modified' | 'lastContacted',
    field: 'fromDate' | 'toDate',
    value: string
  ) => {
    const nextCreated = type === 'created' ? { ...createdDateRange, [field]: value } : createdDateRange;
    const nextModified = type === 'modified' ? { ...modifiedDateRange, [field]: value } : modifiedDateRange;
    const nextLastContacted =
      type === 'lastContacted' ? { ...lastContactedDateRange, [field]: value } : lastContactedDateRange;

    if (type === 'created') setCreatedDateRange(nextCreated);
    if (type === 'modified') setModifiedDateRange(nextModified);
    if (type === 'lastContacted') setLastContactedDateRange(nextLastContacted);
    setCurrentPage(1);
    setSelectedLeads([]);

    updateUrlParams({
      createdFromDate: nextCreated.fromDate || null,
      createdToDate: nextCreated.toDate || null,
      createdFrom: null,
      createdTo: null,
      modifiedFromDate: nextModified.fromDate || null,
      modifiedToDate: nextModified.toDate || null,
      modifiedFrom: null,
      modifiedTo: null,
      lastContactedFromDate: nextLastContacted.fromDate || null,
      lastContactedToDate: nextLastContacted.toDate || null,
      page: null
    });
  };

  const handleClearDates = () => {
    setCreatedDateRange({ fromDate: '', toDate: '' });
    setModifiedDateRange({ fromDate: '', toDate: '' });
    setLastContactedDateRange({ fromDate: '', toDate: '' });
    setCurrentPage(1);
    setSelectedLeads([]);

    updateUrlParams({
      createdFromDate: null,
      createdToDate: null,
      createdFrom: null,
      createdTo: null,
      modifiedFromDate: null,
      modifiedToDate: null,
      modifiedFrom: null,
      modifiedTo: null,
      lastContactedFromDate: null,
      lastContactedToDate: null,
      page: null
    });
  };

  const fetchStatuses = async () => {
    try {
      const response = await statusApi.getStatuses();
      if (response.success && response.data) {
        setStatusOptions(response.data.map(s => s.name));
      }
    } catch (error) {
      console.error('Error fetching statuses:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await userApi.getAllUsers();
      if (response.success && response.data) {
        setUsers(response.data.filter((employee) => employee.isActive));
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };


  const fetchFolders = async () => {
    try {
      setLoading(true);
      
      // 1. Call the single optimized API that returns both folder and status stats
      const response = await leadApi.getFolderCountForAdmin(getDateFilters()); 
      
      if (response.success && response.data) {
        // Cast to any to handle the specific backend structure we built
        const apiData = response.data as any;
        
        const folderData: Record<string, number> = apiData.folderStats || {};
        const statusData: Record<string, number> = apiData.statusStats || {};
  
        // 2. Set Stats (Uncategorized now contains the TOTAL count from backend)
        setFolderStats(folderData);
        setStatusStats(statusData);
  
        // 3. Update the folder list for UI tabs/dropdowns
        // We sort them but ensure 'Uncategorized' (the Total) stays at the very top
        const sortedFolders = Object.keys(folderData).sort((a, b) => {
          if (a === 'Uncategorized') return -1;
          if (b === 'Uncategorized') return 1;
          return a.localeCompare(b);
        });
        
        setAvailableFolders(sortedFolders);
      }
    } catch (error) {
      console.error('Error fetching folders/stats:', error);
      toast.error('Failed to load folders and statistics');
    } finally {
      setLoading(false);
    }
  };



  const fetchLeads = async () => {
    try {
      setLoading(true);
      const cleanFolder = (filters.folder || []).filter(f => Boolean(f) && !isStatusName(f));
      const searchFilters: LeadFilters = {
        ...filters,
        folder: cleanFolder,
        ...getDateFilters(),
        ...(appliedSearchQuery ? { search: appliedSearchQuery } : {})
      };
      if (!searchFilters.folder || searchFilters.folder.length === 0) {
        delete searchFilters.folder;
      }
      const response = await leadApi.getLeads(searchFilters, currentPage, leadsPerPage);
      
      if (response.success) {
        setLeads(response.data);
        if (response.pagination) {
          setTotalPages(response.pagination.totalPages);
          setTotalLeads(response.pagination.total);
        }
      } else {
        toast.error(response.message || 'Failed to fetch leads');
      }
    } catch (error) {
      toast.error('Failed to fetch leads');
    } finally {
      setLoading(false);
    }
  };
  const handleFilterChange = (filterType: keyof LeadFilters, value: any) => {
    const updatedValues = Array.isArray(filters[filterType]) 
      ? (filters[filterType] as any[]).includes(value)
        ? (filters[filterType] as any[]).filter(item => item !== value)
        : [...(filters[filterType] as any[]), value]
      : [value];

    setFilters(prev => ({
      ...prev,
      [filterType]: updatedValues
    }));
    setCurrentPage(1);
    setSelectedLeads([]);

    const paramMap: Partial<Record<keyof LeadFilters, string>> = {
      status: 'statusFilter',
      source: 'sourceFilter',
      priority: 'priorityFilter',
      assignedTo: 'assignedTo',
      folder: 'folder'
    };
    const paramKey = paramMap[filterType];
    if (paramKey) {
      updateUrlParams({
        [paramKey]: updatedValues.length > 0 ? updatedValues.join(',') : null,
        page: null
      });
    }
  };

  const clearFilters = () => {
    // Preserve folder/status filter if we're in a folder view
    const preservedFolder = selectedFolder ? filters.folder : [];
    const preservedStatus = (selectedFolder && statusOptions.includes(selectedFolder as LeadStatus)) ? [selectedFolder as LeadStatus] : [];
    setFilters({ status: preservedStatus, source: [], priority: [], assignedTo: [], folder: preservedFolder });
    setCreatedDateRange({ fromDate: '', toDate: '' });
    setModifiedDateRange({ fromDate: '', toDate: '' });
    setLastContactedDateRange({ fromDate: '', toDate: '' });
    setSearchQuery('');
    setAppliedSearchQuery('');
    setCurrentPage(1);
    setSelectedLeads([]);

    updateUrlParams({
      sourceFilter: null,
      priorityFilter: null,
      assignedTo: null,
      search: null,
      page: null,
      createdFromDate: null,
      createdToDate: null,
      createdFrom: null,
      createdTo: null,
      modifiedFromDate: null,
      modifiedToDate: null,
      modifiedFrom: null,
      modifiedTo: null,
      lastContactedFromDate: null,
      lastContactedToDate: null
    });
  };

  const handleFolderSelect = (folder: string) => {
    setSelectedFolder(folder);
    if (folder === 'Uncategorized') {
      setFilters(prev => ({ ...prev, folder: ['Uncategorized'], status: [] }));
    } else {
      setFilters(prev => ({ ...prev, folder: [folder], status: [] }));
    }
    setCurrentView('leads');
    setSearchQuery('');
    setAppliedSearchQuery('');
    setCurrentPage(1);
    setSelectedLeads([]);

    updateUrlParams({
      folder,
      folderFilter: null,
      statusFilter: null,
      status: null,
      search: null,
      page: null
    });
  };

  const handleStatusSelect = (status: LeadStatus) => {
    setSelectedFolder(status);
    setCurrentView('leads');
    setFilters(prev => ({ ...prev, status: [status], folder: [] }));
    setSearchQuery('');
    setAppliedSearchQuery('');
    setCurrentPage(1);
    setSelectedLeads([]);

    updateUrlParams({
      statusFilter: status,
      status: null,
      folder: null,
      folderFilter: null,
      search: null,
      page: null
    });
  };

  const handleBackToFolders = () => {
    setCurrentView('folders');
    setSelectedFolder(null);
    setFilters({ status: [], source: [], priority: [], assignedTo: [], folder: [] });
    setSearchQuery('');
    setAppliedSearchQuery('');
    setCurrentPage(1);
    setSelectedLeads([]);

    updateUrlParams({
      folder: null,
      folderFilter: null,
      statusFilter: null,
      status: null,
      search: null,
      page: null,
      sourceFilter: null,
      priorityFilter: null,
      assignedTo: null
    });
  };

  const openLeadDetails = (leadId: string) => {
    const cleanFolder = (filters.folder || []).filter(f => Boolean(f) && !isStatusName(f));
    const sanitizedFilters = {
      ...filters,
      folder: cleanFolder
    };
    navigate(`/leads/${leadId}`, {
      state: {
        returnTo: location.pathname + location.search,
        returnSearch: location.search,
        currentPage,
        leadsPerPage,
        filters: sanitizedFilters,
        searchQuery: appliedSearchQuery || searchQuery,
        currentView,
        selectedFolder: isStatusName(selectedFolder) ? null : selectedFolder,
        statusFilter: isStatusName(selectedFolder) ? selectedFolder : (filters.status?.[0] || undefined),
        createdDateRange,
        modifiedDateRange,
        lastContactedDateRange
      }
    });
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    setSelectedLeads([]);
    updateUrlParams({ page: page > 1 ? page.toString() : null });
  };

  const handlePageSizeChange = (newPageSize: number) => {
    setLeadsPerPage(newPageSize);
    setCurrentPage(1);
    setSelectedLeads([]);
    updateUrlParams({ size: newPageSize !== 10 ? newPageSize.toString() : null, page: null });
  };

  const handleSelectLead = (leadId: string) => {
    if (leads.find((lead) => lead._id === leadId)?.isRetargeting) return;
    setSelectedLeads(prev =>
      prev.includes(leadId)
        ? prev.filter(id => id !== leadId)
        : [...prev, leadId]
    );
  };

  const handleSelectAll = () => {
    const selectableLeadIds = leads.filter((lead) => !lead.isRetargeting).map((lead) => lead._id);
    setSelectedLeads(
      selectedLeads.length === selectableLeadIds.length && selectableLeadIds.length > 0
        ? [] 
        : selectableLeadIds
    );
  };

  const handleDeleteLead = async (lead: Lead) => {
    setDeleteLead(lead);
  };

  const confirmDeleteLead = async () => {
    if (!deleteLead) return;

    try {
      if (deleteLead._id === 'bulk') {
        // Bulk delete multiple leads
        const deletePromises = selectedLeads.map(leadId => leadApi.deleteLead(leadId));
        await Promise.all(deletePromises);
        
        toast.success(`${selectedLeads.length} lead${selectedLeads.length > 1 ? 's' : ''} deleted successfully`);
        setSelectedLeads([]); // Clear selection
        fetchLeads(); // Refresh the leads list
        setDeleteLead(null);
      } else {
        // Single lead deletion
        const response = await leadApi.deleteLead(deleteLead._id);
        if (response.success) {
          toast.success('Lead deleted successfully');
          fetchLeads(); // Refresh the leads list
          setDeleteLead(null);
        } else {
          toast.error(response.message || 'Failed to delete lead');
        }
      }
    } catch (error) {
      toast.error('Failed to delete lead(s)');
    }
  };

  const getStatusColor = (status: LeadStatus): string => {
    const colors: Record<LeadStatus, string> = {
      'New': 'bg-blue-100 text-blue-800',
      'Contacted': 'bg-yellow-100 text-yellow-800', 
      'Interested': 'bg-green-100 text-green-800',
      'Not Interested': 'bg-red-100 text-red-800',
      'Follow-up': 'bg-orange-100 text-orange-800',
      'Qualified': 'bg-purple-100 text-purple-800',
      'Proposal Sent': 'bg-indigo-100 text-indigo-800',
      'Negotiating': 'bg-pink-100 text-pink-800',
      'Sales Done': 'bg-teal-100 text-teal-800',
      'DNP': 'bg-slate-100 text-slate-800',
      'Wrong Number': 'bg-gray-100 text-gray-800',
      'Call Back': 'bg-cyan-100 text-cyan-800' // Added this line
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const handleBulkLeadAction = async (statusReminder?: StatusReminderSchedule) => {
    if (selectedLeads.length === 0) {
      toast.error('Please select leads to update');
      return false;
    }

    if (!bulkStatus && !bulkAssignee) {
      toast.error('Choose a status, an assignee, or unassign selected leads');
      return false;
    }

    if (bulkStatus && statusNeedsReminder(bulkStatus) && !statusReminder) {
      setPendingBulkReminderStatus(bulkStatus);
      return false;
    }

    setUpdatingStatus(true);

    try {
      const completedActions: string[] = [];

      if (bulkAssignee) {
        const assignmentResponse =
          bulkAssignee === '__unassign__'
            ? await leadApi.unassignLeads({ leadIds: selectedLeads })
            : await leadApi.assignLeads({ leadIds: selectedLeads, assignToUserId: bulkAssignee });

        if (!assignmentResponse.success) {
          toast.error(assignmentResponse.message || 'Failed to update lead assignment');
          return false;
        }

        completedActions.push(bulkAssignee === '__unassign__' ? 'unassigned' : 'assigned');
      }

      if (bulkStatus) {
        const response = await leadApi.bulkUpdateStatus(selectedLeads, bulkStatus, statusReminder);

        if (!response.success) {
          toast.error(response.message || 'Failed to update lead statuses');
          return false;
        }

        completedActions.push(`status changed to "${bulkStatus}"`);
      }

      toast.success(`${selectedLeads.length} lead${selectedLeads.length !== 1 ? 's' : ''} ${completedActions.join(' and ')}`);
      setSelectedLeads([]);
      setBulkStatus('');
      setBulkAssignee('');
      fetchLeads(); // Refresh the leads list
      return true;
    } catch (error) {
      toast.error('Failed to update selected leads');
      return false;
    } finally {
      setUpdatingStatus(false);
    }
  };

  const confirmBulkStatusReminder = async (schedule: StatusReminderSchedule) => {
    const updated = await handleBulkLeadAction(schedule);
    if (updated) {
      setPendingBulkReminderStatus(null);
      window.dispatchEvent(new Event('reminders:refresh'));
    }
  };

  const getPriorityRowColor = (priority: LeadPriority): string => {
    const colors: Record<LeadPriority, string> = {
      'High': 'bg-red-50 hover:bg-red-100 border-l-4 border-l-red-500',
      'Medium': 'bg-yellow-50 hover:bg-yellow-100 border-l-4 border-l-yellow-500',
      'Low': 'bg-green-50 hover:bg-green-100 border-l-4 border-l-green-500'
    };
    return colors[priority];
  };

  const isInitialLoading =
    loading &&
    (currentView === 'folders'
      ? availableFolders.length === 0 && Object.keys(statusStats).length === 0
      : leads.length === 0);

  if (isInitialLoading) {
    return (
      <div className="page-stack">
        <div className="page-header">
          <div className="w-full max-w-xl">
            <div className="skeleton skeleton-line mb-4 w-36" />
            <div className="skeleton mb-3 h-9 w-72" />
            <div className="skeleton skeleton-line w-full" />
          </div>
        </div>
        <div className="metric-grid">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="metric-card">
              <div className="skeleton skeleton-line mb-5 w-28" />
              <div className="skeleton mb-4 h-8 w-20" />
              <div className="skeleton skeleton-line w-32" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="page-stack">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            {currentView === 'leads' && (
              <button
                onClick={handleBackToFolders}
                className="btn btn-outline btn-sm"
                title="Back to folders"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <h1 className="text-3xl font-bold text-gray-900">
              {currentView === 'folders' ? 'All Leads' : `Leads in "${selectedFolder}"`}
            </h1>
          </div>
          <p className="text-gray-600 mt-2">
            {currentView === 'folders' 
              ? (user?.role === 'admin' 
                  ? 'Organize your leads by folders' 
                  : 'Browse leads organized in folders'
                )
              : (user?.role === 'admin' 
                  ? `Manage leads in the "${selectedFolder}" folder` 
                  : `View and manage your assigned leads in "${selectedFolder}"`
                )
            }
            {currentView === 'leads' && totalLeads > 0 && (
              <span className="ml-2 text-sm">
                ({totalLeads} leads{totalPages > 1 ? `, page ${currentPage} of ${totalPages}` : ''})
              </span>
            )}
          </p>
        </div>
        <QuickLeadSearch className="w-full sm:max-w-lg" />


      
        <div className="flex items-center gap-3">
          {user?.role === 'admin' && currentView === 'folders' && (
            
            <button
              onClick={() => navigate('/statuses')}
              className="btn btn-secondary"
              style={{ border: '1px solid #d1d5db' }}
            >
              <Settings className="w-4 h-4" />
              Manage Statuses
            </button>
          )}
          {currentView === 'leads' && (
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="btn btn-secondary"
            >
              <Filter className="w-4 h-4" />
              Filters
            </button>
          )}
          <a href="/leads/new" className="btn btn-primary">
            <Plus className="w-4 h-4" />
            Add Lead
          </a>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-[repeat(6,minmax(0,1fr))_auto] xl:items-end">
            <div>
              <label className="form-label">Created From</label>
              <input
                type="date"
                value={createdDateRange.fromDate}
                max={createdDateRange.toDate || undefined}
                onChange={(event) => handleDateChange('created', 'fromDate', event.target.value)}
                className="form-input"
              />
            </div>
            <div>
              <label className="form-label">Created To</label>
              <input
                type="date"
                value={createdDateRange.toDate}
                min={createdDateRange.fromDate || undefined}
                onChange={(event) => handleDateChange('created', 'toDate', event.target.value)}
                className="form-input"
              />
            </div>
            <div>
              <label className="form-label">Modified From</label>
              <input
                type="date"
                value={modifiedDateRange.fromDate}
                max={modifiedDateRange.toDate || undefined}
                onChange={(event) => handleDateChange('modified', 'fromDate', event.target.value)}
                className="form-input"
              />
            </div>
            <div>
              <label className="form-label">Modified To</label>
              <input
                type="date"
                value={modifiedDateRange.toDate}
                min={modifiedDateRange.fromDate || undefined}
                onChange={(event) => handleDateChange('modified', 'toDate', event.target.value)}
                className="form-input"
              />
            </div>
            <div>
              <label className="form-label">Last Contacted From</label>
              <input
                type="date"
                value={lastContactedDateRange.fromDate}
                max={lastContactedDateRange.toDate || undefined}
                onChange={(event) => handleDateChange('lastContacted', 'fromDate', event.target.value)}
                className="form-input"
              />
            </div>
            <div>
              <label className="form-label">Last Contacted To</label>
              <input
                type="date"
                value={lastContactedDateRange.toDate}
                min={lastContactedDateRange.fromDate || undefined}
                onChange={(event) => handleDateChange('lastContacted', 'toDate', event.target.value)}
                className="form-input"
              />
            </div>
            <button
              type="button"
              onClick={handleClearDates}
              className="btn btn-secondary"
            >
              Clear Dates
            </button>
            <div className="text-sm text-gray-500 md:col-span-2 xl:col-span-7">
              {getLeadThreeDateRangesFilterSummary(
                createdDateRange,
                modifiedDateRange,
                lastContactedDateRange
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Search Bar - Only show for leads view */}
      {currentView === 'leads' && (
        <div className="card">
          <div className="card-body">
            <form onSubmit={(e) => {
              e.preventDefault();
              setAppliedSearchQuery(searchQuery);
              setCurrentPage(1);
              updateUrlParams({ search: searchQuery || null, page: null });
            }} className="flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search leads by name, email, phone..."
                  className="form-input pl-10"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <button
                type="submit"
                className="btn btn-primary"
              >
                <Search className="w-4 h-4" />
                Search
              </button>
              <button
                type="button"
                onClick={clearFilters}
                className="btn btn-secondary"
              >
                Clear Filters
              </button>
              <button
                type="button"
                onClick={fetchLeads}
                className="btn btn-outline"
                title="Refresh"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Filters - Only show for leads view */}
      {currentView === 'leads' && showFilters && (
        <div className="card">
          <div className="card-body">
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
              {/* Status Filter */}
              <div>
                <label className="form-label">Status</label>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {statusOptions.map(status => {
                    const isSelectedFolderStatus = selectedFolder && statusOptions.includes(selectedFolder as LeadStatus) && status === selectedFolder;
                    return (
                    <label key={status} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={filters.status?.includes(status)}
                        onChange={() => handleFilterChange('status', status)}
                        disabled={!!isSelectedFolderStatus}
                        className="mr-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      <span className={`text-sm ${isSelectedFolderStatus ? 'text-gray-400' : ''}`}>{status}</span>
                    </label>
                  )})}
                </div>
              </div>

              {/* Source Filter */}
              <div>
                <label className="form-label">Source</label>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {sourceOptions.map(source => (
                    <label key={source} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={filters.source?.includes(source)}
                        onChange={() => handleFilterChange('source', source)}
                        className="mr-2"
                      />
                      <span className="text-sm">{source}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Priority Filter */}
              <div>
                <label className="form-label">Priority</label>
                <div className="space-y-2">
                  {priorityOptions.map(priority => (
                    <label key={priority} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={filters.priority?.includes(priority)}
                        onChange={() => handleFilterChange('priority', priority)}
                        className="mr-2"
                      />
                      <span className="text-sm">{priority}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Assigned To Filter */}
              <div>
                <label className="form-label">Assigned To</label>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={filters.assignedTo?.includes('unassigned')}
                      onChange={() => handleFilterChange('assignedTo', 'unassigned')}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-500">Unassigned</span>
                  </label>
                  {assignedToOptions.map(user => (
                    <label key={user.id} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={filters.assignedTo?.includes(user.id)}
                        onChange={() => handleFilterChange('assignedTo', user.id)}
                        className="mr-2"
                      />
                      <div className="flex flex-col">
                        <span className="text-sm">{user.name}</span>
                        <span className="text-xs text-gray-500">{user.email}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col justify-end">
                <button
                  onClick={clearFilters}
                  className="btn btn-secondary btn-sm mb-2"
                >
                  Clear All
                </button>
                <button
                  onClick={() => setShowFilters(false)}
                  className="btn btn-primary btn-sm"
                >
                  Apply Filters
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Status Groups and Folders */}
      {currentView === 'folders' && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">All Leads</h2>
            <p className="text-sm text-gray-600">Click on a status or folder to view leads</p>
          </div>
          <div className="card-body">
            <div className="lead-category-grid">
              {/* Status Groups - sorted by count */}
              {statusOptions
                .filter(status => (statusStats[status] || 0) > 0)
                .sort((a, b) => (statusStats[b] || 0) - (statusStats[a] || 0))
                .map(status => (
                <div
                  key={`status-${status}`}
	                  className="lead-category-card"
                  onClick={() => handleStatusSelect(status)}
                >
	                  <div className="lead-category-card__content">
	                    <div className={`lead-category-card__icon ${getStatusColor(status).replace('text-', 'bg-').split(' ')[0]}`}>
	                      <Target className="w-6 h-6 text-gray-700" />
	                    </div>
	                    <div className="lead-category-card__text">
	                      <h3 className="lead-category-card__title" title={status}>{status}</h3>
	                      <p className="text-sm text-gray-500">
                        {statusStats[status] || 0} lead{(statusStats[status] || 0) !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              
              {/* Folders - sorted by count */}
              {availableFolders
                .sort((a, b) => (folderStats[b] || 0) - (folderStats[a] || 0))
                .map(folder => (
                <div
                  key={`folder-${folder}`}
	                  className="lead-category-card"
                  onClick={() => handleFolderSelect(folder)}
                >
	                  <div className="lead-category-card__content">
	                    <div className="lead-category-card__icon bg-blue-100">
	                      <FolderOpen className="w-6 h-6 text-blue-600" />
	                    </div>
	                    <div className="lead-category-card__text">
	                      <h3 className="lead-category-card__title" title={folder}>
	                        {folder === 'Uncategorized' ? 'Uncategorized' : (folder || 'Unnamed Folder')}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {folderStats[folder] || 0} lead{(folderStats[folder] || 0) !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bulk Lead Actions Panel */}
      {currentView === 'leads' && (
        <div className="card border-l-4 border-l-blue-500">
          <div className="card-body">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-6 h-6 text-blue-600" />
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    Bulk Lead Actions
                  </h3>
                  <p className="text-gray-600">
                    {selectedLeads.length > 0 
                      ? `Manage ${selectedLeads.length} selected lead${selectedLeads.length > 1 ? 's' : ''}`
                      : 'Select leads below to assign, unassign, update status, or delete'
                    }
                  </p>
                </div>
              </div>
              {selectedLeads.length > 0 && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setSelectedLeads([])}
                  disabled={updatingStatus}
                >
                  Clear Selection
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr_auto_auto] xl:items-end">
              <div>
                <label className="form-label">Assign Lead</label>
                <select
                  value={bulkAssignee}
                  onChange={(e) => setBulkAssignee(e.target.value)}
                  className="form-input"
                  disabled={updatingStatus}
                >
                  <option value="">Keep current owner</option>
                  <option value="__unassign__">Unassign selected leads</option>
                  {assignedToOptions.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name} - {employee.email}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Update Status</label>
                <select
                  value={bulkStatus}
                  onChange={(e) => setBulkStatus(e.target.value)}
                  className="form-input"
                  disabled={updatingStatus}
                >
                  <option value="">Keep current status</option>
                  {statusOptions.map(status => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => void handleBulkLeadAction()}
                disabled={selectedLeads.length === 0 || (!bulkStatus && !bulkAssignee) || updatingStatus}
                className="btn btn-primary"
              >
                {updatingStatus ? (
                  <>
                    <div className="loading-spinner mr-2"></div>
                    Applying...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Apply Changes
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setDeleteLead({ _id: 'bulk', name: `${selectedLeads.length} leads` } as Lead)}
                className="btn btn-danger"
                disabled={selectedLeads.length === 0 || updatingStatus}
              >
                <Trash2 className="w-4 h-4" />
                Delete Selected
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leads Table */}
      {currentView === 'leads' && (
        <div className="card">
          <div className="overflow-x-auto">
          <table className="table w-full min-w-[1000px]">
            <thead>
              <tr>
                <th className="whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={
                      selectedLeads.length > 0 &&
                      selectedLeads.length === leads.filter((lead) => !lead.isRetargeting).length
                    }
                    onChange={handleSelectAll}
                  />
                </th>
                <th className="whitespace-nowrap">Lead Details</th>
                <th className="whitespace-nowrap">Contact</th>
                <th className="whitespace-nowrap">Status</th>
                <th className="whitespace-nowrap">Assigned To</th>
                <th className="whitespace-nowrap">Notes</th>
                <th className="whitespace-nowrap">Created</th>
                <th className="whitespace-nowrap">Last Contacted</th>
                <th className="whitespace-nowrap">Last Contacted By</th>
                <th className="whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {leads.map(lead => (
                <tr 
                  key={lead._id} 
                  className={`transition-colors cursor-pointer ${getPriorityRowColor(lead.priority)}`}
                  onClick={() => openLeadDetails(lead.linkedLeadId || lead._id)}
                >
                  <td className="whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedLeads.includes(lead._id)}
                      onChange={() => handleSelectLead(lead._id)}
                      disabled={lead.isRetargeting}
                      title={lead.isRetargeting ? 'Retargeting entries link to the existing lead' : undefined}
                    />
                  </td>
                  <td className="whitespace-nowrap">
                    <div>
                      <div className="flex items-center gap-2 font-medium text-gray-900">
                        {lead.name}
                        {lead.isRetargeting && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-fuchsia-100 px-2 py-0.5 text-xs font-semibold text-fuchsia-800">
                            <Link2 className="h-3 w-3" />
                            Retargeting
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500">{lead.position}</div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <div className="space-y-1">
                      <div className="flex items-center text-sm">
                        <Mail className="w-3 h-3 text-gray-400 mr-1" />
                        <a 
                          href={`mailto:${lead.email}`}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          {lead.email}
                        </a>
                      </div>
                      <div className="flex items-center text-sm">
                        <Phone className="w-3 h-3 text-gray-400 mr-1" />
                        <a 
                          href={`tel:${lead.phone}`}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          {lead.phone}
                        </a>
                      </div>
                      <div className="flex items-center text-sm">
                        <LeadWhatsAppButton lead={lead} />
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap">
                    <span className={`badge ${getStatusColor(lead.status)}`}>
                      {lead.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap">
                    {lead.assignedToUser ? (
                      <div className="text-sm">
                        <div className="font-medium">{lead.assignedToUser.name}</div>
                        <div className="text-gray-500">{lead.assignedToUser.email}</div>
                      </div>
                    ) : (
                      <span className="text-gray-400 text-sm">Unassigned</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap max-w-xs">
                    {lead.notes && lead.notes.length > 0 ? (
                      <div className="text-sm">
                        <div className="text-gray-700 truncate max-w-[200px]" title={lead.notes[lead.notes.length - 1].content}>
                          {lead.notes[lead.notes.length - 1].content}
                        </div>
                        <div className="text-xs text-gray-500">
                          {lead.notes.length} note{lead.notes.length > 1 ? 's' : ''} - {new Date(lead.notes[lead.notes.length - 1].createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    ) : (
                      <span className="text-gray-400 text-sm">No notes</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap">
                    <div className="flex items-center text-sm text-gray-500">
                      <Calendar className="w-3 h-3 mr-1" />
                      {new Date(lead.createdAt).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="whitespace-nowrap">
                    {lead.lastContactedAt ? (
                      <div className="flex items-center text-sm text-gray-500">
                        <Calendar className="w-3 h-3 mr-1" />
                        {new Date(lead.lastContactedAt).toLocaleString()}
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">Not contacted</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap">
                    {lead.lastContactedByUser || lead.lastContactedByName ? (
                      <div className="text-sm">
                        <div className="font-medium">
                          {lead.lastContactedByUser?.name || lead.lastContactedByName}
                        </div>
                        {(lead.lastContactedByUser?.email || lead.lastContactedByEmail) && (
                          <div className="text-gray-500">
                            {lead.lastContactedByUser?.email || lead.lastContactedByEmail}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openLeadDetails(lead.linkedLeadId || lead._id)}
                        className="text-blue-600 hover:text-blue-800"
                        title={lead.isRetargeting ? 'Open existing lead stages and conversation' : 'View'}
                      >
                        {lead.isRetargeting ? <Link2 className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>

                      {user?.role === 'admin' && !lead.isRetargeting && (
                        <button
                          onClick={() => handleDeleteLead(lead)}
                          className="text-red-600 hover:text-red-800"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Empty State */}
        {leads.length === 0 && !loading && (
          <div className="text-center py-12">
            <UserPlus className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No leads found</h3>
            <p className="text-gray-500 mb-4">
              {searchQuery || Object.values(filters).some(f => f && f.length > 0)
                ? 'Try adjusting your search or filters'
                : 'Get started by adding your first lead'
              }
            </p>
            <a href="/leads/new" className="btn btn-primary">
              <Plus className="w-4 h-4" />
              Add Lead
            </a>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-gray-200">
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-700">
                Showing <span className="font-medium">{(currentPage - 1) * leadsPerPage + 1}</span> to{' '}
                <span className="font-medium">
                  {Math.min(currentPage * leadsPerPage, totalLeads)}
                </span>{' '}
                of <span className="font-medium">{totalLeads}</span> leads
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">Per page:</label>
                <select
                  value={leadsPerPage}
                  onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                  className="form-input py-1 px-2 text-sm border border-gray-300 rounded-md"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                  <option value={300}>300</option>
                </select>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="btn btn-sm btn-outline"
              >
                Previous
              </button>
              
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(page => {
                  // Show first, last, current, and 2 pages around current
                  return (
                    page === 1 ||
                    page === totalPages ||
                    (page >= currentPage - 2 && page <= currentPage + 2)
                  );
                })
                .map(page => (
                  <button
                    key={page}
                    onClick={() => handlePageChange(page)}
                    className={`btn btn-sm ${
                      currentPage === page ? 'btn-primary' : 'btn-outline'
                    }`}
                  >
                    {page}
                  </button>
                ))}
              
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="btn btn-sm btn-outline"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteLead && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <Trash2 className="w-6 h-6 text-red-500" />
              <h3 className="text-lg font-semibold text-gray-900">
                {deleteLead._id === 'bulk' ? 'Delete Multiple Leads' : 'Delete Lead'}
              </h3>
            </div>
            <p className="text-gray-600 mb-6">
              {deleteLead._id === 'bulk' 
                ? `Are you sure you want to delete ${selectedLeads.length} selected lead${selectedLeads.length > 1 ? 's' : ''}? This action cannot be undone.`
                : `Are you sure you want to delete the lead "${deleteLead.name}"? This action cannot be undone.`
              }
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteLead(null)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteLead}
                className="btn btn-danger"
              >
                {deleteLead._id === 'bulk' ? 'Delete Selected' : 'Delete Lead'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingBulkReminderStatus && (
        <StatusReminderDialog
          status={pendingBulkReminderStatus}
          leadCount={selectedLeads.length}
          submitting={updatingStatus}
          onCancel={() => setPendingBulkReminderStatus(null)}
          onConfirm={confirmBulkStatusReminder}
        />
      )}

    </div>
  );
};

export default AllLeads;
