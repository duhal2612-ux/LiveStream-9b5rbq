# 🔴 LiveStream — WebRTC Streaming Server

Server live streaming peer-to-peer berbasis WebRTC + Socket.io dengan NAT traversal agresif, anti-black screen, chat dua arah, dan stream discovery.

---

## 📁 Struktur Folder

```
server/
├── server.js              ← Signaling server (Socket.io)
└── public/
    ├── host.html          ← Halaman Host/Streamer
    └── watch.html         ← Halaman Penonton
```

---

## 🚀 Cara Menjalankan

### 1. Install Dependencies

```bash
npm install
```

> Jika `npm install` gagal, install manual:
> ```bash
> npm install express socket.io uuid
> ```

### 2. Jalankan Server

```bash
npm start
```

Server berjalan di **port 8226**.

### 3. Akses di Browser

| Halaman | URL |
|---------|-----|
| Host (Streamer) | `http://localhost:8226/host.html` |
| Penonton | `http://localhost:8226/watch.html` |

---

## 🌐 Streaming Antar Jaringan (Ngrok)

Agar bisa diakses dari jaringan berbeda (HP, internet):

### Install & Jalankan Ngrok

```bash
# Install ngrok (https://ngrok.com)
ngrok http 8226
```

Ngrok akan memberikan URL HTTPS seperti:
```
https://xxxx-xx-xx-xx.ngrok-free.app
```

**Bagikan URL ini ke penonton.** Socket.io otomatis mendeteksi URL Ngrok (`const socket = io()` tanpa hardcode URL).

---

## 📡 Fitur Teknis

### NAT Traversal (Super Aggressive STUN)
```javascript
iceServers: [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
  { urls: 'stun:stun.services.mozilla.com' }
]
```

### Anti-Black Screen (HP)
- `autoplay playsinline muted` pada `<video>`
- Overlay **"KLIK UNTUK AKTIFKAN LIVE"** fullscreen transparan
- `video.play()` dipanggil paksa saat stream diterima
- Unmute otomatis setelah interaksi pengguna

### Chat Dua Arah
- **Kuning** = Host
- **Putih** = Penonton
- Relay melalui Socket.io room

### Stream Discovery
- Endpoint `get:streams` → response `streams:list`
- Auto-refresh setiap 10 detik
- Tampil judul, nama host, durasi, jumlah penonton

---

## ⚙️ Socket Events

| Event | Arah | Deskripsi |
|-------|------|-----------|
| `host:register` | Client→Server | Daftarkan stream baru |
| `host:registered` | Server→Client | Konfirmasi + Stream ID |
| `host:end` | Client→Server | Akhiri stream |
| `get:streams` | Client→Server | Minta daftar stream |
| `streams:list` | Server→Client | Daftar stream aktif |
| `viewer:join` | Client→Server | Penonton bergabung |
| `viewer:joined` | Server→Host | Notif penonton baru |
| `viewer:count` | Server→Room | Update jumlah penonton |
| `rtc:offer` | Host→Viewer | WebRTC offer |
| `rtc:answer` | Viewer→Host | WebRTC answer |
| `rtc:ice` | Both | ICE candidates |
| `chat:send` | Client→Server | Kirim pesan |
| `chat:message` | Server→Room | Broadcast pesan |
| `stream:ended` | Server→Viewers | Notif stream berakhir |

---

## 🔧 Troubleshooting

### Video gelap / loading terus di HP
1. Pastikan menggunakan Ngrok HTTPS (bukan HTTP)
2. Klik tombol **"KLIK UNTUK AKTIFKAN LIVE"** di layar penonton
3. Cek console browser untuk error ICE

### Koneksi gagal di jaringan berbeda
1. Pastikan server berjalan dan Ngrok aktif
2. STUN server gratis terkadang diblokir oleh provider — pertimbangkan TURN server berbayar untuk produksi

### Untuk produksi (reliabilitas tinggi)
Tambahkan TURN server ke `iceServers`:
```javascript
{
  urls: 'turn:your-turn-server.com:3478',
  username: 'username',
  credential: 'password'
}
```
