import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  CalendarClock,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Headphones,
  Mic,
  PhoneCall,
  Play,
  RefreshCw,
  Search,
  UserRound,
  Voicemail
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { leadApi, userApi, zoomPhoneApi } from '../lib/api';
import { formatDuration, formatTalkTime } from '../lib/callCenterData';
import type {
  Lead,
  User,
  ZoomPhoneAnalyticsResponse,
  ZoomPhoneCallLog,
  ZoomPhoneInventoryResponse,
  ZoomPhoneLiveStatusResponse,
  ZoomPhoneMetricCall,
  ZoomPhoneRecording,
  ZoomPhoneStatus,
  ZoomUserCallSummary
} from '../types';
import { useDebouncedValue } from '../hooks/useDebouncedValue';

const formatDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDefaultDateRange = () => {
  const to = new Date();
  return {
    from: formatDateInput(to),
    to: formatDateInput(to)
  };
};

const getCallKey = (call: ZoomPhoneCallLog) =>
  call.id ||
  call.call_id ||
  `${call.started_at || call.date_time || call.answer_start_time || 'call'}-${call.caller_number || ''}-${call.callee_number || ''}`;

const getCallStartedAt = (call: ZoomPhoneCallLog) =>
  call.started_at || call.date_time || call.answer_start_time || call.call_end_time || '';

const getCallName = (call: ZoomPhoneCallLog) =>
  call.matched_lead?.name ||
  call.caller_name ||
  call.callee_name ||
  call.display_phone ||
  call.caller_number ||
  call.callee_number ||
  'Unknown caller';

const getCallPhone = (call: ZoomPhoneCallLog) =>
  call.matched_lead?.phone ||
  call.display_phone ||
  call.caller_number ||
  call.callee_number ||
  call.caller_phone_number ||
  call.callee_phone_number ||
  call.caller_did_number ||
  call.callee_did_number ||
  'No phone number';

const getCallAgent = (call: ZoomPhoneCallLog) =>
  call.matched_user?.name ||
  call.agent_name ||
  call.owner?.name ||
  call.owner?.extension_number ||
  call.user_id ||
  'Unassigned';

const getCallUserFilterKey = (call: ZoomPhoneCallLog) =>
  call.matched_user?.id ? `crm:${call.matched_user.id}` : `zoom:${getCallAgent(call)}`;

const getCallStatus = (call: ZoomPhoneCallLog) => call.normalized_status || call.result || call.call_type || 'Unknown';

const getCallDirection = (call: ZoomPhoneCallLog) => call.normalized_direction || call.direction || 'Unknown';

const getCallRecordingId = (call: ZoomPhoneCallLog) => call.recording_id || call.id || call.call_id || getCallKey(call);

const getRecordingKey = (recording: ZoomPhoneRecording) =>
  recording.id ||
  recording.call_id ||
  recording.call_log_id ||
  recording.call_history_id ||
  recording.call_element_id ||
  `${recording.date_time || 'recording'}-${recording.caller_number || ''}-${recording.callee_number || ''}`;

const getRecordingName = (recording: ZoomPhoneRecording) =>
  recording.matched_lead?.name ||
  recording.caller_name ||
  recording.callee_name ||
  recording.caller_number ||
  recording.callee_number ||
  'Zoom Phone recording';

const getRecordingPhone = (recording: ZoomPhoneRecording) =>
  recording.matched_lead?.phone ||
  (recording.caller_number && recording.callee_number
    ? `${recording.caller_number} to ${recording.callee_number}`
    : recording.caller_number || recording.callee_number || 'No phone number');

const getRecordingOwner = (recording: ZoomPhoneRecording) =>
  recording.matched_user?.name || recording.owner?.name || recording.owner?.extension_number || 'Unknown owner';

const getRecordingUserFilterKey = (recording: ZoomPhoneRecording) =>
  recording.matched_user?.id ? `crm:${recording.matched_user.id}` : `zoom:${getRecordingOwner(recording)}`;

const statusClass = (status: string) => {
  if (status === 'Connected' || status === 'Activated' || status === 'available') return 'status-pill status-pill--green';
  if (status === 'Missed' || status === 'Failed') return 'status-pill status-pill--rose';
  if (status === 'Voicemail' || status === 'Busy') return 'status-pill status-pill--amber';
  if (status === 'on_call') return 'status-pill status-pill--blue';
  return 'status-pill status-pill--slate';
};

const getDirectionText = (direction?: string) => (direction || '').trim().toLowerCase();

const isIncomingDirection = (direction?: string) => {
  const text = getDirectionText(direction);
  return text === 'incoming' || text === 'inbound' || text.startsWith('incoming ') || text.startsWith('inbound ');
};

const isOutgoingDirection = (direction?: string) => {
  const text = getDirectionText(direction);
  return text === 'outgoing' || text === 'outbound' || text.startsWith('outgoing ') || text.startsWith('outbound ');
};

const directionClass = (direction: string) => {
  if (isIncomingDirection(direction)) return 'status-pill status-pill--violet';
  if (isOutgoingDirection(direction)) return 'status-pill status-pill--blue';
  return 'status-pill status-pill--slate';
};

const formatDateTime = (value?: string) => {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const formatCompactDateTime = (value?: string) => {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};

const isBenignPlayInterruption = (error: unknown) => {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    error.name === 'AbortError' ||
    message.includes('interrupted by a new load request') ||
    message.includes('interrupted by a call to pause')
  );
};

const emptyAnalytics: ZoomPhoneAnalyticsResponse = {
  from: '',
  to: '',
  page_size: 0,
  pages_scanned: 0,
  total_records_scanned: 0,
  call_logs: [],
  recordings: [],
  summary: {
    total_calls: 0,
    incoming_calls: 0,
    outgoing_calls: 0,
    missed_calls: 0,
    connected_calls: 0,
    voicemail_calls: 0,
    recorded_calls: 0,
    answer_rate: 0,
    average_call_duration: 0,
    total_talk_time: 0
  },
  agent_stats: [],
  daily_stats: [],
  status_breakdown: [],
  direction_breakdown: []
};

const emptyInventory: ZoomPhoneInventoryResponse = {
  phone_numbers: [],
  users: [],
  summary: {
    total_numbers: 0,
    assigned_numbers: 0,
    unassigned_numbers: 0,
    available_numbers: 0,
    busy_numbers: 0,
    inactive_numbers: 0,
    total_users: 0,
    active_users: 0,
    inactive_users: 0
  },
  number_status_breakdown: [],
  user_status_breakdown: [],
  capability_breakdown: [],
  pages_scanned: {
    numbers: 0,
    users: 0
  }
};

const emptyLiveStatus: ZoomPhoneLiveStatusResponse = {
  active_calls: [],
  recent_calls: [],
  phone_users: [],
  inventory: emptyInventory,
  updated_at: ''
};

type UnifiedCallHistoryItem = {
  id: string;
  call?: ZoomPhoneCallLog;
  recording?: ZoomPhoneRecording;
  recordings: ZoomPhoneRecording[];
};

const toSafeString = (value: unknown) => (value == null ? '' : String(value));

const normalizeMatchPhone = (value?: unknown) => toSafeString(value).replace(/\D/g, '');

const uniqueStrings = (values: unknown[]) =>
  Array.from(new Set(values.map((value) => toSafeString(value).trim()).filter(Boolean)));

const getCallIdentifierValues = (call: ZoomPhoneCallLog) =>
  uniqueStrings([call.id, call.call_id, call.recording_id, getCallKey(call)]);

const getRecordingIdentifierValues = (recording: ZoomPhoneRecording) =>
  uniqueStrings([
    recording.id,
    recording.call_id,
    recording.call_log_id,
    recording.call_history_id,
    recording.call_element_id,
    getRecordingKey(recording)
  ]);

const getRecordingCallGroupKey = (recording: ZoomPhoneRecording) => {
  const identifiers = uniqueStrings([
    recording.call_id,
    recording.call_log_id,
    recording.call_history_id,
    recording.call_element_id
  ]);
  if (identifiers.length > 0) return `recording-call:${identifiers[0]}`;

  const recordingTime = getDateMs(recording.date_time || recording.end_time);
  const minuteBucket = recordingTime ? Math.floor(recordingTime / 60_000) : recording.date_time || recording.end_time || 'unknown-time';
  const numbers = getRecordingMatchNumbers(recording).sort().join('-') || 'unknown-number';
  const owner = getRecordingUserFilterKey(recording);

  return `recording-fallback:${owner}:${numbers}:${minuteBucket}`;
};

const getCallMatchNumbers = (call: ZoomPhoneCallLog) =>
  uniqueStrings([
    call.matched_lead?.phone,
    call.display_phone,
    call.caller_number,
    call.callee_number,
    call.caller_phone_number,
    call.callee_phone_number,
    call.caller_did_number,
    call.callee_did_number
  ])
    .map(normalizeMatchPhone)
    .filter(Boolean);

const getRecordingMatchNumbers = (recording: ZoomPhoneRecording) =>
  uniqueStrings([recording.matched_lead?.phone, recording.caller_number, recording.callee_number])
    .map(normalizeMatchPhone)
    .filter(Boolean);

