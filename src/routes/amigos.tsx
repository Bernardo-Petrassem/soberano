import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { renderSVG } from "uqr";
import type { Color } from "chessops/types";
import { Shell, Panel } from "@/components/chess/shell";
import { Choice } from "@/components/chess/choice";
import { LiveGame } from "@/components/chess/live-game";
import { P2PRoom, type PeerInfo } from "@/lib/multiplayer";
import { publicUrl } from "@/lib/chess/public-url";
import { TIME_CONTROLS, fenFrom960, opposite, type Ending, type TimeId } from "@/lib/chess/logic";
import { useHydrated, useVault } from "@/lib/chess/store";

export const Route = createFileRoute("/amigos")({
  validateSearch: (search: Record<string, unknown>) => ({
    com: typeof search.com === "string" ? search.com.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32) : "",
  }),
  component: Amigos,
});

type Invite = {
  t: "INVITE";
  tc: string;
  initial: number;
  inc: number;
  fen: string;
  variant960: boolean;
  color: Color;
  name: string;
};

type Wire =
  | { t: "HELLO"; id: string; name: string }
  | Invite
  | { t: "ACCEPT"; name: string }
  | { t: "DECLINE" }
  | { t: "MOVE"; uci: string; ply: number }
  | { t: "DRAW" }
  | { t: "DRAW_OK" }
  | { t: "DRAW_NO" }
  | { t: "RESIGN"; winner: Color }
  | { t: "LEAVE"; winner: Color };

function isWire(data: unknown): data is Wire {
  return Boolean(data && typeof data === "object" && "t" in data);
}

