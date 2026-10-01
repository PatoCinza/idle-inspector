import { createCapture } from '../../src/capture/hook.js';
import { TAG } from '../../src/capture/protocol.js';

const capture = createCapture({
  emit: (event) => window.postMessage({ source: TAG, event }, window.location.origin),
});

const bytesOf = (data) => {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return null;
};

const listen = (message) => {
  if (message.data instanceof ArrayBuffer) capture.incoming(new Uint8Array(message.data));
};

const attached = new WeakSet();
const originalSend = WebSocket.prototype.send;

WebSocket.prototype.send = function send(data) {
  const bytes = bytesOf(data);
  if (bytes) capture.outgoing(bytes);
  if (!attached.has(this)) {
    attached.add(this);
    this.addEventListener('message', listen);
  }
  return originalSend.call(this, data);
};