const getDateMs = (value?: string) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
};

const valuesOverlap = (left: string[], right: string[]) => left.some((value) => right.includes(value));

const recordingBelongsToCall = (call: ZoomPhoneCallLog, recording: ZoomPhoneRecording) => {
  if (valuesOverlap(getCallIdentifierValues(call), getRecordingIdentifierValues(recording))) {
    return true;
  }

  const callNumbers = getCallMatchNumbers(call);
  const recordingNumbers = getRecordingMatchNumbers(recording);
  if (!valuesOverlap(callNumbers, recordingNumbers)) return false;

  const callTime = getDateMs(getCallStartedAt(call));
  const recordingTime = getDateMs(recording.date_time || recording.end_time);
  if (!callTime || !recordingTime) return false;

  const timeDifference = Math.abs(callTime - recordingTime);
  const durationDifference = Math.abs((call.duration || 0) - (recording.duration || 0));

  return timeDifference <= 90_000 || (timeDifference <= 5 * 60_000 && durationDifference <= 3);
};

const getHistoryPrimaryRecording = (item: UnifiedCallHistoryItem) => item.recordings[0] || item.recording;

const getHistoryName = (item: UnifiedCallHistoryItem) =>
  item.call ? getCallName(item.call) : item.recording ? getRecordingName(item.recording) : 'Zoom Phone call';

const getHistoryPhone = (item: UnifiedCallHistoryItem) =>
  item.call ? getCallPhone(item.call) : item.recording ? getRecordingPhone(item.recording) : 'No phone number';

const getHistoryAgent = (item: UnifiedCallHistoryItem) =>
  item.call ? getCallAgent(item.call) : item.recording ? getRecordingOwner(item.recording) : 'Unknown owner';

const getHistoryUserFilterKey = (item: UnifiedCallHistoryItem) =>
  item.call ? getCallUserFilterKey(item.call) : item.recording ? getRecordingUserFilterKey(item.recording) : 'zoom:unknown';

const getHistoryStatus = (item: UnifiedCallHistoryItem) => (item.call ? getCallStatus(item.call) : 'Recorded');

const getHistoryDirection = (item: UnifiedCallHistoryItem) =>
  item.call ? getCallDirection(item.call) : item.recording?.direction || 'Unknown';

const getHistoryDuration = (item: UnifiedCallHistoryItem) =>
  item.call?.duration || getHistoryPrimaryRecording(item)?.duration || 0;

const getHistoryStartedAt = (item: UnifiedCallHistoryItem) =>
  (item.call && getCallStartedAt(item.call)) || item.recording?.date_time || item.recording?.end_time || '';

const getHistoryLeadEmail = (item: UnifiedCallHistoryItem) => item.call?.matched_lead?.email || item.recording?.matched_lead?.email;

const getHistoryUserEmail = (item: UnifiedCallHistoryItem) => item.call?.matched_user?.email || item.recording?.matched_user?.email;

const getHistoryMatchedUser = (item: UnifiedCallHistoryItem) => item.call?.matched_user || item.recording?.matched_user;

const InactiveUserDot = ({ inactive }: { inactive?: boolean }) =>
  inactive ? (
    <span
      className="inline-block h-2 w-2 rounded-full bg-red-500 align-middle ring-2 ring-red-100"
      title="Deactivated user"
      aria-label="Deactivated user"
    />
  ) : null;

const getHistoryRecordingCount = (item: UnifiedCallHistoryItem) => {
  if (item.recordings.length > 0) return item.recordings.length;
  if (item.call?.has_recording || item.call?.recording_download_url || item.call?.recording_id) {
    return item.call.recording_count || 1;
  }
  return 0;
};

const hasHistoryRecording = (item: UnifiedCallHistoryItem) => getHistoryRecordingCount(item) > 0;

const getStatusText = (status?: string) => (status || '').trim().toLowerCase();

const isConnectedHistoryItem = (item: UnifiedCallHistoryItem) => {
  const status = getStatusText(item.call ? getCallStatus(item.call) : undefined);
  if ((!status || status === 'unknown') && item.call && getHistoryRecordingCount(item) > 0) return true;
  if (!status) return false;
  return (
    status.includes('connect') ||
    status.includes('answer') ||
    status.includes('completed') ||
    status.includes('accepted')
  );
};

const isMissedHistoryItem = (item: UnifiedCallHistoryItem) => {
  const status = getStatusText(item.call ? getCallStatus(item.call) : undefined);
  return status.includes('miss') || status.includes('failed') || status.includes('no answer') || status.includes('abandoned');
};

const buildUserFilterTokens = (values: unknown[]) =>
  values
    .flatMap((value) => toSafeString(value).split(','))
    .flatMap((value) => {
      const normalized = value.trim().toLowerCase();
      const phone = normalizeMatchPhone(value);
      return phone ? [normalized, phone] : [normalized];
    })
    .filter(Boolean);

const getOptionNameKey = (value?: unknown) => toSafeString(value).trim().toLowerCase().replace(/\s+/g, ' ');

const getUserFilterEmails = (values: unknown[]) =>
  buildUserFilterTokens(values).filter((token) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(token));

type UserFilterOption = {
  value: string;
  label: string;
  meta: string;
  inactive?: boolean;
  aliases: string[];
};

const userOptionsShareIdentity = (first: UserFilterOption, second: UserFilterOption) => {
  const firstName = getOptionNameKey(first.label);
  const secondName = getOptionNameKey(second.label);
  if (firstName && firstName === secondName) return true;

  const firstEmails = getUserFilterEmails([first.label, first.meta, ...first.aliases]);
  const secondEmails = getUserFilterEmails([second.label, second.meta, ...second.aliases]);
  return firstEmails.some((email) => secondEmails.includes(email));
};

const userOptionLooksDuplicate = (
  option: UserFilterOption,
  canonicalOptions: UserFilterOption[]
) => {
  if (option.value.startsWith('crm:')) return false;

  return canonicalOptions.some((canonical) => userOptionsShareIdentity(option, canonical));
};

const getHistoryCustomerNumber = (item: UnifiedCallHistoryItem) => {
  const direction = getHistoryDirection(item);
  const call = item.call;
  const recording = getHistoryPrimaryRecording(item);

  const value = isOutgoingDirection(direction)
    ? call?.callee_number || call?.callee_phone_number || recording?.callee_number || getHistoryPhone(item)
    : isIncomingDirection(direction)
      ? call?.caller_number || call?.caller_phone_number || recording?.caller_number || getHistoryPhone(item)
      : call?.display_phone || recording?.matched_lead?.phone || getHistoryPhone(item);

  return normalizeMatchPhone(value) || getHistoryPhone(item).toLowerCase();
};

const countUniqueCustomers = (items: UnifiedCallHistoryItem[]) =>
  new Set(items.map(getHistoryCustomerNumber).filter(Boolean)).size;

const getMetricCallAgent = (call: ZoomPhoneMetricCall) =>
  call.matched_user?.name || call.caller?.name || call.callee?.name || call.owner?.name || 'Zoom user';

const getMetricPartyText = (call: ZoomPhoneMetricCall) => {
  const caller = call.caller?.phone_number || call.caller?.extension_number || 'Unknown caller';
  const callee = call.callee?.phone_number || call.callee?.extension_number || 'Unknown recipient';
  return `${caller} to ${callee}`;
};

