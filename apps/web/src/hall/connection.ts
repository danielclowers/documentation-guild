import type { HallMember, HallMessage } from '@guild/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GuildApiError, type AccountApi } from '../accounts/api';

export function useHallConnection(apiUrl: string, request: AccountApi) {
  const [members, setMembers] = useState<HallMember[]>([]);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'reconnecting' | 'denied'>(
    'connecting',
  );
  const [wave, setWave] = useState<{ memberId: string; at: number }>();
  const socket = useRef<WebSocket | null>(null);
  const sendWave = useCallback(() => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send('wave');
  }, []);

  useEffect(() => {
    let retry: number | undefined;
    let heartbeat: number | undefined;
    let renew: number | undefined;
    let attempts = 0;
    let lastActive = Date.now();
    let lastReply = 0;
    const controller = new AbortController();
    const activity = () => {
      lastActive = Date.now();
    };
    window.addEventListener('pointerdown', activity);
    window.addEventListener('keydown', activity);

    function reconnect() {
      window.clearInterval(heartbeat);
      window.clearInterval(renew);
      if (controller.signal.aborted) return;
      setMembers([]);
      setStatus('reconnecting');
      const delay = Math.min(1000 * 2 ** attempts++, 15_000);
      retry = window.setTimeout(() => void connect(), delay);
    }

    async function connect() {
      try {
        const { ticket } = await request<{ ticket: string }>('/realtime/ticket', {
          method: 'POST',
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        const url = new URL(`${apiUrl}/api/v1/realtime/socket`);
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        const connection = new WebSocket(url, ['guild-v1', `ticket.${ticket}`]);
        socket.current = connection;
        connection.onopen = () => {
          lastReply = Date.now();
          renew = window.setInterval(() => {
            void request<{ ticket: string }>('/realtime/ticket', {
              method: 'POST',
              signal: controller.signal,
            })
              .then(({ ticket }) => {
                if (connection.readyState === WebSocket.OPEN) connection.send(`refresh.${ticket}`);
              })
              .catch(() => {
                if (connection.readyState === WebSocket.OPEN) connection.close();
              });
          }, 240_000);
          heartbeat = window.setInterval(() => {
            if (connection.readyState !== WebSocket.OPEN) return;
            if (Date.now() - lastReply > 50_000) {
              connection.close();
              return;
            }
            connection.send(
              !document.hidden && Date.now() - lastActive < 60_000 ? 'active' : 'idle',
            );
          }, 20_000);
        };
        connection.onmessage = ({ data }) => {
          if (controller.signal.aborted || typeof data !== 'string') return;
          let message: HallMessage;
          try {
            message = JSON.parse(data) as HallMessage;
          } catch {
            return;
          }
          lastReply = Date.now();
          if (message.type === 'roster') {
            attempts = 0;
            setMembers(message.members);
            setStatus('connected');
          } else if (message.type === 'wave') {
            setWave({ memberId: message.memberId, at: Date.now() });
          }
        };
        connection.onclose = ({ code }) => {
          if (controller.signal.aborted) return;
          if (code === 4003) {
            window.clearInterval(heartbeat);
            window.clearInterval(renew);
            setMembers([]);
            setStatus('denied');
          } else reconnect();
        };
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof GuildApiError && ['UNAUTHORIZED', 'NOT_MEMBER'].includes(error.code)) {
          setMembers([]);
          setStatus('denied');
        } else reconnect();
      }
    }
    const onVisible = () => {
      if (document.hidden) return;
      activity();
      if (socket.current?.readyState === WebSocket.OPEN) socket.current.send('active');
    };
    const onLeave = () => socket.current?.close(1000, 'Page closed');
    window.addEventListener('pagehide', onLeave);
    document.addEventListener('visibilitychange', onVisible);
    void connect();
    return () => {
      controller.abort();
      window.clearTimeout(retry);
      window.clearInterval(heartbeat);
      window.clearInterval(renew);
      window.removeEventListener('pointerdown', activity);
      window.removeEventListener('keydown', activity);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pagehide', onLeave);
      socket.current?.close();
      socket.current = null;
    };
  }, [apiUrl, request]);

  return { members, status, wave, sendWave };
}
