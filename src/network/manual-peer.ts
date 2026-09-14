import { isPeerMessage, PEER_PROTOCOL_VERSION, type PeerMessage } from './protocol.js';

const RTC_CONFIGURATION: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

export class ManualPeerSession {
  onStatus: (status: string) => void = () => undefined;
  onMessage: (message: PeerMessage) => void = () => undefined;
  onOpen: () => void = () => undefined;
  onClose: () => void = () => undefined;

  private connection: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;

  get connected(): boolean {
    return this.channel?.readyState === 'open';
  }

  async createHostOffer(): Promise<string> {
    this.close();
    this.connection = this.createConnection();
    this.attachChannel(this.connection.createDataChannel('fechtschule', {
      ordered: true
    }));
    this.onStatus('Creating peer invitation…');
    const offer = await this.connection.createOffer();
    await this.connection.setLocalDescription(offer);
    await this.waitForIce(this.connection);
    if (!this.connection.localDescription) throw new Error('The browser did not create an offer.');
    this.onStatus('Invitation ready. Send it to the guest.');
    return encodeDescription(this.connection.localDescription);
  }

  async acceptOfferAndCreateAnswer(token: string): Promise<string> {
    this.close();
    this.connection = this.createConnection();
    this.connection.ondatachannel = (event) => this.attachChannel(event.channel);
    this.onStatus('Reading host invitation…');
    await this.connection.setRemoteDescription(decodeDescription(token));
    const answer = await this.connection.createAnswer();
    await this.connection.setLocalDescription(answer);
    await this.waitForIce(this.connection);
    if (!this.connection.localDescription) throw new Error('The browser did not create an answer.');
    this.onStatus('Answer ready. Return it to the host.');
    return encodeDescription(this.connection.localDescription);
  }

  async acceptAnswer(token: string): Promise<void> {
    if (!this.connection) throw new Error('Create a host invitation first.');
    await this.connection.setRemoteDescription(decodeDescription(token));
    this.onStatus('Answer accepted. Establishing the direct connection…');
  }

  send(message: PeerMessage): boolean {
    if (!this.channel || this.channel.readyState !== 'open') return false;
    this.channel.send(JSON.stringify(message));
    return true;
  }

  close(): void {
    this.channel?.close();
    this.connection?.close();
    this.channel = null;
    this.connection = null;
  }

  private createConnection(): RTCPeerConnection {
    const connection = new RTCPeerConnection(RTC_CONFIGURATION);
    connection.onconnectionstatechange = () => {
      this.onStatus(`Peer state: ${connection.connectionState}`);
      if (['failed', 'closed', 'disconnected'].includes(connection.connectionState)) this.onClose();
    };
    connection.oniceconnectionstatechange = () => {
      if (connection.iceConnectionState === 'failed') {
        this.onStatus('Direct connection failed. Try the same Wi-Fi or hotspot and create a new invitation.');
      }
    };
    return connection;
  }

  private attachChannel(channel: RTCDataChannel): void {
    this.channel = channel;
    channel.binaryType = 'arraybuffer';
    channel.onopen = () => {
      this.onStatus('Peer connected.');
      this.send({ type: 'hello', protocol: PEER_PROTOCOL_VERSION });
      this.onOpen();
    };
    channel.onclose = () => {
      this.onStatus('Peer channel closed.');
      this.onClose();
    };
    channel.onerror = () => this.onStatus('Peer channel error.');
    channel.onmessage = (event) => {
      try {
        if (typeof event.data !== 'string' || event.data.length > 1_000_000) {
          throw new Error('Unsupported peer payload.');
        }
        const parsed: unknown = JSON.parse(event.data);
        if (!isPeerMessage(parsed)) throw new Error('Invalid peer message.');
        this.onMessage(parsed);
      } catch {
        this.onStatus('Ignored an invalid peer message.');
      }
    };
  }

  private waitForIce(connection: RTCPeerConnection): Promise<void> {
    if (connection.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise((resolve) => {
      const timeout = window.setTimeout(() => {
        connection.removeEventListener('icegatheringstatechange', check);
        resolve();
      }, 3500);
      const check = (): void => {
        if (connection.iceGatheringState !== 'complete') return;
        window.clearTimeout(timeout);
        connection.removeEventListener('icegatheringstatechange', check);
        resolve();
      };
      connection.addEventListener('icegatheringstatechange', check);
    });
  }
}

function encodeDescription(description: RTCSessionDescription): string {
  const json = JSON.stringify({ type: description.type, sdp: description.sdp });
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function decodeDescription(token: string): RTCSessionDescriptionInit {
  const normalized = token.trim().replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const parsed = JSON.parse(new TextDecoder().decode(bytes)) as RTCSessionDescriptionInit;
  if (!parsed.type || !parsed.sdp) throw new Error('The pairing token is incomplete.');
  return parsed;
}