function Amigos() {
  const search = Route.useSearch();
  const hydrated = useHydrated();
  const name = useVault((s) => s.name);
  const setName = useVault((s) => s.setName);
  const peerId = useVault((s) => s.peerId);
  const ensureId = useVault((s) => s.ensureId);
  const service = useVault((s) => s.service);
  const setService = useVault((s) => s.setService);
  const friends = useVault((s) => s.friends);
  const addFriend = useVault((s) => s.addFriend);
  const removeFriend = useVault((s) => s.removeFriend);
  const markFriend = useVault((s) => s.markFriend);

  const [dial, setDial] = useState(search.com);
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [log, setLog] = useState("O Tor não corre dentro do navegador. O encontro é directo entre os dois aparelhos, com um endereço seu que não muda.");
  const [incoming, setIncoming] = useState<Invite | null>(null);
  const [drawAsk, setDrawAsk] = useState(false);
  const [tc, setTc] = useState<TimeId>("blitz3");
  const [color, setColor] = useState<Color>("white");
  const [as960, setAs960] = useState(false);
  const [match, setMatch] = useState<{
    id: string;
    human: Color;
    fen: string;
    variant960: boolean;
    initial: number;
    inc: number;
    tc: string;
    opp: string;
  } | null>(null);
  const [inbound, setInbound] = useState<{ nonce: number; uci: string; ply: number } | null>(null);
  const [externalEnd, setExternalEnd] = useState<{ nonce: number; ending: Ending } | null>(null);
  const [checking, setChecking] = useState(false);
  const sendRef = useRef<(msg: Wire, to?: string) => void>(() => undefined);
  const replied = useRef(new Set<string>());
  const nonce = useRef(1);
  const pendingInvite = useRef<Invite | null>(null);
  const friendsRef = useRef(friends);
  friendsRef.current = friends;
  const myId = peerId;

  useEffect(() => {
    if (hydrated) ensureId();
  }, [hydrated, ensureId]);

  useEffect(() => {
    if (!activeRoom || !myId) return;
    replied.current.clear();
    const room = new P2PRoom({
      room: activeRoom,
      selfId: myId,
      name: name || "Jogador",
      onPeersChanged: setPeers,
      onMessage: (from, data) => {
        if (!isWire(data)) return;
        if (data.t === "HELLO") {
          if (friendsRef.current.some((f) => f.address === data.id)) markFriend(data.id, true);
          if (!replied.current.has(from)) {
            replied.current.add(from);
            sendRef.current({ t: "HELLO", id: myId, name: name || "Jogador" }, from);
          }
          setLog(`${data.name || data.id} respondeu HELLO.`);
          return;
        }
        if (data.t === "ACCEPT" && pendingInvite.current) {
          const invite = pendingInvite.current;
          pendingInvite.current = null;
          setIncoming(null);
          setDrawAsk(false);
          setExternalEnd(null);
          setInbound(null);
          setMatch({
            id: crypto.randomUUID(),
            human: invite.color,
            fen: invite.fen,
            variant960: invite.variant960,
            initial: invite.initial,
            inc: invite.inc,
            tc: invite.tc,
            opp: data.name,
          });
          setLog("Partida aceite.");
          return;
        }
        if (data.t === "DECLINE") {
          pendingInvite.current = null;
          setLog("Convite recusado.");
          return;
        }
        if (data.t === "INVITE") {
          setIncoming(data);
          setLog(`${data.name} propôs uma partida.`);
          return;
        }
        if (data.t === "MOVE") {
          setInbound({ nonce: ++nonce.current, uci: data.uci, ply: data.ply });
          return;
        }
        if (data.t === "DRAW") {
          setDrawAsk(true);
          return;
        }
        if (data.t === "DRAW_OK") {
          setExternalEnd({
            nonce: ++nonce.current,
            ending: { reason: "Empate por acordo", result: "1/2-1/2" },
          });
          setDrawAsk(false);
          return;
        }
        if (data.t === "DRAW_NO") {
          setDrawAsk(false);
          setLog("Empate recusado.");
          return;
        }
        if (data.t === "RESIGN" || data.t === "LEAVE") {
          setExternalEnd({
            nonce: ++nonce.current,
            ending: {
              winner: data.winner,
              reason: data.t === "LEAVE" ? "O adversário saiu" : "Desistência",
              result: data.winner === "white" ? "1-0" : "0-1",
            },
          });
        }
      },
    });
    sendRef.current = (msg, to) => room.send(msg, to);
    void room.join().then(() => {
      room.broadcast({ t: "HELLO", id: myId, name: name || "Jogador" });
    });
    return () => {
      sendRef.current = () => undefined;
      room.close();
      setPeers([]);
    };
  }, [activeRoom, myId, name, markFriend]);

  const url = hydrated && myId && typeof window !== "undefined" ? `${window.location.origin}${publicUrl(`/amigos?com=${myId}`)}` : "";
  const qr = url ? renderSVG(url, { ecc: "M", pixelSize: 4, blackColor: "#1c1915", whiteColor: "#f3ead7" }) : "";

  function connect(address: string) {
    const id = address.trim();
    if (!/^[a-zA-Z0-9_-]{4,32}$/.test(id) || id === myId) {
      setLog("Endereço inválido.");
      return;
    }
    setMatch(null);
    setActiveRoom(`l${id}`.slice(0, 64));
    setLog(`A entrar no serviço de ${id}…`);
  }

  function host() {
    if (!myId) return;
    setMatch(null);
    setActiveRoom(`l${myId}`);
    setService(true);
    setLog("Serviço activo. Quem tiver o seu endereço pode entrar.");
  }

  async function checkFriends() {
    setChecking(true);
    for (const friend of friends) {
      const online = await ping(friend.address, myId, name || "Jogador");
      markFriend(friend.address, online);
    }
    setChecking(false);
    setLog("Verificação HELLO concluída.");
  }

  function propose() {
    const control = TIME_CONTROLS.find((t) => t.id === tc)!;
    const invite: Invite = {
      t: "INVITE",
      tc: control.label,
      initial: control.initial,
      inc: control.inc,
      fen: as960 ? fenFrom960(Math.floor(Math.random() * 960)) : "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      variant960: as960,
      color,
      name: name || "Jogador",
    };
    sendRef.current(invite);
    setLog("Convite enviado.");
    setMatch(null);
    pendingInvite.current = invite;
  }

  function begin(invite: Invite, mine: boolean, opp: string) {
    const human = mine ? invite.color : opposite(invite.color);
    setIncoming(null);
    setDrawAsk(false);
    setExternalEnd(null);
    setInbound(null);
    setMatch({
      id: crypto.randomUUID(),
      human,
      fen: invite.fen,
      variant960: invite.variant960,
      initial: invite.initial,
      inc: invite.inc,
      tc: invite.tc,
      opp,
    });
  }

  return (
    <Shell>
      <h1 className="font-display text-3xl">Amigos</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">{log}</p>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel>
          <label className="text-sm text-muted">
            O seu nome
            <input className="field mt-1" value={hydrated ? name : ""} onChange={(e) => setName(e.target.value)} />
          </label>
          <p className="mt-3 text-sm text-muted">Endereço fixo</p>
          <p className="font-display text-lg break-all text-brass">{hydrated ? myId : "…"}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn"
              onClick={() => {
                if (url) void navigator.clipboard.writeText(url);
              }}
            >
              Copiar convite
            </button>
            <button type="button" className={service ? "btn btn-primary" : "btn"} onClick={host}>
              {service ? "Serviço activo" : "Activar serviço"}
            </button>
          </div>
          {qr && <div className="mt-4 max-w-48" dangerouslySetInnerHTML={{ __html: qr }} />}
        </Panel>
        <Panel>
          <label className="text-sm text-muted">
            Endereço ou link
            <input className="field mt-1" value={dial} onChange={(e) => setDial(e.target.value)} placeholder="cole o endereço do amigo" />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={() => connect(dial.replace(/^.*com=/, "").replace(/[^a-zA-Z0-9_-]/g, ""))}>
              Conectar
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                const address = dial.replace(/^.*com=/, "").replace(/[^a-zA-Z0-9_-]/g, "");
                if (!/^[a-zA-Z0-9_-]{4,32}$/.test(address)) return;
                addFriend({ address, name: address.slice(0, 8), online: false });
              }}
            >
              Guardar amigo
            </button>
          </div>
          <button type="button" className="btn mt-4" disabled={checking || friends.length === 0} onClick={() => void checkFriends()}>
            {checking ? "A verificar…" : "Verificar se amigos estão online"}
          </button>
          <ul className="mt-3 space-y-2 text-sm">
            {friends.map((f) => (
              <li key={f.address} className="flex items-center justify-between gap-2">
                <button type="button" className="text-left" onClick={() => connect(f.address)}>
                  <span className={f.online ? "text-good" : "text-muted"}>{f.online ? "online" : "sem resposta"}</span> {f.name}
                  <span className="block text-xs text-muted">{f.address}</span>
                </button>
                <button type="button" className="btn min-h-10" onClick={() => removeFriend(f.address)}>
                  Tirar
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {activeRoom && !match && (
        <Panel className="mt-4">
          <p className="text-sm">
            Na sala:{" "}
            {peers.filter((p) => p.id !== myId).map((p) => `${p.name || p.id} (${p.connectionState})`).join(", ") || "à espera de alguém"}
          </p>
          <div className="mt-3 space-y-3">
            <Choice
              label="A sua cor"
              value={color}
              onChange={setColor}
              options={[
                { value: "white", label: "Eu de brancas" },
                { value: "black", label: "Eu de pretas" },
              ]}
            />
            <Choice
              label="Tempo"
              value={tc}
              onChange={setTc}
              options={TIME_CONTROLS.map((t) => ({ value: t.id, label: t.label }))}
            />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={as960} onChange={(e) => setAs960(e.target.checked)} />
              960
            </label>
            <button type="button" className="btn btn-primary" onClick={propose}>
              Propor partida
            </button>
          </div>
          {incoming && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <p className="text-sm">{incoming.name} quer jogar {incoming.tc}.</p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  sendRef.current({ t: "ACCEPT", name: name || "Jogador" });
                  begin(incoming, false, incoming.name);
                }}
              >
                Aceitar
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  sendRef.current({ t: "DECLINE" });
                  setIncoming(null);
                }}
              >
                Recusar
              </button>
            </div>
          )}
        </Panel>
      )}

      {match && (
        <div className="mt-4">
          {drawAsk && (
            <div className="mb-3 flex flex-wrap gap-2">
              <p className="text-sm">Empate proposto.</p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  sendRef.current({ t: "DRAW_OK" });
                  setExternalEnd({ nonce: ++nonce.current, ending: { reason: "Empate por acordo", result: "1/2-1/2" } });
                  setDrawAsk(false);
                }}
              >
                Aceitar
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  sendRef.current({ t: "DRAW_NO" });
                  setDrawAsk(false);
                }}
              >
                Recusar
              </button>
            </div>
          )}
          <button
            type="button"
            className="btn mb-3"
            onClick={() => {
              const winner = opposite(match.human);
              sendRef.current({ t: "LEAVE", winner });
              setMatch(null);
            }}
          >
            Sair da partida
          </button>
          <LiveGame
            key={match.id}
            config={{
              startFen: match.fen,
              variant960: match.variant960,
              human: match.human,
              bot: null,
              clock: match.initial ? { initial: match.initial, inc: match.inc } : null,
              tcLabel: match.tc,
              whiteName: match.human === "white" ? name || "Você" : match.opp,
              blackName: match.human === "black" ? name || "Você" : match.opp,
              inbound,
              externalEnd,
              onUserMove: (uci, ply) => sendRef.current({ t: "MOVE", uci, ply }),
              onDrawOffer: () => sendRef.current({ t: "DRAW" }),
              onResignRemote: () => sendRef.current({ t: "RESIGN", winner: opposite(match.human) }),
            }}
          />
        </div>
      )}
    </Shell>
  );
}

function ping(address: string, myId: string, name: string): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const probe = `z${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const room = new P2PRoom({
      room: `l${address}`.slice(0, 64),
      selfId: probe,
      name,
      onMessage: (_from, data) => {
        if (isWire(data) && data.t === "HELLO") done(true);
      },
      onPeersChanged: (list) => {
        if (list.some((p) => p.id === address && p.connectionState === "connected")) {
          room.send({ t: "HELLO", id: myId, name }, address);
        }
      },
    });
    const done = (value: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      room.close();
      resolve(value);
    };
    const timer = window.setTimeout(() => done(false), 7000);
    void room.join().catch(() => done(false));
  });
}
