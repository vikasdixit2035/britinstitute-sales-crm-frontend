import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { leadApi, statusApi, userApi, zoomPhoneApi } from '../lib/api';
import type {
  Lead,
  LeadPriority,
  LeadSource,
  LeadStatus,
  User as AppUser,
  ZoomPhoneCallLog,
  ZoomPhoneRecording,
  ZoomPhoneStatus
} from '../types';
import LeadWhatsAppButton from '../components/LeadWhatsAppButton';
import StatusReminderDialog from '../components/StatusReminderDialog';
import { statusNeedsReminder, type StatusReminderSchedule } from '../lib/statusReminder';
import { getLeadMetaAttributes } from '../lib/metaAttributes';
import type { DateFilterState } from '../lib/dateFilters';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  Clock,
  Copy,
  Download,
  Edit,
  FileText,
  Headphones,
  Mail,
  MessageSquare,
  Phone,
  PlayCircle,
  Plus,
  RefreshCw,
  Save,
  UserPlus,
  X
} from 'lucide-react';
import toast from 'react-hot-toast';
import { reminderApi } from '../lib/reminderApi';

type LeadDetailTab = 'activity' | 'calls' | 'tasks';

export interface ReturnState {
  returnTo?: string;
  returnSearch?: string;
  currentPage?: number;
  leadsPerPage?: number;
  searchQuery?: string;
  currentView?: string;
  selectedFolder?: string;
  statusFilter?: string;
  folderFilter?: string;
  filters?: {
    status?: string[];
    source?: string[];
    priority?: string[];
    folder?: string[];
    assignedTo?: string[];
  };
  createdDateRange?: DateFilterState;
  modifiedDateRange?: DateFilterState;
  createdFromDate?: string;
  createdToDate?: string;
  modifiedFromDate?: string;
  modifiedToDate?: string;
  lastContactedDateRange?: DateFilterState;
  lastContactedFromDate?: string;
  lastContactedToDate?: string;
}

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

const priorityOptions: LeadPriority[] = ['High', 'Medium', 'Low'];

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

const formatSource = (source: string) =>
  source
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const statusTone = (status: LeadStatus) => {
  const normalized = status.toLowerCase();
  if (['sales done', 'qualified', 'interested'].includes(normalized)) return 'status-pill status-pill--green';
  if (['follow-up', 'call back', 'contacted'].includes(normalized)) return 'status-pill status-pill--amber';
  if (['not interested', 'wrong number', 'dnp'].includes(normalized)) return 'status-pill status-pill--rose';
  return 'status-pill status-pill--blue';
};

const priorityTone = (priority: LeadPriority) => {
  if (priority === 'High') return 'text-rose-600 bg-rose-50 border-rose-200';
  if (priority === 'Medium') return 'text-amber-700 bg-amber-50 border-amber-200';
  return 'text-green-700 bg-green-50 border-green-200';
};

const formatCallDate = (value?: string) => {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const formatDuration = (seconds?: number) => {
  if (!seconds || seconds <= 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

const callLogId = (call: ZoomPhoneCallLog) => call.id || call.call_id || call.recording_id || '';

const recordingId = (recording: ZoomPhoneRecording) =>
  recording.id || recording.call_id || recording.call_log_id || recording.call_history_id || recording.call_element_id || '';

const callIdentityValues = (call: ZoomPhoneCallLog) =>
  [call.id, call.call_id, call.recording_id].filter((value): value is string => Boolean(value));

const recordingIdentityValues = (recording: ZoomPhoneRecording) =>
  [recording.id, recording.call_id, recording.call_log_id, recording.call_history_id, recording.call_element_id].filter(
    (value): value is string => Boolean(value)
  );

const recordingBelongsToCall = (call: ZoomPhoneCallLog, recording: ZoomPhoneRecording) => {
  const callValues = callIdentityValues(call);
  const recordingValues = recordingIdentityValues(recording);

  return callValues.some((callValue) => recordingValues.includes(callValue));
};

const defaultCallDateRange = () => {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 30);

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10)
  };
};

const LeadDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const [lead, setLead] = useState<Lead | null>(null);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pipelineSavingField, setPipelineSavingField] = useState<'status' | 'priority' | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<LeadDetailTab>('activity');
  const [profileInfoTab, setProfileInfoTab] = useState<'profile' | 'company'>('profile');
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [selectedAssignee, setSelectedAssignee] = useState('');
  const [showReminderForm, setShowReminderForm] = useState(false);
  const [reminderTitle, setReminderTitle] = useState('');
  const [reminderNote, setReminderNote] = useState('');
  const [remindAt, setRemindAt] = useState('');
  const [callDateRange, setCallDateRange] = useState(defaultCallDateRange);
  const [zoomStatus, setZoomStatus] = useState<ZoomPhoneStatus | null>(null);
  const [zoomCalls, setZoomCalls] = useState<ZoomPhoneCallLog[]>([]);
  const [zoomRecordings, setZoomRecordings] = useState<ZoomPhoneRecording[]>([]);
  const [zoomLoading, setZoomLoading] = useState(false);
  const [zoomError, setZoomError] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [activeRecordingId, setActiveRecordingId] = useState('');
  const [audioLoadingId, setAudioLoadingId] = useState('');
  const [audioLoadProgress, setAudioLoadProgress] = useState(0);
  const [audioLoadStatus, setAudioLoadStatus] = useState('');
  const [statusOptions, setStatusOptions] = useState<LeadStatus[]>(defaultStatusOptions);
  const [pendingStatusReminder, setPendingStatusReminder] = useState<LeadStatus | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recordingPlayerRef = useRef<HTMLDivElement | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    whatsapp: '',
    zoomPhoneNumber: '',
    position: '',
    folder: '',
    status: 'New' as LeadStatus,
    priority: 'Medium' as LeadPriority,
    source: 'Manual' as LeadSource
  });

  const canManage = user?.role === 'admin';
  const canEdit = canManage || lead?.assignedTo === user?._id;
  const metaAttributes = useMemo(() => (lead ? getLeadMetaAttributes(lead) : []), [lead]);
  const olderDuplicateLead = lead?.duplicateOf;
  const olderDuplicateLeadId = typeof olderDuplicateLead === 'string'
    ? olderDuplicateLead
    : olderDuplicateLead?._id;

  const syncLeadState = (nextLead: Lead) => {
    setLead(nextLead);
    setSelectedAssignee(nextLead.assignedToUser?._id || nextLead.assignedTo || '');
    setFormData({
      name: nextLead.name || '',
      email: nextLead.email || '',
      phone: nextLead.phone || '',
      whatsapp: nextLead.whatsapp || '',
      zoomPhoneNumber: nextLead.zoomPhoneNumber || '',
      position: nextLead.position || '',
      folder: nextLead.folder || '',
      status: nextLead.status || 'New',
      priority: nextLead.priority || 'Medium',
      source: nextLead.source || 'Manual'
    });
  };

  const fetchLead = useCallback(async () => {
    if (!id) return;

    setLoading(true);
    const response = await leadApi.getLead(id);

    if (response.success && response.data) {
      syncLeadState(response.data);
    } else {
      toast.error(response.message || 'Failed to fetch lead details');
      navigate('/leads');
    }

    setLoading(false);
  }, [id, navigate]);

  const fetchUsers = useCallback(async () => {
    if (!canManage) return;
    const response = await userApi.getAllUsers();

    if (response.success && response.data) {
      setUsers(response.data.filter((item) => item.isActive));
    }
  }, [canManage]);

  const fetchStatuses = useCallback(async () => {
    const response = await statusApi.getStatuses();

    if (response.success && response.data?.length) {
      setStatusOptions(response.data.map((status) => status.name as LeadStatus));
    }
  }, []);

  useEffect(() => {
    fetchLead();
  }, [fetchLead]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    fetchStatuses();
  }, [fetchStatuses]);

  const sortedNotes = useMemo(
    () =>
      [...(lead?.notes || [])].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [lead?.notes]
  );

  const leadPhoneNumbers = useMemo(
    () => [lead?.phone, lead?.whatsapp, lead?.zoomPhoneNumber].filter(Boolean) as string[],
    [lead?.phone, lead?.whatsapp, lead?.zoomPhoneNumber]
  );

  const fetchZoomPhoneData = useCallback(async () => {
    if (!lead?._id) return;

    setZoomLoading(true);
    setZoomError('');

    const statusResponse = await zoomPhoneApi.getStatus();

    if (!statusResponse.success || !statusResponse.data) {
      setZoomError(statusResponse.message || 'Unable to check Zoom Phone configuration');
      setZoomLoading(false);
      return;
    }

    setZoomStatus(statusResponse.data);

    if (!statusResponse.data.configured) {
      setZoomCalls([]);
      setZoomRecordings([]);
      setZoomError('Zoom Phone API credentials are not configured on the backend yet.');
      setZoomLoading(false);
      return;
    }

    const query = {
      from: callDateRange.from,
      to: callDateRange.to,
      pageSize: 300
    };

    const [callsResponse, recordingsResponse] = await Promise.all([
      zoomPhoneApi.getLeadCalls(lead._id, query),
      zoomPhoneApi.getLeadRecordings(lead._id, query)
    ]);

    if (callsResponse.success && callsResponse.data) {
      setZoomCalls(callsResponse.data.call_logs || []);
    } else {
      setZoomCalls([]);
      setZoomError(callsResponse.message || 'Unable to sync Zoom Phone call history');
    }

    if (recordingsResponse.success && recordingsResponse.data) {
      setZoomRecordings(recordingsResponse.data.recordings || []);
    } else {
      setZoomRecordings([]);
      setZoomError((current) => current || recordingsResponse.message || 'Unable to sync Zoom Phone recordings');
    }

    setZoomLoading(false);
  }, [callDateRange.from, callDateRange.to, lead?._id]);

  useEffect(() => {
    if (activeTab === 'calls') {
      fetchZoomPhoneData();
    }
  }, [activeTab, fetchZoomPhoneData]);

  useEffect(() => {
    if (!audioUrl) return;

    const audio = audioRef.current;
    recordingPlayerRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });

    if (!audio) return;
    audio.load();
    const playTimer = window.setTimeout(() => {
      audio.play().catch(() => undefined);
    }, 150);

    return () => window.clearTimeout(playTimer);
  }, [audioUrl]);

  const updateLeadAudioBufferedProgress = (audio: HTMLAudioElement) => {
    if (!Number.isFinite(audio.duration) || audio.duration <= 0 || audio.buffered.length === 0) return;

    const bufferedEnd = audio.buffered.end(audio.buffered.length - 1);
    const bufferedPercent = Math.min(99, Math.max(20, Math.round((bufferedEnd / audio.duration) * 100)));
    setAudioLoadProgress(bufferedPercent);
    setAudioLoadStatus(`Buffering ${bufferedPercent}%`);
  };

  const getRecordingAudioOptions = (recording: ZoomPhoneRecording) => {
    const options: { downloadUrl?: string; callLogId?: string; from?: string; to?: string; disposition?: 'inline' | 'attachment' } = {
      from: callDateRange.from,
      to: callDateRange.to
    };
    const downloadUrl = recording.download_url || recording.file_url;

    if (downloadUrl) options.downloadUrl = downloadUrl;

    return options;
  };

  const playRecording = async (recording: ZoomPhoneRecording) => {
    if (!lead) return;
    const idForRecording = recordingId(recording);

    if (!idForRecording) {
      toast.error('This Zoom recording is missing a playback ID');
      return;
    }

    setAudioLoadingId(idForRecording);
    setAudioLoadProgress(8);
    setAudioLoadStatus('Preparing secure Zoom stream...');

    try {
      const nextAudioUrl = zoomPhoneApi.getLeadRecordingAudioUrl(
        lead._id,
        idForRecording,
        {
          ...getRecordingAudioOptions(recording),
          disposition: 'inline'
        }
      );

      setAudioUrl(() => {
        return nextAudioUrl;
      });
      setActiveRecordingId(idForRecording);
      setAudioLoadProgress(18);
      setAudioLoadStatus('Connecting to recording...');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to play Zoom recording');
      setAudioLoadStatus('Unable to load recording');
      setAudioLoadingId('');
    }
  };

  const downloadRecording = async (recording: ZoomPhoneRecording) => {
    if (!lead) return;
    const idForRecording = recordingId(recording);

    if (!idForRecording) {
      toast.error('This Zoom recording is missing a download ID');
      return;
    }

    setAudioLoadingId(idForRecording);

    try {
      const downloadUrl = zoomPhoneApi.getLeadRecordingAudioUrl(
        lead._id,
        idForRecording,
        {
          ...getRecordingAudioOptions(recording),
          disposition: 'attachment'
        }
      );
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `${lead.name.replace(/\s+/g, '-').toLowerCase()}-${idForRecording}.mp3`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to download Zoom recording');
    } finally {
      setAudioLoadingId('');
    }
  };

  const handleGoBack = () => {
    const state = location.state as ReturnState | null;

    if (state?.returnTo) {
      let targetUrl = state.returnTo;

      const safeFilters = state.filters ? {
        ...state.filters,
        folder: (state.filters.folder || []).filter(f => !(defaultStatusOptions as string[]).includes(f))
      } : undefined;

      const safeState: ReturnState = {
        ...state,
        filters: safeFilters,
        folderFilter: (state.folderFilter && !(defaultStatusOptions as string[]).includes(state.folderFilter)) ? state.folderFilter : undefined,
        selectedFolder: (state.selectedFolder && !(defaultStatusOptions as string[]).includes(state.selectedFolder)) ? state.selectedFolder : undefined,
        statusFilter: state.statusFilter || ((state.selectedFolder && (defaultStatusOptions as string[]).includes(state.selectedFolder)) ? state.selectedFolder : undefined)
      };

      if (targetUrl.includes('?')) {
        const [path, search] = targetUrl.split('?');
        const searchParams = new URLSearchParams(search);
        const folder = searchParams.get('folder') || searchParams.get('folderFilter');
        if (folder && (defaultStatusOptions as string[]).includes(folder)) {
          searchParams.delete('folder');
          searchParams.delete('folderFilter');
          if (!searchParams.has('statusFilter') && !searchParams.has('status')) {
            searchParams.set('statusFilter', folder);
          }
          const cleanQuery = searchParams.toString();
          targetUrl = cleanQuery ? `${path}?${cleanQuery}` : path;
        }
        navigate(targetUrl, { replace: true, state: safeState });
        return;
      }

      const baseSearch = state.returnSearch
        ? (state.returnSearch.startsWith('?') ? state.returnSearch.slice(1) : state.returnSearch)
        : '';
      const params = new URLSearchParams(baseSearch);

      if (state.currentPage && state.currentPage > 1) params.set('page', state.currentPage.toString());
      if (state.leadsPerPage && state.leadsPerPage !== 10) params.set('size', state.leadsPerPage.toString());
      if (state.searchQuery) params.set('search', state.searchQuery);
      if (state.statusFilter) params.set('statusFilter', state.statusFilter);
      if (state.folderFilter && !(defaultStatusOptions as string[]).includes(state.folderFilter)) {
        params.set('folderFilter', state.folderFilter);
      }
      if (state.filters?.status?.length) params.set('statusFilter', state.filters.status.join(','));
      if (state.filters?.source?.length) params.set('sourceFilter', state.filters.source.join(','));
      if (state.filters?.priority?.length) params.set('priorityFilter', state.filters.priority.join(','));
      if (state.filters?.assignedTo?.length) params.set('assignedTo', state.filters.assignedTo.join(','));
      if (
        state.filters?.folder?.length &&
        !(defaultStatusOptions as string[]).includes(state.filters.folder[0])
      ) {
        params.set('folder', state.filters.folder[0]);
      }

      const createdFrom = state.createdDateRange?.fromDate || state.createdFromDate;
      const createdTo = state.createdDateRange?.toDate || state.createdToDate;
      const modifiedFrom = state.modifiedDateRange?.fromDate || state.modifiedFromDate;
      const modifiedTo = state.modifiedDateRange?.toDate || state.modifiedToDate;
      const lastContactedFrom = state.lastContactedDateRange?.fromDate || state.lastContactedFromDate;
      const lastContactedTo = state.lastContactedDateRange?.toDate || state.lastContactedToDate;

      if (createdFrom) params.set('createdFromDate', createdFrom);
      if (createdTo) params.set('createdToDate', createdTo);
      if (modifiedFrom) params.set('modifiedFromDate', modifiedFrom);
      if (modifiedTo) params.set('modifiedToDate', modifiedTo);
      if (lastContactedFrom) params.set('lastContactedFromDate', lastContactedFrom);
      if (lastContactedTo) params.set('lastContactedToDate', lastContactedTo);

      const queryString = params.toString();
      navigate(queryString ? `${state.returnTo}?${queryString}` : state.returnTo, {
        replace: true,
        state: safeState
      });
      return;
    }

    navigate('/leads');
  };

  const handleSave = async () => {
    if (!id) return;

    setSaving(true);
    const response = await leadApi.updateLead(id, formData);

    if (response.success && response.data) {
      syncLeadState(response.data);
      setIsEditing(false);
      toast.success('Lead updated successfully');
    } else {
      toast.error(response.message || 'Failed to update lead');
    }

    setSaving(false);
  };

  const handlePipelineUpdate = async <Field extends 'status' | 'priority',>(
    field: Field,
    value: Lead[Field],
    statusReminder?: StatusReminderSchedule
  ) => {
    if (!id || !lead || !canEdit || pipelineSavingField || lead[field] === value) return false;

    if (field === 'status' && statusNeedsReminder(value as LeadStatus) && !statusReminder) {
      setPendingStatusReminder(value as LeadStatus);
      return false;
    }

    const previousValue = lead[field];
    setPipelineSavingField(field);
    setLead((current) => current ? ({ ...current, [field]: value } as Lead) : current);
    setFormData((current) => ({ ...current, [field]: value }));

    const updateData = field === 'status'
      ? { status: value as LeadStatus, statusReminder }
      : { priority: value as LeadPriority };
    const response = await leadApi.updateLead(id, updateData);

    if (response.success && response.data) {
      const savedValue = response.data[field];
      setLead(response.data);
      setFormData((current) => ({ ...current, [field]: savedValue }));
      toast.success(`${field === 'status' ? 'Status' : 'Priority'} updated`);
      setPipelineSavingField(null);
      return true;
    } else {
      setLead((current) => current ? ({ ...current, [field]: previousValue } as Lead) : current);
      setFormData((current) => ({ ...current, [field]: previousValue }));
      toast.error(response.message || `Failed to update lead ${field}`);
      setPipelineSavingField(null);
      return false;
    }
  };

  const confirmStatusReminder = async (schedule: StatusReminderSchedule) => {
    if (!pendingStatusReminder) return;

    const updated = await handlePipelineUpdate('status', pendingStatusReminder, schedule);
    if (updated) {
      setPendingStatusReminder(null);
      window.dispatchEvent(new Event('reminders:refresh'));
    }
  };

  const handleAssignLead = async () => {
    if (!lead || !selectedAssignee) {
      toast.error('Please select an employee');
      return;
    }

    setAssigning(true);
    const response = await leadApi.assignLeads({
      leadIds: [lead._id],
      assignToUserId: selectedAssignee
    });

    if (response.success) {
      toast.success('Lead assigned successfully');
      await fetchLead();
    } else {
      toast.error(response.message || 'Failed to assign lead');
    }

    setAssigning(false);
  };

  const handleUnassignLead = async () => {
    if (!lead) return;

    setAssigning(true);
    const response = await leadApi.unassignLeads({ leadIds: [lead._id] });

    if (response.success) {
      toast.success('Lead unassigned successfully');
      setSelectedAssignee('');
      await fetchLead();
    } else {
      toast.error(response.message || 'Failed to unassign lead');
    }

    setAssigning(false);
  };

  const handleAddNote = async () => {
    if (!lead || !newNote.trim()) {
      toast.error('Please enter a note');
      return;
    }

    setAddingNote(true);
    const response = await leadApi.addNote({
      leadId: lead._id,
      content: newNote.trim()
    });

    if (response.success && response.data) {
      syncLeadState(response.data);
      setNewNote('');
      toast.success('Note added successfully');
    } else {
      toast.error(response.message || 'Failed to add note');
    }

    setAddingNote(false);
  };

  const createReminder = async () => {
    if (!lead || !reminderTitle.trim() || !remindAt) {
      toast.error('Please enter title and reminder time');
      return;
    }

    const response = await reminderApi.createReminder({
      leadId: lead._id,
      title: reminderTitle.trim(),
      note: reminderNote.trim(),
      remindAt
    });

    if (response.success) {
      setShowReminderForm(false);
      setReminderTitle('');
      setReminderNote('');
      setRemindAt('');
      toast.success('Reminder set');
    } else {
      toast.error(response.message || 'Failed to set reminder');
    }
  };

  if (loading) {
    return (
      <div className="page-stack">
        <div className="skeleton h-10 w-72" />
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[320px_1fr_360px]">
          <div className="skeleton h-[560px]" />
          <div className="skeleton h-[560px]" />
          <div className="skeleton h-[560px]" />
        </div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="card mx-auto max-w-lg">
        <div className="card-body text-center">
          <AlertCircle className="mx-auto mb-3 h-12 w-12 text-gray-300" />
          <h1 className="text-xl font-extrabold text-gray-900">Lead not found</h1>
          <p className="mt-2 text-gray-500">The lead does not exist or you do not have access.</p>
          <button type="button" onClick={handleGoBack} className="btn btn-primary mt-5">
            Back to leads
          </button>
        </div>
      </div>
    );
  }

  const ownerName = lead.assignedToUser?.name || 'Unassigned';

  return (
    <div className="lead-detail-page">
      <div className="lead-detail-topbar">
        <button type="button" className="btn btn-secondary" onClick={handleGoBack}>
          <ArrowLeft className="h-4 w-4" />
          Back to leads
        </button>
        <div className="lead-detail-topbar__actions">
          <button type="button" className="btn btn-secondary" onClick={() => setShowReminderForm(true)}>
            <Clock className="h-4 w-4" />
            Set Reminder
          </button>
          {canEdit && (
            <>
              {isEditing ? (
                <>
                  <button type="button" className="btn btn-secondary" onClick={() => setIsEditing(false)} disabled={saving}>
                    <X className="h-4 w-4" />
                    Cancel
                  </button>
                  <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
                    {saving ? <div className="loading-spinner" /> : <Save className="h-4 w-4" />}
                    Save
                  </button>
                </>
              ) : (
                <button type="button" className="btn btn-primary" onClick={() => setIsEditing(true)}>
                  <Edit className="h-4 w-4" />
                  Edit Lead
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="lead-detail-grid">
        <aside className="lead-profile-panel">
          <div className="lead-profile-hero">
            <div className="lead-profile-panel__avatar">{lead.name.charAt(0).toUpperCase()}</div>
            <div className="lead-profile-hero__content">
              <h1 className="lead-profile-panel__name">{lead.name}</h1>
              <p className="lead-profile-panel__role">{lead.position || 'Lead'}</p>
              <div className="lead-profile-hero__badges">
                <span className={statusTone(lead.status)}>{lead.status}</span>
                <span className="lead-profile-priority-pill">{lead.priority}</span>
              </div>
            </div>

            <div className="lead-profile-panel__actions">
              {olderDuplicateLeadId && (
                <button
                  type="button"
                  className="lead-duplicate-link"
                  onClick={() => navigate(`/leads/${olderDuplicateLeadId}`)}
                  title={`Open older lead${typeof olderDuplicateLead === 'object' ? `: ${olderDuplicateLead.name}` : ''}`}
                >
                  <Copy className="h-4 w-4" />
                  <span>{lead.duplicateLabel || 'Duplicate'}</span>
                </button>
              )}
              {!olderDuplicateLeadId && lead.duplicateLinks?.map((duplicate) => (
                <button
                  key={duplicate._id}
                  type="button"
                  className="lead-duplicate-link"
                  onClick={() => navigate(`/leads/${duplicate._id}`)}
                  title={`Open ${duplicate.duplicateLabel || 'duplicate'} lead: ${duplicate.name}`}
                >
                  <Copy className="h-4 w-4" />
                  <span>{duplicate.duplicateLabel || 'Duplicate'}</span>
                </button>
              ))}
              <a href={`mailto:${lead.email}`} className="icon-button" title="Email lead">
                <Mail className="h-4 w-4" />
              </a>
              <a href={`tel:${lead.phone}`} className="icon-button" title="Call lead">
                <Phone className="h-4 w-4" />
              </a>
              <LeadWhatsAppButton lead={lead} className="icon-button" />
            </div>
          </div>

          <div className="lead-profile-panel__section lead-profile-panel__section--contact">
            <div className="lead-contact-card">
              <span className="lead-contact-card__icon">
                <Mail className="h-4 w-4" />
              </span>
              <div className="lead-field">
                <span>Email</span>
                <a href={`mailto:${lead.email}`}>{lead.email || 'Not available'}</a>
              </div>
            </div>
            <div className="lead-contact-card lead-contact-card--phone">
              <span className="lead-contact-card__icon">
                <Phone className="h-4 w-4" />
              </span>
              <div className="lead-field">
                <span>Phone / Zoom Phone</span>
                <a href={`tel:${lead.phone}`}>{lead.phone || 'Not available'}</a>
                <small>
                  Zoom: {lead.zoomPhoneNumber || lead.phone || 'Not linked'}
                </small>
              </div>
            </div>
            <div className="lead-contact-card">
              <span className="lead-contact-card__icon lead-contact-card__icon--green">
                <MessageSquare className="h-4 w-4" />
              </span>
              <div className="lead-field">
                <span>WhatsApp</span>
                <span>{lead.whatsapp || lead.phone || 'Not available'}</span>
              </div>
            </div>
            <div className="lead-contact-card">
              <span className="lead-contact-card__icon lead-contact-card__icon--slate">
                <FileText className="h-4 w-4" />
              </span>
              <div className="lead-field">
                <span>Folder</span>
                <span>{lead.folder || 'Uncategorized'}</span>
              </div>
            </div>
          </div>

          <div className="lead-profile-panel__tabs">
            <button
              type="button"
              className={profileInfoTab === 'profile' ? 'active' : ''}
              onClick={() => setProfileInfoTab('profile')}
            >
              Lead Profile
            </button>
            <button
              type="button"
              className={profileInfoTab === 'company' ? 'active' : ''}
              onClick={() => setProfileInfoTab('company')}
            >
              Company
            </button>
          </div>

          <div className="lead-profile-panel__section lead-profile-panel__section--summary">
            {profileInfoTab === 'profile' ? (
              <>
                <div className="lead-profile-meta-card">
                  <span>Created</span>
                  <strong>{new Date(lead.createdAt).toLocaleDateString()}</strong>
                </div>
                <div className="lead-profile-meta-card">
                  <span>Last updated</span>
                  <strong>{new Date(lead.updatedAt).toLocaleDateString()}</strong>
                </div>
                <div className="lead-profile-meta-card">
                  <span>Source</span>
                  <strong>{formatSource(lead.source)}</strong>
                </div>
              </>
            ) : (
              <div className="lead-company-placeholder">
                <FileText className="h-5 w-5" />
                <div>
                  <strong>LMS data will be shown here</strong>
                  <span>For now, no connection has been established.</span>
                </div>
              </div>
            )}
          </div>
        </aside>

        <main className="lead-workspace-panel">
          <div className="lead-tabs" role="tablist" aria-label="Lead detail sections">
            {[
              ['activity', 'Activity & Notes'],
              ['calls', 'Call History'],
              ['tasks', 'Tasks']
            ].map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                className={activeTab === tab ? 'active' : ''}
                onClick={() => setActiveTab(tab as LeadDetailTab)}
              >
                {label}
              </button>
            ))}
          </div>

          <section className="lead-workspace-panel__body">
            {activeTab === 'activity' && (
              <div className="lead-activity-stack">
                <div>
                  <h2>Upcoming activity</h2>
                  <div className="lead-activity-item">
                    <span className="timeline-dot">
                      <Phone className="h-4 w-4" />
                    </span>
                    <div className="lead-activity-item__content">
                      <div className="lead-activity-item__header">
                        <div>
                          <h3>Phone follow-up</h3>
                          <p>Owner: {ownerName}</p>
                        </div>
                        <span className={statusTone(lead.status)}>{lead.status}</span>
                      </div>
                      <p className="lead-activity-note">
                        Review lead details, call the prospect, then update disposition and notes.
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <h2>Activity notes</h2>
                  {canEdit && (
                    <div className="lead-note-composer lead-note-composer--inline">
                      <textarea
                        value={newNote}
                        onChange={(event) => setNewNote(event.target.value)}
                        placeholder="Add a note about this lead..."
                        className="form-input"
                        rows={4}
                      />
                      <div className="flex justify-end">
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={handleAddNote}
                          disabled={addingNote || !newNote.trim()}
                        >
                          {addingNote ? <div className="loading-spinner" /> : <Plus className="h-4 w-4" />}
                          Add Note
                        </button>
                      </div>
                    </div>
                  )}
                  {sortedNotes.length > 0 ? (
                    sortedNotes.map((note) => (
                      <div key={note.id} className="lead-activity-item">
                        <span className="timeline-dot">
                          <MessageSquare className="h-4 w-4" />
                        </span>
                        <div className="lead-activity-item__content">
                          <div className="lead-activity-item__header">
                            <div>
                              <h3>{note.createdBy?.name || 'Team member'} added a note</h3>
                              <p>{new Date(note.createdAt).toLocaleString()}</p>
                            </div>
                          </div>
                          <p className="lead-activity-note">{note.content}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="lead-empty-state">
                      <MessageSquare className="h-10 w-10" />
                      <h3>No activity recorded yet</h3>
                      <p>Add a note after calls, WhatsApp messages, or follow-ups.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'calls' && (
              <div className="space-y-5">
                <div className="lead-call-filter-card rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="lead-call-filter-layout">
                    <div className="lead-call-filter-copy">
                      <div className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide text-blue-600">
                        <Headphones className="h-4 w-4" />
                        Zoom Phone
                      </div>
                      <h2 className="lead-call-filter-title">Lead call history</h2>
                      <p className="lead-call-filter-subtitle">
                        Matching calls for {leadPhoneNumbers.length > 0 ? leadPhoneNumbers.join(', ') : 'this lead'}.
                      </p>
                    </div>
                    <div className="lead-call-filter-controls">
                      <div className="form-group">
                        <label className="form-label">From</label>
                        <input
                          type="date"
                          className="form-input"
                          value={callDateRange.from}
                          onChange={(event) =>
                            setCallDateRange((current) => ({ ...current, from: event.target.value }))
                          }
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">To</label>
                        <input
                          type="date"
                          className="form-input"
                          value={callDateRange.to}
                          onChange={(event) =>
                            setCallDateRange((current) => ({ ...current, to: event.target.value }))
                          }
                        />
                      </div>
                      <button type="button" className="btn btn-secondary lead-call-sync-button" onClick={fetchZoomPhoneData} disabled={zoomLoading}>
                        {zoomLoading ? <div className="loading-spinner" /> : <RefreshCw className="h-4 w-4" />}
                        Sync
                      </button>
                    </div>
                  </div>

                  {zoomStatus && !zoomStatus.configured && (
                    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                      Zoom Phone credentials are not configured on the backend. Add the Zoom Server-to-Server OAuth
                      environment variables, then sync again.
                    </div>
                  )}

                  {zoomError && zoomStatus?.configured && (
                    <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                      {zoomError}
                    </div>
                  )}
                </div>

                {activeRecordingId && audioUrl && (
                  <div ref={recordingPlayerRef} className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                    <div className="mb-3 flex items-center gap-2 text-sm font-bold text-blue-800">
                      <PlayCircle className="h-4 w-4" />
                      Playing recording {activeRecordingId}
                    </div>
                    {audioLoadingId === activeRecordingId && (
                      <div className="mb-3 rounded-lg border border-blue-100 bg-white p-3">
                        <div className="mb-2 flex items-center justify-between text-xs font-bold text-blue-700">
                          <span>{audioLoadStatus || 'Loading recording...'}</span>
                          <span>{audioLoadProgress}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-blue-100">
                          <div
                            className="h-full rounded-full bg-blue-600 transition-all duration-300"
                            style={{ width: `${Math.max(audioLoadProgress, 6)}%` }}
                          />
                        </div>
                      </div>
                    )}
                    <audio
                      ref={audioRef}
                      className="w-full"
                      controls
                      crossOrigin="anonymous"
                      autoPlay
                      preload="metadata"
                      src={audioUrl}
                      onLoadStart={() => {
                        setAudioLoadingId(activeRecordingId);
                        setAudioLoadProgress((current) => Math.max(current, 20));
                        setAudioLoadStatus('Loading audio metadata...');
                      }}
                      onProgress={(event) => updateLeadAudioBufferedProgress(event.currentTarget)}
                      onLoadedMetadata={() => {
                        setAudioLoadProgress(72);
                        setAudioLoadStatus('Metadata ready. Starting playback...');
                      }}
                      onCanPlay={() => {
                        setAudioLoadProgress(90);
                        setAudioLoadStatus('Audio ready. Starting playback...');
                      }}
                      onPlaying={() => {
                        setAudioLoadProgress(100);
                        setAudioLoadStatus('Playing');
                        setAudioLoadingId('');
                      }}
                      onWaiting={() => {
                        setAudioLoadingId(activeRecordingId);
                        setAudioLoadStatus('Buffering audio...');
                      }}
                      onError={() => {
                        setAudioLoadingId('');
                        setAudioLoadStatus('Unable to play recording');
                        const mediaError = audioRef.current?.error;
                        const errorCode = mediaError?.code ? ` Media error code: ${mediaError.code}.` : '';
                        toast.error(`Unable to play this Zoom recording.${errorCode} Please try Download, or refresh and play again.`);
                      }}
                    >
                      <track kind="captions" />
                    </audio>
                  </div>
                )}

                <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-200 p-4">
                    <h3 className="text-lg font-extrabold text-slate-950">Call Timeline</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {zoomLoading
                        ? 'Syncing Zoom Phone calls...'
                        : `${zoomCalls.length} calls and ${zoomRecordings.length} playable recording${zoomRecordings.length === 1 ? '' : 's'}`}
                    </p>
                  </div>

                  {zoomLoading ? (
                    <div className="space-y-3 p-4">
                      <div className="skeleton h-20" />
                      <div className="skeleton h-20" />
                      <div className="skeleton h-20" />
                    </div>
                  ) : zoomCalls.length > 0 ? (
                    <div className="lead-call-timeline-list">
                      {zoomCalls.map((call, index) => {
                        const idForCall = callLogId(call) || `${call.date_time || 'call'}-${index}`;
                        const matchedRecordings = zoomRecordings.filter((recording) => recordingBelongsToCall(call, recording));
                        const primaryRecording = matchedRecordings[0];
                        const idForPrimaryRecording = primaryRecording ? recordingId(primaryRecording) : '';
                        const callDirectionText = `${call.direction || call.call_type || ''}`.toLowerCase();
                        const isOutgoingCall = callDirectionText.includes('out');
                        const isIncomingCall = callDirectionText.includes('in');
                        const callerLabel =
                          isOutgoingCall && call.matched_user?.name
                            ? call.matched_user.name
                            : call.caller_name || call.caller_number || 'Unknown caller';
                        const calleeLabel =
                          isIncomingCall && call.matched_user?.name
                            ? call.matched_user.name
                            : call.callee_name || call.callee_number || 'Unknown recipient';

                        return (
                          <div key={idForCall} className="lead-call-timeline-item">
                            <div className="lead-call-row">
                              <div className="lead-call-main">
                                <div className="lead-call-badges">
                                  <span className={statusTone(call.result || 'New')}>{call.result || 'Unknown'}</span>
                                  <span className="lead-call-direction">
                                    {call.direction || call.call_type || 'Call'}
                                  </span>
                                  {matchedRecordings.length > 0 && (
                                    <span className="lead-call-recording-pill">
                                      {matchedRecordings.length} recording{matchedRecordings.length === 1 ? '' : 's'}
                                    </span>
                                  )}
                                </div>
                                <h4 className="lead-call-title">
                                  {callerLabel} to {calleeLabel}
                                </h4>
                                <div className="lead-call-meta">
                                  <span>{formatCallDate(call.date_time || call.answer_start_time)}</span>
                                  <span>{formatDuration(call.duration)}</span>
                                  <span>Called by {call.matched_user?.name || call.owner?.name || ownerName}</span>
                                </div>
                              </div>
                              <div className="lead-call-actions">
                                <a href={`tel:${lead.phone}`} className="btn btn-secondary lead-call-action-button">
                                  <Phone className="h-4 w-4" />
                                  Call
                                </a>
                                {primaryRecording && (
                                  <>
                                    <button
                                      type="button"
                                      className="btn btn-primary lead-call-action-button lead-call-action-button--primary"
                                      onClick={() => playRecording(primaryRecording)}
                                      disabled={audioLoadingId === idForPrimaryRecording}
                                    >
                                      {audioLoadingId === idForPrimaryRecording ? (
                                        <div className="loading-spinner" />
                                      ) : (
                                        <PlayCircle className="h-4 w-4" />
                                      )}
                                      Play
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-secondary lead-call-action-button"
                                      onClick={() => downloadRecording(primaryRecording)}
                                      disabled={audioLoadingId === idForPrimaryRecording}
                                    >
                                      <Download className="h-4 w-4" />
                                      Download
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>

                            {matchedRecordings.length > 1 && (
                              <div className="lead-extra-recordings">
                                {matchedRecordings.slice(1).map((recording, recordingIndex) => {
                                  const idForRecording = recordingId(recording) || `${recording.date_time || 'recording'}-${recordingIndex}`;
                                  return (
                                    <div key={idForRecording} className="lead-extra-recording-card">
                                      <div className="lead-extra-recording-card__content">
                                        <div className="min-w-0">
                                          <p>
                                            {recording.recording_type || 'Additional recording'}
                                          </p>
                                          <span>
                                            {formatCallDate(recording.date_time)} · {formatDuration(recording.duration)}
                                          </span>
                                        </div>
                                        <button
                                          type="button"
                                          className="icon-button"
                                          title="Play recording"
                                          onClick={() => playRecording(recording)}
                                          disabled={audioLoadingId === idForRecording}
                                        >
                                          {audioLoadingId === idForRecording ? (
                                            <div className="loading-spinner" />
                                          ) : (
                                            <PlayCircle className="h-4 w-4" />
                                          )}
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="lead-empty-state">
                      <Phone className="h-10 w-10" />
                      <h3>No Zoom Phone calls matched</h3>
                      <p>Check the date range or add the lead's Zoom Phone number in the profile.</p>
                      <a href={`tel:${lead.phone}`} className="btn btn-primary">
                        <Phone className="h-4 w-4" />
                        Call Now
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'tasks' && (
              <div className="lead-empty-state">
                <Calendar className="h-10 w-10" />
                <h3>No open tasks</h3>
                <p>Create a reminder for the next call or follow-up.</p>
                <button type="button" className="btn btn-primary" onClick={() => setShowReminderForm(true)}>
                  <Plus className="h-4 w-4" />
                  Create Reminder
                </button>
              </div>
            )}
          </section>
        </main>

        <aside className="lead-side-panel">
          <div className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">Lead Status</h2>
                <p className="card-subtitle">
                  {pipelineSavingField ? `Saving ${pipelineSavingField}...` : 'Pipeline and priority'}
                </p>
              </div>
            </div>
            <div className="card-body space-y-4">
              <div className="lead-summary-row">
                <span>Status</span>
                {canEdit ? (
                    <select
                      aria-label="Lead status"
                      className="form-input max-w-[180px]"
                      value={lead.status}
                      disabled={pipelineSavingField !== null}
                      onChange={(event) => handlePipelineUpdate('status', event.target.value as LeadStatus)}
                    >
                      {statusOptions.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                ) : (
                  <span className={statusTone(lead.status)}>{lead.status}</span>
                )}
              </div>
              <div className="lead-summary-row">
                <span>Priority</span>
                {canEdit ? (
                    <select
                      aria-label="Lead priority"
                      className="form-input max-w-[180px]"
                      value={lead.priority}
                      disabled={pipelineSavingField !== null}
                      onChange={(event) => handlePipelineUpdate('priority', event.target.value as LeadPriority)}
                    >
                      {priorityOptions.map((priority) => (
                        <option key={priority} value={priority}>
                          {priority}
                        </option>
                      ))}
                    </select>
                ) : (
                  <span className={`rounded-full border px-3 py-1 text-xs font-extrabold ${priorityTone(lead.priority)}`}>
                    {lead.priority}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">Assignment</h2>
                <p className="card-subtitle">Owner and handoff</p>
              </div>
            </div>
            <div className="card-body space-y-4">
              <div className="lead-owner-card">
                <span className="avatar">{ownerName.charAt(0).toUpperCase()}</span>
                <div>
                  <p>{ownerName}</p>
                  <span>{lead.assignedToUser?.email || 'No employee assigned'}</span>
                </div>
              </div>

              {canManage && (
                <div className="space-y-3">
                  <label className="form-label">Assign Lead</label>
                  <select
                    className="form-input"
                    value={selectedAssignee}
                    onChange={(event) => setSelectedAssignee(event.target.value)}
                  >
                    <option value="">Select employee</option>
                    {users.map((employee) => (
                      <option key={employee._id} value={employee._id}>
                        {employee.name} - {employee.email}
                      </option>
                    ))}
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" className="btn btn-primary" onClick={handleAssignLead} disabled={assigning}>
                      {assigning ? <div className="loading-spinner" /> : <UserPlus className="h-4 w-4" />}
                      Assign
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={handleUnassignLead} disabled={assigning}>
                      Unassign
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">Lead Information</h2>
                <p className="card-subtitle">Editable CRM fields</p>
              </div>
            </div>
            <div className="card-body">
              {isEditing ? (
                <div className="space-y-4">
                  <div className="form-group">
                    <label className="form-label">Full Name</label>
                    <input
                      className="form-input"
                      value={formData.name}
                      onChange={(event) => setFormData((current) => ({ ...current, name: event.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email</label>
                    <input
                      type="email"
                      className="form-input"
                      value={formData.email}
                      onChange={(event) => setFormData((current) => ({ ...current, email: event.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Phone</label>
                    <input
                      className="form-input"
                      value={formData.phone}
                      onChange={(event) => setFormData((current) => ({ ...current, phone: event.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">WhatsApp</label>
                    <input
                      className="form-input"
                      value={formData.whatsapp}
                      onChange={(event) => setFormData((current) => ({ ...current, whatsapp: event.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Zoom Phone Number</label>
                    <input
                      className="form-input"
                      value={formData.zoomPhoneNumber}
                      onChange={(event) =>
                        setFormData((current) => ({ ...current, zoomPhoneNumber: event.target.value }))
                      }
                      placeholder="Number used in Zoom Phone call logs"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Position</label>
                    <input
                      className="form-input"
                      value={formData.position}
                      onChange={(event) => setFormData((current) => ({ ...current, position: event.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Folder</label>
                    <input
                      className="form-input"
                      value={formData.folder}
                      onChange={(event) => setFormData((current) => ({ ...current, folder: event.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Source</label>
                    <select
                      className="form-input"
                      value={formData.source}
                      onChange={(event) =>
                        setFormData((current) => ({ ...current, source: event.target.value as LeadSource }))
                      }
                    >
                      {sourceOptions.map((source) => (
                        <option key={source} value={source}>
                          {formatSource(source)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="lead-summary-row">
                    <span>Source</span>
                    <strong>{formatSource(lead.source)}</strong>
                  </div>
                  <div className="lead-summary-row">
                    <span>Folder</span>
                    <strong>{lead.folder || 'Uncategorized'}</strong>
                  </div>
                  <div className="lead-summary-row">
                    <span>Zoom Phone</span>
                    <strong>{lead.zoomPhoneNumber || 'Not linked'}</strong>
                  </div>
                  <div className="lead-summary-row">
                    <span>Lead score</span>
                    <strong>{lead.leadScore ?? 0}/100</strong>
                  </div>
                </div>
              )}
            </div>
          </div>

          {(lead.source === 'Meta' || lead.metaLeadId) && (
            <div className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">Meta Attribution</h2>
                  <p className="card-subtitle">Lead Ads capture and CRM feedback</p>
                </div>
              </div>
              <div className="card-body space-y-3">
                <div className="lead-summary-row">
                  <span>Campaign</span>
                  <strong>{lead.campaignName || 'Not supplied'}</strong>
                </div>
                <div className="lead-summary-row">
                  <span>Ad set</span>
                  <strong>{lead.adsetName || 'Not supplied'}</strong>
                </div>
                <div className="lead-summary-row">
                  <span>Ad</span>
                  <strong>{lead.adName || 'Not supplied'}</strong>
                </div>
                <div className="lead-summary-row">
                  <span>Meta Lead ID</span>
                  <strong>{lead.metaLeadId || 'Not supplied'}</strong>
                </div>
                <div className="lead-summary-row">
                  <span>Meta created</span>
                  <strong>{lead.metaCreatedTime ? new Date(lead.metaCreatedTime).toLocaleString() : 'Not supplied'}</strong>
                </div>
                <div className="lead-summary-row">
                  <span>Submitted name</span>
                  <strong>{lead.metaOriginalName || 'Not supplied'}</strong>
                </div>
                <div className="lead-summary-row">
                  <span>Submitted email</span>
                  <strong>{lead.metaOriginalEmail || 'Not supplied'}</strong>
                </div>
                <div className="lead-summary-row">
                  <span>Submitted phone</span>
                  <strong>{lead.metaOriginalPhone || 'Not supplied'}</strong>
                </div>
                <div className="lead-summary-row">
                  <span>Last feedback</span>
                  <strong>
                    {lead.metaFeedbackLastStatus
                      ? `${lead.metaFeedbackLastStatus}${lead.metaFeedbackLastSentAt ? ` · ${new Date(lead.metaFeedbackLastSentAt).toLocaleString()}` : ''}`
                      : 'Not sent yet'}
                  </strong>
                </div>
                {lead.metaFeedbackLastError && (
                  <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                    Feedback error: {lead.metaFeedbackLastError}
                  </p>
                )}
                {metaAttributes.length > 0 && (
                  <div className="pt-3 border-t border-slate-200/80 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Form Responses ({metaAttributes.length})
                      </span>
                    </div>
                    {metaAttributes.map((attr) => (
                      <div key={attr.key} className="lead-summary-row items-start py-1 border-b border-slate-100 last:border-b-0">
                        <span className="text-xs sm:text-sm font-medium text-slate-500 max-w-[48%] text-left" title={attr.label}>
                          {attr.label}
                        </span>
                        <strong
                          className="text-right text-xs sm:text-sm font-semibold text-slate-900 break-words max-w-[52%] whitespace-pre-wrap"
                          title={attr.rawValue && attr.rawValue !== attr.value ? `Raw value: ${attr.rawValue}` : undefined}
                        >
                          {attr.value}
                        </strong>
                      </div>
                    ))}
                  </div>
                )}
                {lead.metaRawPayload && (
                  <details className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                    <summary className="cursor-pointer font-semibold text-slate-700">Complete submitted payload</summary>
                    <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-slate-600">
                      {JSON.stringify(lead.metaRawPayload, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>

      {pendingStatusReminder && (
        <StatusReminderDialog
          status={pendingStatusReminder}
          leadName={lead.name}
          submitting={pipelineSavingField === 'status'}
          onCancel={() => setPendingStatusReminder(null)}
          onConfirm={confirmStatusReminder}
        />
      )}

      {showReminderForm && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-lg bg-white shadow-2xl">
            <div className="card-header">
              <div>
                <h3 className="card-title">Create Reminder</h3>
                <p className="card-subtitle">{lead.name}</p>
              </div>
              <button type="button" className="icon-button" onClick={() => setShowReminderForm(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="card-body space-y-4">
              <input
                type="text"
                placeholder="Reminder title"
                className="form-input"
                value={reminderTitle}
                onChange={(event) => setReminderTitle(event.target.value)}
              />
              <textarea
                placeholder="Optional note"
                className="form-input"
                value={reminderNote}
                onChange={(event) => setReminderNote(event.target.value)}
              />
              <input
                type="datetime-local"
                className="form-input"
                value={remindAt}
                onChange={(event) => setRemindAt(event.target.value)}
              />
              <div className="flex justify-end gap-3">
                <button type="button" className="btn btn-secondary" onClick={() => setShowReminderForm(false)}>
                  Cancel
                </button>
                <button type="button" className="btn btn-primary" onClick={createReminder}>
                  Save Reminder
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeadDetails;
