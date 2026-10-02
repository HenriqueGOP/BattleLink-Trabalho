import assert from "node:assert/strict";
import { SocketService } from "../../client/src/services/socketService";

class FakeSocket {
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  sent: string[] = [];
  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }
  send(value: string): void {
    this.sent.push(value);
  }
  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }
}

async function run(): Promise<void> {
  const sockets: FakeSocket[] = [];
  const service = new SocketService(() => {
    const socket = new FakeSocket();
    sockets.push(socket);
    return socket as unknown as WebSocket;
  });
  let closes = 0;
  service.onClose(() => closes++);
  const connection = service.connect("ws://local");
  sockets[0].open();
  await connection;
  assert.equal(service.isOpen, true);
  let received = 0,
    errors = 0;
  service.onMessage(() => received++);
  service.onError(() => errors++);
  sockets[0].onmessage!({
    data: JSON.stringify({ type: "state", state: { roomId: "bad" } }),
  });
  sockets[0].onmessage!({ data: "not-json" });
  assert.equal(errors, 2);
  assert.equal(received, 0);
  sockets[0].onmessage!({
    data: JSON.stringify({ type: "waiting", message: "Aguardando" }),
  });
  assert.equal(received, 1);
  const oldMessage = sockets[0].onmessage!;
  assert.equal(service.send({ type: "accept_team" }), true);
  const oldClose = sockets[0].onclose!;
  service.close();
  assert.equal(closes, 1);
  assert.equal(service.isOpen, false);
  assert.equal(service.send({ type: "accept_team" }), false);
  service.close();
  assert.equal(closes, 1);
  const next = service.connect("ws://local");
  sockets[1].open();
  await next;
  oldClose();
  oldMessage({
    data: JSON.stringify({ type: "waiting", message: "Obsoleto" }),
  });
  assert.equal(
    received,
    1,
    "Mensagem de socket obsoleto não altera a sala nova",
  );
  assert.equal(
    service.isOpen,
    true,
    "close obsoleto não derruba a conexão nova",
  );
  assert.equal(closes, 1);
  sockets[1].close();
  assert.equal(closes, 2);
  const pending = service.connect("ws://local");
  const cancelled = assert.rejects(pending, /cancelada/);
  service.close();
  await cancelled;
  assert.equal(closes, 3);
  const timeout = service.connect("ws://local", 5);
  await assert.rejects(timeout, /esgotado/);
  assert.equal(closes, 4);
  assert.equal(service.isOpen, false);
  console.log("Client socket lifecycle tests passed.");
}
void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
