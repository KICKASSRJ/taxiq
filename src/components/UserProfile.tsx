import React, { useEffect, useState } from 'react';
import type { UserProfile as UserProfileType } from '../services/auth-service';
import { fetchProfile } from '../services/auth-service';

interface UserProfileProps {
  onClose: () => void;
}

export function UserProfile({ onClose }: UserProfileProps) {
  const [profile, setProfile] = useState<UserProfileType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchProfile()
      .then(data => { if (!cancelled) setProfile(data); })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="profile-panel"><div className="spinner" /></div>;
  if (error) return <div className="profile-panel"><p className="login-error">{error}</p></div>;
  if (!profile) return null;

  return (
    <div className="profile-panel">
      <div className="profile-header-row">
        <h2>👤 {profile.displayName}</h2>
        <button className="btn-secondary btn-sm" onClick={onClose}>✕ Close</button>
      </div>
      <p className="text-muted">@{profile.username} · Member since {new Date(profile.createdAt).toLocaleDateString()}</p>

      <h3 style={{ marginTop: '1.5rem' }}>Activity History</h3>
      {(!profile.activity || profile.activity.length === 0) ? (
        <p className="text-muted" style={{ marginTop: '0.5rem' }}>
          No activity yet. Upload a CAS PDF or run a demo to generate your first FBAR report.
        </p>
      ) : (
        <div className="activity-list">
          {profile.activity.map(a => (
            <div key={a.id} className="activity-item">
              <div className="activity-summary">
                <span className="activity-icon">
                  {a.type === 'fbar_report' ? '📊' : a.type === 'csv_export' ? '📥' : '📋'}
                </span>
                <span>{a.summary}</span>
              </div>
              <span className="activity-time">
                {new Date(a.timestamp).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
