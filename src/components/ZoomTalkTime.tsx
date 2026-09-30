import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Clock, PhoneCall, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { zoomPhoneApi } from '../lib/api';
import type { ZoomTalkTimeResponse } from '../types';

const formatTalkTime = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours ? `${hours}h ${minutes}m ${remainder}s` : `${minutes}m ${remainder}s`;
};

export default function ZoomTalkTime() {
  const { user } = useAuth();
  const [data, setData] = useState<ZoomTalkTimeResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const refreshRef = useRef<() => void>(() => {});
  const refresh = useCallback(() => refreshRef.current(), []);

  useEffect(() => {
    let active = true;
    let pending = false;
    setData(null);
    setError('');
    setLoading(true);
    const fetchTalkTime = async () => {
      if (pending || !user?._id) return;
      pending = true;
      setLoading(true);
      try {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        const response = await zoomPhoneApi.getMyTalkTime(timezone);
        if (!active) return;
        if (response.success && response.data) {
          setData(response.data);
          setError('');
        } else {
          setError(response.message || 'Unable to load your Zoom talk time.');
        }
      } catch {
        if (active) setError('Unable to load your Zoom talk time.');
      } finally {
        pending = false;
        if (active) setLoading(false);
      }
    };
    refreshRef.current = fetchTalkTime;
    void fetchTalkTime();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void fetchTalkTime();
    }, 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
      refreshRef.current = () => {};
    };
  }, [user?._id]);

  return (
    <section className="card" aria-label="Your Zoom Phone activity" aria-busy={loading}>
      <div className="card-header">
        <div>
          <h2 className="card-title">Your Zoom Phone Activity</h2>
          <p className="card-subtitle">Actual talk time, call attempts, and unique contacts · Week starts Sunday</p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={refresh} disabled={loading} aria-label="Refresh your Zoom Phone activity">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>
      <div className="card-body">
        {error ? (
          <div className="flex items-start gap-2 text-sm text-rose-600" role="alert">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p>{error}</p>
          </div>
        ) : data && !data.linked ? (
          <p className="text-sm text-gray-600">Your Zoom Phone account is not linked yet. Ask your CRM admin to check your Zoom email or phone-number assignment.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { label: 'Today', period: data?.daily, icon: PhoneCall },
              { label: 'This week', period: data?.weekly, icon: Clock }
            ].map(({ label, period, icon: Icon }) => (
              <div key={label} className="metric-card metric-card--blue">
                <div className="metric-card__top">
                  <p className="metric-card__label">{label}</p>
                  <Icon className="h-5 w-5" />
                </div>
                <p className="metric-card__value">{period === undefined ? 'Loading…' : formatTalkTime(period.talk_time_seconds)}</p>
                <p className="metric-card__change">
                  {period === undefined
                    ? 'Retrieving Zoom calls'
                    : `${period.connected_outbound_calls} answered outbound · ${period.outbound_calls} outbound attempts`}
                </p>
                {period && (
                  <p className="mt-1 text-xs text-gray-500">
                    {period.unique_outbound_contacts} unique people called · {period.inbound_calls} inbound · {period.total_calls} total calls
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
        {data && !error && data.linked && (
          <p className="mt-3 text-xs text-gray-500">
            {data.timezone} · Week: {data.weekly.from} to {data.weekly.to} · Updated {new Date(data.updated_at).toLocaleTimeString()} · Refreshes every minute
          </p>
        )}
        {data && !error && data.linked && (
          <p className="mt-1 text-xs text-gray-500">
            Talk time excludes ringing. Attempts count unique Zoom calls; unique people count distinct external phone numbers.
          </p>
        )}
      </div>
    </section>
  );
}
