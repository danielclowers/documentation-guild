import { useEffect, useState } from 'react';
import type { GuildInvitation, GuildMember } from '@guild/shared';
import { accountError, type AccountApi } from './api';

export function AdminPanel({ request }: { request: AccountApi }) {
  const [open, setOpen] = useState(false);
  const [invitations, setInvitations] = useState<GuildInvitation[]>([]);
  const [members, setMembers] = useState<GuildMember[]>([]);
  const [link, setLink] = useState('');
  const [linkLabel, setLinkLabel] = useState('One-use invitation link');
  const [recoveryMember, setRecoveryMember] = useState<GuildMember>();
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const options = { signal: controller.signal };
    void Promise.all([
      request<{ invitations: GuildInvitation[] }>('/admin/invitations', options),
      request<{ members: GuildMember[] }>('/admin/members', options),
    ])
      .then(([invites, roster]) => {
        if (!controller.signal.aborted) {
          setInvitations(invites.invitations);
          setMembers(roster.members);
        }
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(accountError(err));
      });
    return () => controller.abort();
  }, [open, request, revision]);

  async function update(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      setRevision((value) => value + 1);
    } catch (err) {
      setError(accountError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="guild-admin" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Guild administration</summary>
      <h3>Invitations</h3>
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          void update(async () => {
            const invite = await request<{ url: string }>('/admin/invitations', { method: 'POST' });
            setLink(invite.url);
            setLinkLabel('One-use invitation link');
            setNotice('Invitation created. Share the link with one coworker.');
          })
        }
      >
        Create invitation
      </button>
      {link && (
        <div className="invite-link">
          <label>
            {linkLabel}
            <input value={link} readOnly onFocus={(event) => event.currentTarget.select()} />
          </label>
          <button
            type="button"
            onClick={() =>
              void navigator.clipboard
                .writeText(link)
                .then(() => setNotice('Link copied.'))
                .catch(() => setNotice('Select the link and copy it manually.'))
            }
          >
            Copy link
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <ul className="admin-list">
        {invitations.map((invite) => (
          <li key={invite.id}>
            <span>
              {invite.status} · Expires {new Date(invite.expiresAt).toLocaleDateString()}
            </span>
            {['issued', 'pending'].includes(invite.status) && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void update(async () => {
                    await request(`/admin/invitations/${invite.id}`, { method: 'DELETE' });
                    setLink('');
                    setNotice('Invitation revoked.');
                  })
                }
              >
                Revoke
              </button>
            )}
          </li>
        ))}
      </ul>
      <h3>Members</h3>
      {recoveryMember && (
        <div className="account-form">
          <p>
            Verify {recoveryMember.displayName ?? recoveryMember.username}'s identity through a
            trusted channel before sharing a reset link.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void update(async () => {
                const result = await request<{ url: string }>(
                  `/admin/members/${recoveryMember.id}/recovery`,
                  {
                    method: 'POST',
                    body: JSON.stringify({ recipientVerified: true }),
                  },
                );
                setLink(result.url);
                setLinkLabel('One-use recovery link');
                setRecoveryMember(undefined);
                setNotice('Recovery link created. It expires in 30 minutes.');
              })
            }
          >
            Create link for verified recipient
          </button>
          <button type="button" onClick={() => setRecoveryMember(undefined)}>
            Cancel
          </button>
        </div>
      )}

      <ul className="admin-list">
        {members.map((member) => (
          <li key={member.id}>
            <span>
              {member.displayName ?? member.username} · {member.role} · {member.status}
            </span>
            {member.role === 'member' && member.status === 'active' && (
              <button type="button" disabled={busy} onClick={() => setRecoveryMember(member)}>
                Recover
              </button>
            )}
            {member.role !== 'admin' && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void update(async () => {
                    const status = member.status === 'active' ? 'suspended' : 'active';
                    await request(`/admin/members/${member.id}`, {
                      method: 'PATCH',
                      body: JSON.stringify({ status }),
                    });
                    setNotice(
                      status === 'active' ? 'Membership reinstated.' : 'Membership suspended.',
                    );
                  })
                }
              >
                {member.status === 'active' ? 'Suspend' : 'Reinstate'}
              </button>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