const Calls: React.FC = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeView = searchParams.get('view') === 'history' ? 'history' : 'live';
  const defaultRange = useMemo(getDefaultDateRange, []);
  const [fromDate, setFromDate] = useState(defaultRange.from);
  const [toDate, setToDate] = useState(defaultRange.to);
  const [zoomStatus, setZoomStatus] = useState<ZoomPhoneStatus | null>(null);
  const [analytics, setAnalytics] = useState<ZoomPhoneAnalyticsResponse>(emptyAnalytics);
  const [inventory, setInventory] = useState<ZoomPhoneInventoryResponse>(emptyInventory);
  const [liveStatus, setLiveStatus] = useState<ZoomPhoneLiveStatusResponse>(emptyLiveStatus);
  const [crmUsers, setCrmUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [zoomError, setZoomError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [directionFilter, setDirectionFilter] = useState('All');
  const [userFilter, setUserFilter] = useState('All');
  const [selectedUserSummary, setSelectedUserSummary] = useState<ZoomUserCallSummary | null>(null);
  const [selectedUserSummaryLoading, setSelectedUserSummaryLoading] = useState(false);
  const [selectedUserSummaryError, setSelectedUserSummaryError] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(15);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [callQueueLeads, setCallQueueLeads] = useState<Lead[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioCallId, setAudioCallId] = useState<string | null>(null);
  const [recordingLoading, setRecordingLoading] = useState(false);
  const [audioLoadProgress, setAudioLoadProgress] = useState(0);
  const [audioLoadStatus, setAudioLoadStatus] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recordingPanelRef = useRef<HTMLDivElement | null>(null);
  const fetchRequestRef = useRef(0);
  const debouncedQuery = useDebouncedValue(query, 220);

  const setActiveView = (view: 'live' | 'history') => {
    const nextParams = new URLSearchParams(searchParams);
    if (view === 'history') {
      nextParams.set('view', 'history');
    } else {
      nextParams.delete('view');
    }
    setSearchParams(nextParams, { replace: true });
  };

  const fetchData = useCallback(async () => {
    const requestId = fetchRequestRef.current + 1;
    fetchRequestRef.current = requestId;
    setLoading(true);
    setZoomError(null);

    try {
      const queuePromise =
        user?.role === 'admin'
          ? leadApi.getLeads({ status: ['New', 'Follow-up', 'Call Back'] }, 1, 8)
          : leadApi.getMyLeads(1, 8);

      const [statusResponse, queueResponse] = await Promise.all([zoomPhoneApi.getStatus(), queuePromise]);

      if (statusResponse.success && statusResponse.data) {
        setZoomStatus(statusResponse.data);
      } else {
        setZoomStatus(null);
        setZoomError(statusResponse.message || 'Unable to read Zoom Phone configuration');
        setAnalytics(emptyAnalytics);
        setInventory(emptyInventory);
        setLiveStatus(emptyLiveStatus);
        setCrmUsers([]);
        return;
      }

      if (queueResponse.success) {
        setCallQueueLeads(queueResponse.data || []);
      }

      if (user?.role !== 'admin') {
        setAnalytics(emptyAnalytics);
        setInventory(emptyInventory);
        setLiveStatus(emptyLiveStatus);
        return;
      }

      if (statusResponse.data.configured === false) {
        setAnalytics(emptyAnalytics);
        setInventory(emptyInventory);
        setLiveStatus(emptyLiveStatus);
        setCrmUsers([]);
        setZoomError(`Zoom Phone is not configured. Missing: ${statusResponse.data.missing.join(', ')}`);
        return;
      }

      const today = formatDateInput(new Date());
      const [analyticsResponse, inventoryResponse, liveResponse, usersResponse] = await Promise.all([
        zoomPhoneApi.getAnalytics({
          from: fromDate,
          to: toDate,
          pageSize: 300,
          maxPages: 5,
          includeRecordings: false
        }),
        zoomPhoneApi.getInventory({
          pageSize: 300,
          maxPages: 5
        }),
        zoomPhoneApi.getLiveStatus({
          from: today,
          to: today,
          pageSize: 100,
          maxPages: 2
        }),
        userApi.getAllUsers()
      ]);

      if (analyticsResponse.success && analyticsResponse.data) {
        setAnalytics(analyticsResponse.data);

        zoomPhoneApi
          .getAccountRecordings({
            from: fromDate,
            to: toDate,
            pageSize: 300,
            maxPages: 5
          })
          .then((recordingsResponse) => {
            if (fetchRequestRef.current !== requestId) return;
            if (recordingsResponse.success && recordingsResponse.data) {
              setAnalytics((current) => ({
                ...current,
                recordings: recordingsResponse.data?.recordings || [],
                recordings_error: undefined
              }));
            } else {
              setAnalytics((current) => ({
                ...current,
                recordings_error: recordingsResponse.message || 'Unable to sync Zoom Phone recordings'
              }));
            }
          })
          .catch((error) => {
            if (fetchRequestRef.current !== requestId) return;
            setAnalytics((current) => ({
              ...current,
              recordings_error: error instanceof Error ? error.message : 'Unable to sync Zoom Phone recordings'
            }));
          });
      } else {
        setAnalytics(emptyAnalytics);
        setZoomError(analyticsResponse.message || 'Unable to sync Zoom Phone call history');
      }

      if (inventoryResponse.success && inventoryResponse.data) {
        setInventory(inventoryResponse.data);
      } else {
        setInventory(emptyInventory);
        setZoomError((current) => current || inventoryResponse.message || 'Unable to sync Zoom Phone inventory');
      }

      if (liveResponse.success && liveResponse.data) {
        setLiveStatus(liveResponse.data);
      } else {
        setLiveStatus(emptyLiveStatus);
        setZoomError((current) => current || liveResponse.message || 'Unable to sync live Zoom Phone status');
      }

      if (usersResponse.success && usersResponse.data) {
        setCrmUsers(usersResponse.data);
      } else {
        setCrmUsers([]);
        setZoomError((current) => current || usersResponse.message || 'Unable to load CRM users');
      }
    } catch (error) {
      setZoomError(error instanceof Error ? error.message : 'Unable to load Zoom Phone data');
      setAnalytics(emptyAnalytics);
      setInventory(emptyInventory);
      setLiveStatus(emptyLiveStatus);
      setCrmUsers([]);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, user?.role]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const unifiedHistory = useMemo(() => {
    const usedRecordingKeys = new Set<string>();
    const historyItems: UnifiedCallHistoryItem[] = analytics.call_logs.map((call) => {
      const recordings = analytics.recordings.filter((recording) => recordingBelongsToCall(call, recording));
      recordings.forEach((recording) => usedRecordingKeys.add(getRecordingKey(recording)));

      return {
        id: getCallKey(call),
        call,
        recording: recordings[0],
        recordings
      };
    });

    const unmatchedRecordings = new Map<string, ZoomPhoneRecording[]>();

    analytics.recordings.forEach((recording) => {
      const recordingKey = getRecordingKey(recording);
      if (usedRecordingKeys.has(recordingKey)) return;

      const groupKey = getRecordingCallGroupKey(recording);
      const current = unmatchedRecordings.get(groupKey) || [];
      current.push(recording);
      unmatchedRecordings.set(groupKey, current);
    });

    unmatchedRecordings.forEach((recordings, groupKey) => {
      const sortedRecordings = [...recordings].sort((left, right) => {
        const leftDate = getDateMs(left.date_time || left.end_time) || 0;
        const rightDate = getDateMs(right.date_time || right.end_time) || 0;
        return rightDate - leftDate;
      });

      historyItems.push({
        id: `recording:${groupKey}`,
        recording: sortedRecordings[0],
        recordings: sortedRecordings
      });
    });

    return historyItems.sort((left, right) => {
      const leftDate = getDateMs(getHistoryStartedAt(left)) || 0;
      const rightDate = getDateMs(getHistoryStartedAt(right)) || 0;
      return rightDate - leftDate;
    });
  }, [analytics.call_logs, analytics.recordings]);

  const availableStatuses = useMemo(
    () => Array.from(new Set(unifiedHistory.map(getHistoryStatus))).filter(Boolean).sort(),
    [unifiedHistory]
  );

  const availableDirections = useMemo(
    () => Array.from(new Set(unifiedHistory.map(getHistoryDirection))).filter(Boolean).sort(),
    [unifiedHistory]
  );

  const userOptions = useMemo(() => {
    const options = new Map<string, UserFilterOption>();
    const addOption = (
      value: string,
      label: unknown,
      meta: unknown,
      inactive?: boolean,
      aliases: unknown[] = []
    ) => {
      if (!value.startsWith('crm:')) return;

      const normalizedLabel = toSafeString(label).trim() || 'Zoom user';
      const normalizedMeta = toSafeString(meta).trim() || 'Zoom Phone';
      const option: UserFilterOption = {
        value,
        label: normalizedLabel,
        meta: normalizedMeta,
        inactive,
        aliases: uniqueStrings([value, normalizedLabel, normalizedMeta, ...aliases])
      };
      const duplicate = Array.from(options.values()).find((existing) => {
        return existing.value === value || userOptionsShareIdentity(option, existing);
      });

      if (duplicate) {
        duplicate.aliases = uniqueStrings([...duplicate.aliases, ...option.aliases]);
        duplicate.inactive = duplicate.inactive && inactive !== false;
        if (!duplicate.meta.includes('@') && option.meta.includes('@')) {
          duplicate.meta = option.meta;
        }
        return;
      }

      options.set(value, option);
    };

    crmUsers.forEach((crmUser) => {
      addOption(
        `crm:${crmUser._id}`,
        crmUser.name,
        crmUser.email,
        crmUser.isActive === false,
        [crmUser.email, crmUser.name]
      );
    });

    analytics.call_logs.forEach((call) => {
      const key = getCallUserFilterKey(call);
      addOption(
        key,
        getCallAgent(call),
        call.matched_user?.email || call.owner?.phone_number || call.owner?.extension_number || 'Zoom Phone',
        call.matched_user?.isActive === false,
        [call.matched_user?.email, call.owner?.email, call.user_email, call.caller_email, call.callee_email]
      );
    });

    analytics.recordings.forEach((recording) => {
      const key = getRecordingUserFilterKey(recording);
      addOption(
        key,
        recording.matched_user?.name || getRecordingOwner(recording),
        recording.matched_user?.email || recording.owner?.phone_number || recording.owner?.extension_number || 'Zoom Phone',
        recording.matched_user?.isActive === false,
        [recording.matched_user?.email, recording.owner?.email, recording.user_email, recording.caller_email, recording.callee_email]
      );
    });

    liveStatus.phone_users.forEach((phoneUser) => {
      const key = phoneUser.matched_user?.id ? `crm:${phoneUser.matched_user.id}` : `zoom:${phoneUser.name || phoneUser.email}`;
      addOption(
        key,
        phoneUser.matched_user?.name || phoneUser.name || phoneUser.email || 'Zoom user',
        phoneUser.matched_user?.email || phoneUser.email || phoneUser.connected_numbers.join(', ') || 'Zoom Phone',
        phoneUser.matched_user?.isActive === false,
        [phoneUser.matched_user?.email, phoneUser.email]
      );
    });

    const preparedOptions = Array.from(options.values())
      .sort((a, b) => Number(b.value.startsWith('crm:')) - Number(a.value.startsWith('crm:')));
    const canonicalOptions = preparedOptions.filter((option) => option.value.startsWith('crm:'));

    return preparedOptions
      .filter((option) => !userOptionLooksDuplicate(option, canonicalOptions))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [analytics.call_logs, analytics.recordings, crmUsers, liveStatus.phone_users]);

  const selectedUserOption = useMemo(
    () => userOptions.find((option) => option.value === userFilter),
    [userFilter, userOptions]
  );

  useEffect(() => {
    const selectedUserId = userFilter.startsWith('crm:') ? userFilter.slice(4) : '';
    if (user?.role !== 'admin' || !selectedUserId) {
      setSelectedUserSummary(null);
      setSelectedUserSummaryError('');
      setSelectedUserSummaryLoading(false);
      return;
    }

    let active = true;
    setSelectedUserSummary(null);
    setSelectedUserSummaryError('');
    setSelectedUserSummaryLoading(true);
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    void zoomPhoneApi.getUserCallSummary(selectedUserId, { from: fromDate, to: toDate, timezone })
      .then((response) => {
        if (!active) return;
        if (response.success && response.data) {
          setSelectedUserSummary(response.data);
        } else {
          setSelectedUserSummaryError(response.message || 'Unable to load this user’s Zoom call summary');
        }
      })
      .catch(() => {
        if (active) setSelectedUserSummaryError('Unable to load this user’s Zoom call summary');
      })
      .finally(() => {
        if (active) setSelectedUserSummaryLoading(false);
      });

    return () => {
      active = false;
    };
  }, [fromDate, toDate, user?.role, userFilter]);

  useEffect(() => {
    if (userFilter !== 'All' && !selectedUserOption) {
      setUserFilter('All');
    }
  }, [selectedUserOption, userFilter]);

  useEffect(() => {
    setHistoryPage(1);
  }, [debouncedQuery, directionFilter, fromDate, statusFilter, toDate, userFilter, historyPageSize]);

  const filteredHistory = useMemo(() => {
    const normalizedQuery = debouncedQuery.trim().toLowerCase();
    const selectedUserEmails = selectedUserOption
      ? getUserFilterEmails([selectedUserOption.label, selectedUserOption.meta, ...selectedUserOption.aliases])
      : [];

    return unifiedHistory.filter((item) => {
      const call = item.call;
      const recording = item.recording;
      const matchedUser = getHistoryMatchedUser(item);
      const searchable = [
        getHistoryName(item),
        getHistoryPhone(item),
        getHistoryAgent(item),
        getHistoryStatus(item),
        getHistoryDirection(item),
        getHistoryPrimaryRecording(item)?.recording_type,
        getHistoryPrimaryRecording(item)?.site?.name,
        getHistoryPrimaryRecording(item)?.owner?.phone_number,
        getHistoryPrimaryRecording(item)?.owner?.extension_number,
        call?.matched_lead?.email,
        recording?.matched_lead?.email,
        call?.matched_user?.email,
        recording?.matched_user?.email,
        call?.matched_user?.phone,
        recording?.matched_user?.phone,
        call?.caller_number,
        call?.callee_number,
        recording?.caller_number,
        recording?.callee_number,
        call?.owner?.phone_number,
        call?.owner?.extension_number,
        call?.site?.name,
        call?.result,
        call?.path
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const matchesSearch = !normalizedQuery || searchable.includes(normalizedQuery);
      const matchesStatus = statusFilter === 'All' || getHistoryStatus(item) === statusFilter;
      const matchesDirection = directionFilter === 'All' || getHistoryDirection(item) === directionFilter;
      const historyUserEmails = getUserFilterEmails([
        matchedUser?.email,
        call?.owner?.email,
        recording?.owner?.email,
        call?.user_email,
        recording?.user_email,
        call?.caller_email,
        call?.callee_email,
        recording?.caller_email,
        recording?.callee_email
      ]);
      const matchesUser =
        userFilter === 'All' ||
        getHistoryUserFilterKey(item) === userFilter ||
        selectedUserEmails.some((selectedEmail) => historyUserEmails.includes(selectedEmail));

      return matchesSearch && matchesStatus && matchesDirection && matchesUser;
    });
  }, [debouncedQuery, directionFilter, statusFilter, unifiedHistory, userFilter, selectedUserOption]);

  const filteredReport = useMemo(() => {
    const incomingItems = filteredHistory.filter((item) => isIncomingDirection(getHistoryDirection(item)));
    const outgoingItems = filteredHistory.filter((item) => isOutgoingDirection(getHistoryDirection(item)));
    const missedItems = filteredHistory.filter((item) => isMissedHistoryItem(item));
    const connectedItems = filteredHistory.filter((item) => isConnectedHistoryItem(item));
    const totalCalls = countUniqueCustomers(filteredHistory);
    const incomingCalls = countUniqueCustomers(incomingItems);
    const outgoingCalls = countUniqueCustomers(outgoingItems);
    const missedCalls = countUniqueCustomers(missedItems);
    const connectedCalls = countUniqueCustomers(connectedItems);
    const totalTalkTime = filteredHistory.reduce((total, item) => total + getHistoryDuration(item), 0);
    const recordedCallCount = filteredHistory.filter(hasHistoryRecording).length;
    const recordingFileCount = filteredHistory.reduce((total, item) => total + getHistoryRecordingCount(item), 0);

    return {
      totalCalls,
      totalCallAttempts: filteredHistory.length,
      incomingCalls,
      incomingCallAttempts: incomingItems.length,
      outgoingCalls,
      outgoingCallAttempts: outgoingItems.length,
      missedCalls,
      connectedCalls,
      totalTalkTime,
      recordedCallCount,
      recordingFileCount,
      averageCallDuration: filteredHistory.length ? Math.round(totalTalkTime / filteredHistory.length) : 0,
      answerRate: totalCalls ? Math.round((connectedCalls / totalCalls) * 100) : 0
    };
  }, [filteredHistory]);

  const historyTotalPages = Math.max(1, Math.ceil(filteredHistory.length / historyPageSize));
  const safeHistoryPage = Math.min(historyPage, historyTotalPages);
  const historyStartIndex = filteredHistory.length === 0 ? 0 : (safeHistoryPage - 1) * historyPageSize;
  const paginatedHistory = filteredHistory.slice(historyStartIndex, historyStartIndex + historyPageSize);

  const filteredAgentStats = useMemo(() => {
    const stats = new Map<
      string,
      {
        agent: string;
        email?: string;
        total_calls: number;
        connected_calls: number;
        missed_calls: number;
        total_duration: number;
        recordings: number;
        total_numbers: Set<string>;
        connected_numbers: Set<string>;
        missed_numbers: Set<string>;
        recording_numbers: Set<string>;
      }
    >();

    filteredHistory.forEach((item) => {
      const key = getHistoryUserFilterKey(item);
      const customerNumber = getHistoryCustomerNumber(item);
      const current =
        stats.get(key) ||
        {
          agent: getHistoryAgent(item),
          email: getHistoryUserEmail(item),
          total_calls: 0,
          connected_calls: 0,
          missed_calls: 0,
          total_duration: 0,
          recordings: 0,
          total_numbers: new Set<string>(),
          connected_numbers: new Set<string>(),
          missed_numbers: new Set<string>(),
          recording_numbers: new Set<string>()
        };
      if (customerNumber) current.total_numbers.add(customerNumber);
      current.total_duration += getHistoryDuration(item);
      if (isConnectedHistoryItem(item) && customerNumber) current.connected_numbers.add(customerNumber);
      if (isMissedHistoryItem(item) && customerNumber) current.missed_numbers.add(customerNumber);
      if (hasHistoryRecording(item) && customerNumber) current.recording_numbers.add(customerNumber);
      stats.set(key, current);
    });

    return Array.from(stats.values())
      .map((agent) => ({
        agent: agent.agent,
        email: agent.email,
        total_calls: agent.total_numbers.size,
        connected_calls: agent.connected_numbers.size,
        missed_calls: agent.missed_numbers.size,
        recordings: agent.recording_numbers.size,
        total_duration: agent.total_duration,
        average_call_duration: agent.total_numbers.size ? Math.round(agent.total_duration / agent.total_numbers.size) : 0,
        answer_rate: agent.total_numbers.size ? Math.round((agent.connected_numbers.size / agent.total_numbers.size) * 100) : 0
      }))
      .sort((left, right) => right.total_calls - left.total_calls);
  }, [filteredHistory]);

  const filteredDailyStats = useMemo(() => {
    const stats = new Map<
      string,
      {
        date: string;
        total_calls: number;
        incoming_calls: number;
        outgoing_calls: number;
        connected_calls: number;
        recorded_calls: number;
        total_numbers: Set<string>;
        incoming_numbers: Set<string>;
        outgoing_numbers: Set<string>;
        connected_numbers: Set<string>;
        recorded_numbers: Set<string>;
      }
    >();

    filteredHistory.forEach((item) => {
      const startedAt = getHistoryStartedAt(item);
      const date = startedAt && !Number.isNaN(new Date(startedAt).getTime())
        ? formatDateInput(new Date(startedAt))
        : 'Unknown date';
      const customerNumber = getHistoryCustomerNumber(item);
      const current =
        stats.get(date) ||
        {
          date,
          total_calls: 0,
          incoming_calls: 0,
          outgoing_calls: 0,
          connected_calls: 0,
          recorded_calls: 0,
          total_numbers: new Set<string>(),
          incoming_numbers: new Set<string>(),
          outgoing_numbers: new Set<string>(),
          connected_numbers: new Set<string>(),
          recorded_numbers: new Set<string>()
        };
      if (customerNumber) current.total_numbers.add(customerNumber);
      if (isIncomingDirection(getHistoryDirection(item)) && customerNumber) current.incoming_numbers.add(customerNumber);
      if (isOutgoingDirection(getHistoryDirection(item)) && customerNumber) current.outgoing_numbers.add(customerNumber);
      if (isConnectedHistoryItem(item) && customerNumber) current.connected_numbers.add(customerNumber);
      if (hasHistoryRecording(item) && customerNumber) current.recorded_numbers.add(customerNumber);
      stats.set(date, current);
    });

    return Array.from(stats.values())
      .map((day) => ({
        date: day.date,
        total_calls: day.total_numbers.size,
        incoming_calls: day.incoming_numbers.size,
        outgoing_calls: day.outgoing_numbers.size,
        connected_calls: day.connected_numbers.size,
        recorded_calls: day.recorded_numbers.size
      }))
      .sort((left, right) => right.date.localeCompare(left.date));
  }, [filteredHistory]);

  useEffect(() => {
    if (filteredHistory.length === 0) {
      setSelectedId(null);
      return;
    }

    if (!selectedId || !filteredHistory.some((item) => item.id === selectedId)) {
      setSelectedId(filteredHistory[0].id);
    }
  }, [filteredHistory, selectedId]);

  useEffect(() => {
    if (historyPage > historyTotalPages) {
      setHistoryPage(historyTotalPages);
    }
  }, [historyPage, historyTotalPages]);

  useEffect(() => {
    setSelectedId(null);
    setAudioUrl(null);
    setAudioCallId(null);
    setAudioLoadProgress(0);
    setAudioLoadStatus('');
    setRecordingLoading(false);
  }, [debouncedQuery, directionFilter, fromDate, statusFilter, toDate, userFilter]);

  const selectedHistoryItem = filteredHistory.find((item) => item.id === selectedId) || filteredHistory[0];
  const liveInventory = liveStatus.inventory.summary.total_numbers > 0 ? liveStatus.inventory : inventory;
  const liveInventorySummary = liveInventory.summary;
  const unassignedQueueCount = callQueueLeads.filter((lead) => !lead.assignedTo && !lead.assignedToUser).length;

  const resetAudio = () => {
    setAudioUrl(null);
    setAudioCallId(null);
    setAudioLoadProgress(0);
    setAudioLoadStatus('');
    setRecordingLoading(false);
  };

  const scrollToRecordingPanel = () => {
    window.setTimeout(() => {
      recordingPanelRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }, 80);
  };

  const loadRecordingFile = async (recordingId: string, recordingKey: string, downloadUrl?: string) => {
    if (!recordingId) return;
    if (audioUrl && audioCallId === recordingKey) {
      scrollToRecordingPanel();
      audioRef.current?.play().catch((error) => {
        if (isBenignPlayInterruption(error)) return;
        setAudioLoadStatus('Press play on the audio control to start playback');
      });
      return;
    }

    setRecordingLoading(true);
    setAudioLoadProgress(8);
    setAudioLoadStatus('Preparing secure Zoom stream...');
    try {
      const url = zoomPhoneApi.getRecordingAudioUrl(recordingId, { downloadUrl });
      resetAudio();
      setRecordingLoading(true);
      setAudioLoadProgress(18);
      setAudioLoadStatus('Connecting to audio player...');
      scrollToRecordingPanel();

      setAudioUrl(url);
      setAudioCallId(recordingKey);

      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.load();
        setAudioLoadProgress(36);
        setAudioLoadStatus('Starting playback...');
        await audioRef.current.play().catch((error) => {
          if (isBenignPlayInterruption(error)) {
            setAudioLoadStatus('Audio ready. Press play to start.');
            setRecordingLoading(false);
            return;
          }
          throw error;
        });
      }
    } catch (error) {
      if (isBenignPlayInterruption(error)) {
        setAudioLoadStatus('Audio ready. Press play to start.');
        setRecordingLoading(false);
        return;
      }
      setZoomError(error instanceof Error ? error.message : 'Unable to load this Zoom Phone recording');
      setAudioLoadStatus('Unable to load recording');
      setRecordingLoading(false);
    }
  };

  const updateBufferedProgress = (audio: HTMLAudioElement) => {
    if (!Number.isFinite(audio.duration) || audio.duration <= 0 || audio.buffered.length === 0) return;

    const bufferedEnd = audio.buffered.end(audio.buffered.length - 1);
    const bufferedPercent = Math.min(99, Math.max(20, Math.round((bufferedEnd / audio.duration) * 100)));
    setAudioLoadProgress(bufferedPercent);
    setAudioLoadStatus(`Buffering ${bufferedPercent}%`);
  };

  const getHistoryRecordingTarget = (item: UnifiedCallHistoryItem) => {
    const recording = getHistoryPrimaryRecording(item);
    if (recording) {
      return {
        id: getRecordingKey(recording),
        downloadUrl: recording.download_url || recording.file_url
      };
    }

    if (item.call?.has_recording || item.call?.recording_download_url || item.call?.recording_id) {
      return {
        id: getCallRecordingId(item.call),
        downloadUrl: item.call.recording_download_url
      };
    }

    return null;
  };

  const loadHistoryRecording = async (item: UnifiedCallHistoryItem) => {
    const target = getHistoryRecordingTarget(item);
    if (!target) return;
    await loadRecordingFile(target.id, item.id, target.downloadUrl);
  };

  const downloadHistoryRecording = async (item: UnifiedCallHistoryItem) => {
    const target = getHistoryRecordingTarget(item);
    if (!target) return;

    setRecordingLoading(true);
    try {
      const url = zoomPhoneApi.getRecordingAudioUrl(target.id, {
        downloadUrl: target.downloadUrl,
        disposition: 'attachment'
      });
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `zoom-phone-recording-${target.id}.mp3`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    } catch (error) {
      setZoomError(error instanceof Error ? error.message : 'Unable to download this Zoom Phone recording');
    } finally {
      setRecordingLoading(false);
    }
  };

  const liveCards = [
    {
      label: 'Active Calls',
      value: liveStatus.active_calls.length,
      helper: liveStatus.updated_at ? `Updated ${formatDateTime(liveStatus.updated_at)}` : 'Current Zoom Phone metrics',
      icon: Headphones,
      tone: 'metric-card--blue'
    },
    {
      label: 'Zoom Numbers',
      value: liveInventorySummary.total_numbers,
      helper: `${liveInventorySummary.assigned_numbers} assigned numbers`,
      icon: PhoneCall,
      tone: 'metric-card--green'
    },
    {
      label: 'Phone Users',
      value: liveStatus.phone_users.length || liveInventorySummary.total_users,
      helper: `${liveStatus.phone_users.filter((phoneUser) => phoneUser.live_status === 'on_call').length} currently on call`,
      icon: UserRound,
      tone: 'metric-card--amber'
    },
    {
      label: 'Ready To Call',
      value: callQueueLeads.length,
      helper: `${unassignedQueueCount} unassigned leads`,
      icon: CalendarClock,
      tone: 'metric-card--slate'
    }
  ];

  const historyCards = [
    {
      label: 'Unique Contacts',
      value: filteredReport.totalCalls,
      helper: `${filteredReport.totalCallAttempts} Zoom call-log records`,
      icon: PhoneCall,
      tone: 'metric-card--blue'
    },
    {
      label: 'Unique Incoming Contacts',
      value: filteredReport.incomingCalls,
      helper: `${filteredReport.incomingCallAttempts} incoming log records`,
      icon: Headphones,
      tone: 'metric-card--green'
    },
    {
      label: 'Unique Outgoing Contacts',
      value: filteredReport.outgoingCalls,
      helper: `${filteredReport.outgoingCallAttempts} outgoing log records`,
      icon: BarChart3,
      tone: 'metric-card--amber'
    },
    {
      label: 'Unique Missed Contacts',
      value: filteredReport.missedCalls,
      helper: 'Needs callback follow-up',
      icon: Voicemail,
      tone: 'metric-card--rose'
    },
    {
      label: 'Contact Answer Rate',
      value: `${filteredReport.answerRate}%`,
      helper: `${filteredReport.connectedCalls} unique connected contacts`,
      icon: CheckCircle,
      tone: 'metric-card--green'
    },
    {
      label: 'Avg Log Duration',
      value: formatDuration(filteredReport.averageCallDuration),
      helper: `${formatTalkTime(filteredReport.totalTalkTime)} summed Zoom log duration`,
      icon: Clock,
      tone: 'metric-card--blue'
    },
    {
      label: 'Recordings',
      value: filteredReport.recordedCallCount,
      helper: `${filteredReport.recordingFileCount} recording file${filteredReport.recordingFileCount === 1 ? '' : 's'} matched`,
      icon: Mic,
      tone: 'metric-card--amber'
    }
  ];

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <div className="page-header__eyebrow">
            <PhoneCall className="h-4 w-4" />
            Zoom Phone
          </div>
          <h1 className="page-title">Phone Calling</h1>
          <p className="page-description">
            Track live Zoom Phone usage, call recordings, user ownership, and lead follow-ups from one CRM workspace.
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-secondary" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <Link to={callQueueLeads[0]?._id ? `/leads/${callQueueLeads[0]._id}` : '/leads'} className="btn btn-primary">
            <PhoneCall className="h-4 w-4" />
            Open Next Lead
          </Link>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
              <button
                type="button"
                className={`rounded-md px-4 py-2 text-sm font-extrabold transition ${
                  activeView === 'live' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-950'
                }`}
                onClick={() => setActiveView('live')}
              >
                Live Calling
              </button>
              <button
                type="button"
                className={`rounded-md px-4 py-2 text-sm font-extrabold transition ${
                  activeView === 'history' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-950'
                }`}
                onClick={() => setActiveView('history')}
              >
                Call History
              </button>
            </div>
            <div className="text-sm font-semibold text-gray-500">
              {zoomStatus?.configured ? 'Zoom Phone connected' : 'Configuration required'}
            </div>
          </div>
        </div>
      </div>

      {zoomError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
            <div>
              <p className="font-extrabold">Zoom Phone notice</p>
              <p className="mt-1">{zoomError}</p>
            </div>
          </div>
        </div>
      )}

      {user?.role !== 'admin' && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          Account-wide Zoom Phone reporting is available to admins. Open a lead profile to view lead-specific calls and recordings.
        </div>
      )}

      {analytics.recordings_error && activeView === 'history' && (
        <div className="rounded-lg border border-amber-200 bg-white p-4 text-sm text-amber-800">
          Call logs loaded, but Zoom Phone recordings could not be synced: {analytics.recordings_error}
        </div>
      )}

      {activeView === 'live' && (
        <>
          <div className="metric-grid">
            {liveCards.map((metric) => {
              const Icon = metric.icon;
              return (
	                <div
	                  key={metric.label}
	                  className={`metric-card ${metric.tone} ${metric.label === 'Recordings' ? 'metric-card--wide' : ''}`}
	                >
                  <div className="metric-card__top">
                    <p className="metric-card__label">{metric.label}</p>
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="metric-card__value">{loading ? '...' : metric.value}</p>
                  <p className="metric-card__change">{metric.helper}</p>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_420px]">
            <div className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">Live Calling</h2>
                  <p className="card-subtitle">Users currently on Zoom Phone calls and the number/account in use</p>
                </div>
                <span className="status-pill status-pill--blue">{liveStatus.active_calls.length} active</span>
              </div>
              <div className="card-body">
                {loading ? (
                  <div className="space-y-3">
                    <div className="skeleton h-20" />
                    <div className="skeleton h-20" />
                  </div>
                ) : liveStatus.active_calls.length > 0 ? (
                  <div className="space-y-3">
                    {liveStatus.active_calls.map((call) => (
                      <div key={call.call_id || `${call.date_time}-${getMetricPartyText(call)}`} className="rounded-lg border border-blue-200 bg-blue-50/60 p-4">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={statusClass('on_call')}>On call</span>
                              <span className={directionClass(call.direction || 'Unknown')}>{call.direction || 'Unknown'}</span>
                            </div>
                            <h3 className="mt-3 text-lg font-extrabold text-gray-950">{getMetricCallAgent(call)}</h3>
                            <p className="mt-1 text-sm text-gray-600">{getMetricPartyText(call)}</p>
                            <p className="mt-1 text-sm text-gray-500">Started {formatDateTime(call.date_time)}</p>
                          </div>
                          <div className="rounded-lg border border-blue-200 bg-white p-3 text-sm">
                            <p className="text-xs font-bold uppercase text-gray-500">Zoom number/account</p>
                            <p className="mt-1 font-extrabold text-gray-950">{call.zoom_account || 'Not returned by Zoom'}</p>
                            <p className="mt-1 text-gray-500">Connected with {call.connected_number || 'unknown number'}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="lead-empty-state">
                    <Headphones className="h-10 w-10" />
                    <h3>No live calls right now</h3>
                    <p>When Zoom reports an active or ringing phone call, the user and Zoom number will appear here.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">Phone Users</h2>
                  <p className="card-subtitle">CRM user match, extension, number, and availability</p>
                </div>
              </div>
              <div className="card-body space-y-3">
                {liveStatus.phone_users.length > 0 ? (
                  liveStatus.phone_users.map((phoneUser) => (
                    <div key={phoneUser.id || phoneUser.phone_user_id || phoneUser.email} className="rounded-lg border border-gray-200 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="flex min-w-0 items-center gap-2 font-extrabold text-gray-950">
                            <span className="truncate">{phoneUser.matched_user?.name || phoneUser.name || phoneUser.email || 'Zoom user'}</span>
                            <InactiveUserDot inactive={phoneUser.matched_user?.isActive === false} />
                          </p>
                          <p className="mt-1 truncate text-sm text-gray-500">
                            {phoneUser.matched_user?.email || phoneUser.email || 'No email returned'}
                          </p>
                        </div>
                        <span className={statusClass(phoneUser.live_status)}>{phoneUser.live_status === 'on_call' ? 'On call' : 'Available'}</span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="font-bold uppercase text-gray-400">Extension</p>
                          <p className="font-semibold text-gray-800">{phoneUser.extension_number || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="font-bold uppercase text-gray-400">Zoom Number</p>
                          <p className="font-semibold text-gray-800">{phoneUser.connected_numbers.join(', ') || 'Not assigned'}</p>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-500">No Zoom Phone users returned for this account.</p>
                )}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">Zoom Phone Numbers</h2>
                <p className="card-subtitle">Assigned numbers, current inventory status, and capability</p>
              </div>
              <span className="status-pill status-pill--blue">
                {liveInventorySummary.total_numbers} numbers / {liveInventorySummary.total_users} users
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="table min-w-[760px]">
                <thead>
                  <tr>
                    <th>Number</th>
                    <th>Status</th>
                    <th>Assigned To</th>
                    <th>Capability</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {liveInventory.phone_numbers.map((phoneNumber) => (
                    <tr key={phoneNumber.id || phoneNumber.number}>
                      <td>
                        <p className="font-bold text-gray-900">{phoneNumber.display_number || phoneNumber.number || 'Unknown number'}</p>
                        <p className="text-xs text-gray-500">{phoneNumber.location || phoneNumber.site?.name || 'Default site'}</p>
                      </td>
                      <td>
                        <span className={statusClass(phoneNumber.status || 'Unknown')}>{phoneNumber.status || 'Unknown'}</span>
                      </td>
                      <td>
                        <p className="font-semibold text-gray-800">{phoneNumber.assignee?.name || 'Unassigned'}</p>
                        <p className="text-xs text-gray-500">{phoneNumber.assignee?.extension_number || phoneNumber.assignee?.extension_type || ''}</p>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {(phoneNumber.capability || []).length > 0 ? (
                            phoneNumber.capability?.map((capability) => (
                              <span key={capability} className="status-pill status-pill--slate">
                                {capability}
                              </span>
                            ))
                          ) : (
                            <span className="text-sm text-gray-500">Not returned</span>
                          )}
                        </div>
                      </td>
                      <td>{phoneNumber.source || 'Zoom Phone'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!loading && liveInventory.phone_numbers.length === 0 && (
                <div className="p-8 text-center text-sm text-gray-500">No Zoom Phone numbers returned for this account.</div>
              )}
            </div>
          </div>
        </>
      )}

      {activeView === 'history' && (
        <>
          <div className="card">
            <div className="card-body">
              <div className="call-filter-grid">
                <label className="call-filter-date space-y-1">
                  <span className="text-xs font-bold uppercase text-gray-500">From</span>
                  <input
                    type="date"
                    className="form-input"
                    value={fromDate}
                    max={toDate}
                    onChange={(event) => setFromDate(event.target.value)}
                  />
                </label>
                <label className="call-filter-date space-y-1">
                  <span className="text-xs font-bold uppercase text-gray-500">To</span>
                  <input
                    type="date"
                    className="form-input"
                    value={toDate}
                    min={fromDate}
                    onChange={(event) => setToDate(event.target.value)}
                  />
                </label>
                <div className="call-filter-search relative self-end">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="search"
                    className="form-input pl-10"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search lead name, phone, email, agent, result, or site"
                  />
                </div>
                <select value={userFilter} onChange={(event) => setUserFilter(event.target.value)} className="call-filter-user form-input self-end" aria-label="Filter by user">
                  <option value="All">All users</option>
                  {userOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.inactive ? `${option.label} - inactive` : option.label}
                    </option>
                  ))}
                </select>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="call-filter-status form-input self-end" aria-label="Call status">
                  <option value="All">All statuses</option>
                  {availableStatuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
                <select value={directionFilter} onChange={(event) => setDirectionFilter(event.target.value)} className="call-filter-direction form-input self-end" aria-label="Call direction">
                  <option value="All">All directions</option>
                  {availableDirections.map((direction) => (
                    <option key={direction} value={direction}>
                      {direction}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {selectedUserOption && (
            <div className="card">
              <div className="card-body">
                <div className="flex flex-col gap-5">
                  <div className="flex items-center gap-3">
                    <span className="avatar">
                      <UserRound className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-xs font-bold uppercase text-gray-500">Selected user report</p>
                      <h2 className="flex items-center gap-2 text-lg font-extrabold text-gray-950">
                        <span>{selectedUserOption.label}</span>
                        <InactiveUserDot inactive={selectedUserOption.inactive} />
                      </h2>
                      <p className="text-sm text-gray-500">{selectedUserOption.meta}</p>
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-bold text-gray-800">Zoom user activity</p>
                      <p className="text-xs text-gray-500">Same as the salesperson dashboard · date filters only</p>
                    </div>
                    {selectedUserSummaryLoading ? (
                      <p className="text-sm text-gray-500">Loading Zoom user activity…</p>
                    ) : selectedUserSummaryError ? (
                      <p className="text-sm text-rose-600">{selectedUserSummaryError}</p>
                    ) : selectedUserSummary && !selectedUserSummary.linked ? (
                      <p className="text-sm text-amber-700">This CRM user is not linked to a Zoom Phone user or number assignment.</p>
                    ) : selectedUserSummary ? (
                      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 xl:grid-cols-5">
                        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                          <p className="font-extrabold text-gray-950">{selectedUserSummary.outbound_calls}</p>
                          <p className="text-gray-600">Outbound attempts</p>
                        </div>
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                          <p className="font-extrabold text-gray-950">{selectedUserSummary.connected_outbound_calls}</p>
                          <p className="text-gray-600">Answered outbound</p>
                        </div>
                        <div className="rounded-lg border border-violet-200 bg-violet-50 p-3">
                          <p className="font-extrabold text-gray-950">{selectedUserSummary.unique_outbound_contacts}</p>
                          <p className="text-gray-600">Unique people called</p>
                        </div>
                        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                          <p className="font-extrabold text-gray-950">{selectedUserSummary.inbound_calls}</p>
                          <p className="text-gray-600">Inbound calls</p>
                        </div>
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                          <p className="font-extrabold text-gray-950">{formatTalkTime(selectedUserSummary.talk_time_seconds)}</p>
                          <p className="text-gray-600">Actual talk time</p>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div>
                    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-bold text-gray-800">Account call-log coverage</p>
                      <p className="text-xs text-gray-500">Admin metrics feed · uses all Call History filters</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <p className="font-extrabold text-gray-950">{filteredReport.totalCalls}</p>
                      <p className="text-gray-500">Unique contacts</p>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <p className="font-extrabold text-gray-950">{filteredReport.totalCallAttempts}</p>
                      <p className="text-gray-500">Call-log records</p>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <p className="font-extrabold text-gray-950">{filteredReport.connectedCalls}</p>
                      <p className="text-gray-500">Connected contacts</p>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <p className="font-extrabold text-gray-950">{formatTalkTime(filteredReport.totalTalkTime)}</p>
                      <p className="text-gray-500">Summed log duration</p>
                    </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="metric-grid">
            {historyCards.map((metric) => {
              const Icon = metric.icon;
              return (
                <div key={metric.label} className={`metric-card ${metric.tone}`}>
                  <div className="metric-card__top">
                    <p className="metric-card__label">{metric.label}</p>
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="metric-card__value">{loading ? '...' : metric.value}</p>
                  <p className="metric-card__change">{metric.helper}</p>
                </div>
              );
            })}
          </div>

          <div className="split-grid">
            <div className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">Call History</h2>
                  <p className="card-subtitle">
                    Showing {filteredHistory.length === 0 ? 0 : historyStartIndex + 1}-
                    {Math.min(historyStartIndex + historyPageSize, filteredHistory.length)} of {filteredHistory.length} call logs from {fromDate} to {toDate}
                  </p>
                </div>
                <span className="status-pill status-pill--slate">{unifiedHistory.length} synced</span>
              </div>
              <div className="call-history-scroll">
                <table className="table calls-history-table">
                  <thead>
                    <tr>
                      <th>Lead / Number</th>
                      <th>Direction</th>
                      <th>Status</th>
                      <th>Duration</th>
                      <th>User</th>
                      <th>Recording</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedHistory.map((item) => {
                      const recordingCount = getHistoryRecordingCount(item);
                      return (
                        <tr
                          key={item.id}
                          className={selectedHistoryItem?.id === item.id ? 'bg-blue-50' : ''}
                          onClick={() => {
                            setSelectedId(item.id);
                            resetAudio();
                            if (getHistoryRecordingCount(item) > 0) {
                              scrollToRecordingPanel();
                            }
                          }}
                        >
                          <td data-label="Lead / Number">
                            <div>
                              <p className="font-bold text-gray-900">{getHistoryName(item)}</p>
                              <p className="text-xs text-gray-500">{getHistoryPhone(item)}</p>
                              {getHistoryLeadEmail(item) && <p className="text-xs text-gray-400">{getHistoryLeadEmail(item)}</p>}
                            </div>
                          </td>
                          <td data-label="Direction">
                            <div className="inline-flex min-w-[96px] flex-col items-start gap-1">
                              <span className={directionClass(getHistoryDirection(item))}>{getHistoryDirection(item)}</span>
                              <span className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                                {formatCompactDateTime(getHistoryStartedAt(item))}
                              </span>
                            </div>
	                          </td>
	                          <td data-label="Status">
	                            <span className="font-semibold text-gray-700">{getHistoryStatus(item)}</span>
	                          </td>
                          <td data-label="Duration">{formatDuration(getHistoryDuration(item))}</td>
                          <td data-label="User">
                            <p className="flex items-center gap-2 font-semibold text-gray-800">
                              <span>{getHistoryAgent(item)}</span>
                              <InactiveUserDot inactive={getHistoryMatchedUser(item)?.isActive === false} />
                            </p>
                            {getHistoryUserEmail(item) && <p className="text-xs text-gray-500">{getHistoryUserEmail(item)}</p>}
                          </td>
                          <td data-label="Recording">
                            {recordingCount > 0 ? (
                              <span className="status-pill status-pill--green">
                                {recordingCount} file{recordingCount === 1 ? '' : 's'}
                              </span>
                            ) : (
                              <span className="status-pill status-pill--slate">None</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {filteredHistory.length > 0 && (
                <div className="flex flex-col gap-3 border-t border-gray-200 bg-gray-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
                    <label htmlFor="call-history-page-size" className="font-semibold text-gray-700">
                      Rows per page
                    </label>
                    <select
                      id="call-history-page-size"
                      className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      value={historyPageSize}
                      onChange={(event) => setHistoryPageSize(Number(event.target.value))}
                      aria-label="Call history rows per page"
                    >
                      {[10, 15, 25, 50].map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                    <span className="text-gray-400">|</span>
                    <span>
                      {historyStartIndex + 1}-{Math.min(historyStartIndex + historyPageSize, filteredHistory.length)} of {filteredHistory.length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-gray-200">
                      Page {safeHistoryPage} / {historyTotalPages}
                    </span>
                    <div className="flex items-center overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                      <button
                        type="button"
                        className="flex h-9 w-10 items-center justify-center text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300"
                        onClick={() => setHistoryPage((page) => Math.max(1, page - 1))}
                        disabled={safeHistoryPage === 1}
                        aria-label="Previous page"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <div className="h-9 w-px bg-gray-200" />
                      <button
                        type="button"
                        className="flex h-9 w-10 items-center justify-center text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300"
                        onClick={() => setHistoryPage((page) => Math.min(historyTotalPages, page + 1))}
                        disabled={safeHistoryPage === historyTotalPages}
                        aria-label="Next page"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {!loading && filteredHistory.length === 0 && (
                <div className="py-12 text-center">
                  <Mic className="mx-auto mb-3 h-10 w-10 text-gray-300" />
                  <h3 className="text-lg font-extrabold text-gray-900">No Zoom Phone records found</h3>
                  <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
                    Adjust the date range, user filter, or search text to find matching calls and recordings.
                  </p>
                </div>
              )}
            </div>

            {selectedHistoryItem && (
              <div className="card">
                <div className="card-header">
                  <div>
                    <h2 className="card-title">Call Details</h2>
                    <p className="card-subtitle">
                      {selectedHistoryItem.call?.id ||
                        selectedHistoryItem.call?.call_id ||
                        getHistoryPrimaryRecording(selectedHistoryItem)?.id ||
                        'Zoom Phone record'}
                    </p>
                  </div>
	                  <span className="text-sm font-semibold text-gray-600">{getHistoryStatus(selectedHistoryItem)}</span>
                </div>
                <div className="card-body space-y-5">
                  <div className="flex items-start gap-3">
                    <span className="avatar">
                      <UserRound className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-lg font-extrabold text-gray-900">{getHistoryName(selectedHistoryItem)}</p>
                      <p className="text-sm font-semibold text-gray-700">{getHistoryPhone(selectedHistoryItem)}</p>
                      <p className="text-sm text-gray-500">
                        {selectedHistoryItem.call?.caller_number ||
                          selectedHistoryItem.recording?.caller_number ||
                          'Unknown caller'}{' '}
                        to{' '}
                        {selectedHistoryItem.call?.callee_number ||
                          selectedHistoryItem.recording?.callee_number ||
                          'Unknown recipient'}
                      </p>
                    </div>
                  </div>

                  <div className="call-detail-metrics">
                    <div className="rounded-lg border border-gray-200 p-3">
                      <p className="text-xs font-bold uppercase text-gray-500">User</p>
                      <p className="mt-1 flex items-center gap-2 font-bold text-gray-900">
                        <span>{getHistoryAgent(selectedHistoryItem)}</span>
                        <InactiveUserDot inactive={getHistoryMatchedUser(selectedHistoryItem)?.isActive === false} />
                      </p>
                    </div>
                    <div className="rounded-lg border border-gray-200 p-3">
                      <p className="text-xs font-bold uppercase text-gray-500">Duration</p>
                      <p className="mt-1 font-bold text-gray-900">{formatDuration(getHistoryDuration(selectedHistoryItem))}</p>
                    </div>
                    <div className="rounded-lg border border-gray-200 p-3">
                      <p className="text-xs font-bold uppercase text-gray-500">Extension</p>
                      <p className="mt-1 font-bold text-gray-900">
                        {selectedHistoryItem.call?.owner?.extension_number ||
                          getHistoryPrimaryRecording(selectedHistoryItem)?.owner?.extension_number ||
                          'Not available'}
                      </p>
                    </div>
                    <div className="rounded-lg border border-gray-200 p-3">
                      <p className="text-xs font-bold uppercase text-gray-500">Site</p>
                      <p className="mt-1 font-bold text-gray-900">
                        {selectedHistoryItem.call?.site?.name || getHistoryPrimaryRecording(selectedHistoryItem)?.site?.name || 'Default'}
                      </p>
                    </div>
                  </div>

                  <div ref={recordingPanelRef}>
                    <p className="mb-2 flex items-center gap-2 text-sm font-bold text-gray-900">
                      <Mic className="h-4 w-4" />
                      Recording
                    </p>
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                      {hasHistoryRecording(selectedHistoryItem) ? (
                        <div className="space-y-3">
                          <div className="recording-actions">
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => loadHistoryRecording(selectedHistoryItem)}
                              disabled={recordingLoading}
                            >
                              <Play className="h-4 w-4" />
                              {recordingLoading ? 'Loading' : 'Play Recording'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => downloadHistoryRecording(selectedHistoryItem)}
                              disabled={recordingLoading}
                            >
                              <Download className="h-4 w-4" />
                              Download
                            </button>
                          </div>
                          <div className="space-y-3">
                            {(recordingLoading || (audioUrl && audioCallId === selectedHistoryItem.id)) && (
                              <div className="recording-progress rounded-lg border border-blue-100 bg-white p-3">
                                <div className="mb-2 flex items-center justify-between text-xs font-bold text-blue-700">
                                  <span>{audioLoadStatus || 'Ready to load recording'}</span>
                                  <span>{audioLoadProgress}%</span>
                                </div>
                                <div className="h-2 overflow-hidden rounded-full bg-blue-100">
                                  <div
                                    className="h-full rounded-full bg-blue-600 transition-all duration-300"
                                    style={{ width: `${Math.max(audioLoadProgress, audioUrl ? 100 : 6)}%` }}
                                  />
                                </div>
                              </div>
                            )}
                            {!audioUrl && !recordingLoading && (
                              <p className="text-sm font-semibold text-gray-500">Click Play Recording to load the audio stream.</p>
                            )}
                              <audio
                                ref={audioRef}
                                controls
                                crossOrigin="anonymous"
                                preload="metadata"
                                className="recording-audio"
                              src={audioCallId === selectedHistoryItem.id ? audioUrl || undefined : undefined}
                                onLoadStart={() => {
                                  setRecordingLoading(true);
                                  setAudioLoadProgress((current) => Math.max(current, 20));
                                  setAudioLoadStatus('Loading audio metadata...');
                                }}
                                onProgress={(event) => updateBufferedProgress(event.currentTarget)}
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
                                  setRecordingLoading(false);
                                }}
                                onWaiting={() => {
                                  setRecordingLoading(true);
                                  setAudioLoadStatus('Buffering audio...');
                                }}
                                onError={() => {
                                  setRecordingLoading(false);
                                  if (!audioUrl || audioCallId !== selectedHistoryItem.id) return;
                                  setAudioLoadStatus('Unable to play recording');
                                  const mediaError = audioRef.current?.error;
                                  const errorCode = mediaError?.code ? ` Media error code: ${mediaError.code}.` : '';
                                  setZoomError(`Unable to play this Zoom recording.${errorCode} Please try Download, or refresh and play again.`);
                                }}
                              >
                                <track kind="captions" />
                              </audio>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">No recording metadata returned for this call.</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-sm font-bold text-gray-900">Zoom Phone Metadata</p>
                    <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-600">
                      <p>
                        <strong className="text-gray-900">Type:</strong>{' '}
                        {getHistoryPrimaryRecording(selectedHistoryItem)?.recording_type ||
                          selectedHistoryItem.call?.recording_type ||
                          'Call log'}
                      </p>
                      <p>
                        <strong className="text-gray-900">Result:</strong>{' '}
                        {selectedHistoryItem.call?.result || getHistoryStatus(selectedHistoryItem) || 'Not available'}
                      </p>
                      <p>
                        <strong className="text-gray-900">Path:</strong> {selectedHistoryItem.call?.path || 'Not available'}
                      </p>
                      <p>
                        <strong className="text-gray-900">Started:</strong> {formatDateTime(getHistoryStartedAt(selectedHistoryItem))}
                      </p>
                      <p>
                        <strong className="text-gray-900">Ended:</strong>{' '}
                        {formatDateTime(selectedHistoryItem.call?.call_end_time || getHistoryPrimaryRecording(selectedHistoryItem)?.end_time)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <div className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">User Performance</h2>
                  <p className="card-subtitle">Calls, recordings, talk time, and answer rate by matched user</p>
                </div>
              </div>
              <div className="card-body space-y-3">
                {filteredAgentStats.map((agent) => (
                  <div key={agent.agent} className="rounded-lg border border-gray-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-extrabold text-gray-950">{agent.agent}</p>
                        <p className="text-sm text-gray-500">{agent.email || 'Zoom Phone'}</p>
                      </div>
                      <span className="status-pill status-pill--blue">{agent.total_calls} calls</span>
                    </div>
                    <div className="mt-4 grid grid-cols-4 gap-3 text-sm">
                      <div>
                        <p className="font-bold text-gray-900">{agent.connected_calls}</p>
                        <p className="text-gray-500">Connected</p>
                      </div>
                      <div>
                        <p className="font-bold text-gray-900">{agent.missed_calls}</p>
                        <p className="text-gray-500">Missed</p>
                      </div>
                      <div>
                        <p className="font-bold text-gray-900">{formatDuration(agent.average_call_duration)}</p>
                        <p className="text-gray-500">Avg</p>
                      </div>
                      <div>
                        <p className="font-bold text-gray-900">{agent.answer_rate}%</p>
                        <p className="text-gray-500">Answer</p>
                      </div>
                    </div>
                  </div>
                ))}
                {filteredAgentStats.length === 0 && <p className="text-sm text-gray-500">No user performance records in this range.</p>}
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">Daily Trend</h2>
                  <p className="card-subtitle">Call movement in the selected date range</p>
                </div>
              </div>
              <div className="card-body space-y-3">
                {filteredDailyStats.map((day) => (
                  <div key={day.date} className="rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-extrabold text-gray-950">{day.date}</p>
                      <span className="status-pill status-pill--slate">{day.total_calls} calls</span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-blue-600"
                        style={{ width: `${filteredReport.totalCalls ? Math.min((day.total_calls / filteredReport.totalCalls) * 100, 100) : 0}%` }}
                      />
                    </div>
                    <div className="mt-3 grid grid-cols-4 gap-3 text-xs text-gray-500">
                      <span>{day.incoming_calls} incoming</span>
                      <span>{day.outgoing_calls} outgoing</span>
                      <span>{day.connected_calls} connected</span>
                      <span>{day.recorded_calls} recorded</span>
                    </div>
                  </div>
                ))}
                {filteredDailyStats.length === 0 && <p className="text-sm text-gray-500">No daily trend records in this range.</p>}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Calls;
