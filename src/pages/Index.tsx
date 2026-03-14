// Update this page (the content is just a fallback if you fail to update the page)

const Index = () => {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{background:'#0a0a0f',color:'#f0f0f8'}}>
      <div className="text-center max-w-lg px-6">
        <div className="text-6xl mb-6">🔴</div>
        <h1 className="text-3xl font-bold mb-4">LiveStream Server</h1>
        <p className="text-lg mb-8" style={{color:'#6b6b8a'}}>
          Server live streaming WebRTC sudah siap. Akses halaman di bawah ini:
        </p>
        <div className="flex flex-col gap-4">
          <a
            href="/host.html"
            className="block py-4 px-8 rounded-xl font-bold text-white text-lg transition-all"
            style={{background:'#ff3b3b'}}
          >
            📡 Buka Halaman HOST (Streamer)
          </a>
          <a
            href="/watch.html"
            className="block py-4 px-8 rounded-xl font-bold text-lg transition-all border"
            style={{background:'#1a1a26',color:'#f0f0f8',borderColor:'#2a2a3e'}}
          >
            👁 Buka Halaman PENONTON
          </a>
        </div>
        <p className="mt-8 text-sm" style={{color:'#6b6b8a'}}>
          Server berjalan di port <strong style={{color:'#ffd600'}}>8226</strong>
        </p>
      </div>
    </div>
  );
};

export default Index;
