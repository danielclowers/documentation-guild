import type {
  DurableObjectState,
  Request,
  Response as WorkerResponse,
  WebSocket as WorkerSocket,
} from '@cloudflare/workers-types';
import type { HallMember, HallMessage } from '@guild/shared';
import { hashInvite } from '../accounts/invitations';
import { hallCharacters, type HallBindings, type HallCharacter } from './hall-data';

declare const WebSocketPair: typeof import('@cloudflare/workers-types').WebSocketPair;

const HEARTBEAT_TIMEOUT = 60_000;
const SESSION_LIMIT = 5 * 60_000;
const REFRESH_INTERVAL = 30_000;
const IDLE_AFTER = 90_000;
const MAX_MEMBERS = 60;

interface Connection {
  character: HallCharacter;
  origin: string;
  slot: number;
  arrivalAt: number;
  lastSeen: number;
  lastActive: number;
  authUntil: number;
}

function attachment(socket: WorkerSocket): Connection | null {
  return socket.deserializeAttachment() as Connection | null;
}

export class GuildRoom {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: HallBindings,
  ) {}

  private connections(now: number): [WorkerSocket, Connection][] {
    const connections: [WorkerSocket, Connection][] = [];
    for (const socket of this.state.getWebSockets()) {
      const data = attachment(socket);
      if (!data || socket.readyState !== WebSocket.OPEN) continue;
      if (data.lastSeen + HEARTBEAT_TIMEOUT <= now || data.authUntil <= now) {
        socket.close(4000, 'Reconnect');
        continue;
      }
      connections.push([socket, data]);
    }
    return connections;
  }

  private roster(connections: [WorkerSocket, Connection][], now: number): HallMember[] {
    const members = new Map<string, HallMember>();
    for (const [, data] of connections) {
      const current = members.get(data.character.id);
      const active = data.lastActive + IDLE_AFTER > now || current?.presence === 'active';
      if (!current || data.character.stationAt >= current.stationAt) {
        members.set(data.character.id, {
          ...data.character,
          slot: data.slot,
          arrivalAt: data.arrivalAt,
          presence: active ? 'active' : 'idle',
        });
      } else if (active) current.presence = 'active';
    }
    return [...members.values()].sort((a, b) => a.slot - b.slot);
  }

  private send(connections: [WorkerSocket, Connection][], message: HallMessage) {
    const encoded = JSON.stringify(message);
    for (const [socket] of connections) {
      try {
        socket.send(encoded);
      } catch {
        /* The close callback updates the roster. */
      }
    }
  }

  private broadcastRoster(now = Date.now()) {
    const connections = this.connections(now);
    this.send(connections, { type: 'roster', members: this.roster(connections, now) });
  }

  private async claimTicket(token: string, origin: string) {
    return this.env.DB.prepare(
      `DELETE FROM hall_tickets WHERE token_hash = ? AND origin = ?
      AND expires_at > ? RETURNING member_id AS id`,
    )
      .bind(await hashInvite(token), origin, Date.now())
      .first<{ id: string }>();
  }

  async fetch(request: Request): Promise<WorkerResponse> {
    const path = new URL(request.url).pathname;
    if (path === '/update' && request.method === 'POST') {
      const { memberId, revoked } = await request.json<{ memberId: string; revoked: boolean }>();
      await this.refresh([memberId], revoked);
      return new Response(null, { status: 204 }) as unknown as WorkerResponse;
    }
    if (path !== '/connect' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response(null, { status: 426 }) as unknown as WorkerResponse;
    }
    const ticket = request.headers
      .get('Sec-WebSocket-Protocol')
      ?.split(',')
      .map((value) => value.trim());
    const token = ticket?.find((value) => /^ticket\.[A-Za-z0-9_-]{43}$/.test(value))?.slice(7);
    const origin = request.headers.get('Origin');
    if (!ticket?.includes('guild-v1') || !token || !origin)
      return new Response(null, { status: 401 }) as unknown as WorkerResponse;
    const claimed = await this.claimTicket(token, origin);
    const [character] = claimed ? await hallCharacters(this.env.DB, [claimed.id]) : [];
    if (!character) return new Response(null, { status: 401 }) as unknown as WorkerResponse;

    const now = Date.now();
    const connections = this.connections(now);
    const existing = connections.filter(([, data]) => data.character.id === character.id);
    if (existing.length >= 6)
      return new Response(null, { status: 429 }) as unknown as WorkerResponse;
    const usedSlots = new Set(connections.map(([, data]) => data.slot));
    const other = existing[0]?.[1];
    let slot = other?.slot ?? 0;
    if (!other) while (usedSlots.has(slot)) slot++;
    if (slot >= MAX_MEMBERS)
      return new Response(null, { status: 503 }) as unknown as WorkerResponse;
    const pair = new WebSocketPair();
    const { 0: client, 1: server } = pair;
    this.state.acceptWebSocket(server);
    server.serializeAttachment({
      character,
      origin,
      slot,
      arrivalAt: other?.arrivalAt ?? now,
      lastSeen: now,
      lastActive: now,
      authUntil: now + SESSION_LIMIT,
    } satisfies Connection);
    this.broadcastRoster(now);
    if (connections.length === 0) await this.state.storage.setAlarm(now + REFRESH_INTERVAL);
    return new Response(null, {
      status: 101,
      headers: { 'Sec-WebSocket-Protocol': 'guild-v1' },
      webSocket: client,
    } as ResponseInit) as unknown as WorkerResponse;
  }

  async webSocketMessage(socket: WorkerSocket, message: string | ArrayBuffer) {
    const data = attachment(socket);
    const now = Date.now();
    if (!data || data.authUntil <= now || data.lastSeen + HEARTBEAT_TIMEOUT <= now) {
      socket.close(4000, 'Reconnect');
      return;
    }
    if (typeof message !== 'string') return;
    if (/^refresh\.[A-Za-z0-9_-]{43}$/.test(message)) {
      const claimed = await this.claimTicket(message.slice(8), data.origin);
      const latest = attachment(socket);
      if (!latest || socket.readyState !== WebSocket.OPEN) return;
      if (claimed?.id !== latest.character.id) {
        socket.close(4000, 'Reconnect');
        return;
      }
      socket.serializeAttachment({ ...latest, authUntil: Date.now() + SESSION_LIMIT });
      return;
    }
    if (message === 'wave') {
      const recent = this.state.storage.sql;
      recent.exec(
        'CREATE TABLE IF NOT EXISTS waves (member_id TEXT PRIMARY KEY, sent_at INTEGER NOT NULL)',
      );
      const allowed = recent
        .exec(
          `INSERT INTO waves VALUES (?, ?) ON CONFLICT(member_id) DO UPDATE SET
        sent_at = excluded.sent_at WHERE waves.sent_at <= excluded.sent_at - 10000 RETURNING sent_at`,
          data.character.id,
          now,
        )
        .toArray();
      if (allowed.length)
        this.send(this.connections(now), { type: 'wave', memberId: data.character.id });
      return;
    }
    if (message !== 'active' && message !== 'idle') return;
    if (data.lastSeen + 1_000 > now) return;
    data.lastSeen = now;
    if (message === 'active') data.lastActive = now;
    socket.serializeAttachment(data);
    socket.send('{"type":"pong"}');
  }

  webSocketClose(socket: WorkerSocket) {
    const now = Date.now();
    const connections = this.connections(now).filter(([other]) => other !== socket);
    this.send(connections, { type: 'roster', members: this.roster(connections, now) });
  }

  webSocketError(socket: WorkerSocket) {
    socket.serializeAttachment(null);
    socket.close(1011, 'Connection interrupted');
    this.broadcastRoster();
  }

  private async refresh(ids: string[], revoked = false) {
    if (!ids.length) return;
    const characters = new Map(
      (revoked ? [] : await hallCharacters(this.env.DB, ids)).map((character) => [
        character.id,
        character,
      ]),
    );
    for (const [socket, data] of this.connections(Date.now())) {
      if (!ids.includes(data.character.id)) continue;
      const character = characters.get(data.character.id);
      if (character) socket.serializeAttachment({ ...data, character });
      else {
        socket.serializeAttachment(null);
        socket.close(4003, 'Guild membership unavailable');
      }
    }
    this.broadcastRoster();
  }

  async alarm() {
    const now = Date.now();
    const ids = [...new Set(this.connections(now).map(([, data]) => data.character.id))];
    if (!ids.length) return;
    await this.state.storage.setAlarm(now + REFRESH_INTERVAL);
    await this.refresh(ids);
  }
}
