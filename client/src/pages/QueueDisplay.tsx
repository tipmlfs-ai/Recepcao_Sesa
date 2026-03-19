import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { API_URL } from '../config/apiConfig';
import { supabase } from '../config/supabaseConfig';
import { RealtimeChannel } from '@supabase/supabase-js';

// ── Types ────────────────────────────────────────────────────────────────────
interface Ticket {
  id: string;
  code: string;
  sectorName: string;
  status: 'IN_SERVICE' | 'WAITING';
  timestamp: string;
}

interface DisplayData {
  tickets: Ticket[];
  avgWaitMinutes: number | null;
}

// ── Constants ───────────────────────────────────────────────────────────────
const COLORS = {
  background: '#0F172A',
  white: '#FFFFFF',
  inService: '#22C55E',
  next: '#F59E0B',
  waiting: '#94A3B8',
  border: 'rgba(255,255,255,0.08)',
  cardBg: 'rgba(255,255,255,0.03)',
};

// ── Helper to determine ticket visual status ────────────────────────────────
const getTicketStatusInfo = (ticket: Ticket, indexInList: number) => {
  if (ticket.status === 'IN_SERVICE') {
    return { label: 'Em atendimento', color: COLORS.inService, bg: 'rgba(34,197,94,0.1)' };
  }
  if (indexInList < 2) {
    return { label: 'Próximo', color: COLORS.next, bg: 'rgba(245,158,11,0.1)' };
  }
  return { label: 'Aguardando', color: COLORS.waiting, bg: 'rgba(148,163,184,0.05)' };
};

// ── Component ─────────────────────────────────────────────────────────────────
const QueueDisplay: React.FC = () => {
  const [data, setData] = useState<DisplayData>({ tickets: [], avgWaitMinutes: null });
  const [clock, setClock] = useState('');
  const [heroKey, setHeroKey] = useState(0);
  const [heroGlow, setHeroGlow] = useState(false);
  const prevHeroCode = useRef<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Clock ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClock(now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // ── Fetch queue data ───────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/queue/display`);
      if (!res.ok) return;
      const json: DisplayData = await res.json();

      // Filter tickets to only include relevant ones: IN_SERVICE or WAITING
      const filteredTickets = json.tickets.filter(t => t.status === 'IN_SERVICE' || t.status === 'WAITING');

      // Detect hero change (first IN_SERVICE ticket)
      const newHero = filteredTickets.find(t => t.status === 'IN_SERVICE');
      if (newHero && newHero.code !== prevHeroCode.current) {
        prevHeroCode.current = newHero.code;
        setHeroKey(k => k + 1);
        setHeroGlow(true);
        setTimeout(() => setHeroGlow(false), 3000);

        // Play Loud notification sound
        try {
          const audio = new Audio('/chime.ogg');
          audio.volume = 1.0;
          audio.play().catch(e => console.error("Audio playback blocked by browser:", e));
        } catch(e) {}
      } else if (!newHero) {
        prevHeroCode.current = null;
      }

      setData({ ...json, tickets: filteredTickets });
    } catch (_) { }
  }, []);

  // ── Supabase Realtime ─────────────────────────────────────────────────────
  useEffect(() => {
    fetchData();
    pollRef.current = setInterval(fetchData, 30000); // Polling as fallback (less frequent)

    // Subscribe to changes in the 'visits' table (mapped as 'Visit' in Prisma, but usually lowercase in DB)
    const channel = supabase
      .channel('queue-display')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'Visit' },
        () => {
          fetchData();
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [fetchData]);

  // ── Derived state ──────────────────────────────────────────────────────────
  const inServiceTickets = data.tickets.filter(t => t.status === 'IN_SERVICE');

  // Hero is the MOST RECENT (last in array ordered by timestamp asc)
  const heroTicket = inServiceTickets.length > 0 ? inServiceTickets[inServiceTickets.length - 1] : null;

  // List is everything BEFORE the hero, limited to the last 12 previous calls, recent first
  const listTickets: Ticket[] = inServiceTickets.slice(Math.max(0, inServiceTickets.length - 13), -1).reverse();

  return (
    <div style={styles.page}>
      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <img src="/logo.png" alt="Logo" style={styles.logo} onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
          <div style={styles.logoDivider} />
          <span style={styles.headerTitle}>SESA-LAURO</span>
        </div>

        <div style={styles.headerRight}>
          <div style={styles.clock}>{clock}</div>
        </div>
      </header>

      {/* ── HERO TICKET ────────────────────────────────────────────────────── */}
      <main style={styles.main}>
        <section style={styles.heroSection}>
          {heroTicket ? (
            <div key={heroKey} style={{ ...styles.heroCard, ...(heroGlow ? styles.heroCardGlow : {}) }}>
              <p style={styles.heroSub}>SENHA CHAMADA</p>
              <h1 style={styles.heroCode}>{heroTicket.code}</h1>
              <div style={styles.heroStatus}>
                <div style={styles.heroDot} />
                <span>{heroTicket.sectorName}</span>
              </div>
            </div>
          ) : (
            <div style={styles.emptyState}>
              <div style={styles.emptyIcon}>⏳</div>
              <p style={styles.emptyText}>Aguardando próxima chamada</p>
            </div>
          )}
        </section>

        {/* ── CALL HISTORY GRID ──────────────────────────────────────────────── */}
        <section style={styles.listSection}>
          <header style={styles.listHeader}>
            <h2 style={styles.listTitle}>ÚLTIMAS CHAMADAS</h2>
          </header>

          <div style={styles.gridContainer}>
            {listTickets.length > 0 ? (
              listTickets.map((t, idx) => {
                const info = getTicketStatusInfo(t, idx);
                return (
                  <div
                    key={t.id}
                    style={{
                      ...styles.gridItem,
                      animationDelay: `${idx * 80}ms`,
                      background: 'rgba(255,255,255,0.03)',
                      borderColor: 'rgba(255,255,255,0.08)',
                    }}
                  >
                    <span style={{ ...styles.gridCode, color: info.color }}>{t.code}</span>
                  </div>
                );
              })
            ) : (
              <div style={styles.noQueue}>Nenhuma chamada anterior</div>
            )}
          </div>
        </section>
      </main>

      {/* ── FOOTER LEGEND ──────────────────────────────────────────────────── */}
      <footer style={styles.footer}>
        <div style={styles.legend}>
          <span style={styles.legendItem}><strong>A</strong> Geral</span>
          <span style={styles.legendSep}>|</span>
          <span style={styles.legendItem}><strong>P</strong> Prioritário</span>
          <span style={styles.legendSep}>|</span>
          <span style={styles.legendItem}><strong>B</strong> Outros</span>
        </div>

        <Link to="/login" style={styles.backBtn}>Acesso Restrito</Link>
      </footer>

      {/* ── STYLES ─────────────────────────────────────────────────────────── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

        body { margin: 0; background: ${COLORS.background}; overflow: hidden; }

        @keyframes heroPulse {
          0% { transform: scale(1.05); opacity: 0; }
          10% { transform: scale(1); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }

        @keyframes cardGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); }
          50% { box-shadow: 0 0 100px 20px rgba(34,197,94,0.15); }
        }

        @keyframes itemFadeIn {
          from { transform: scale(0.9); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        @keyframes activeDot {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.4); opacity: 0.6; }
        }
      `}</style>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  page: {
    width: '100vw',
    height: '100vh',
    background: COLORS.background,
    color: '#F8FAFC',
    fontFamily: "'Inter', sans-serif",
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    userSelect: 'none',
  },
  header: {
    height: '100px',
    padding: '0 60px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: `1px solid ${COLORS.border}`,
    background: 'rgba(255,255,255,0.01)',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '24px',
  },
  logo: {
    height: '48px',
  },
  logoDivider: {
    width: '1px',
    height: '32px',
    background: COLORS.border,
  },
  headerTitle: {
    fontSize: '20px',
    fontWeight: 700,
    letterSpacing: '2px',
    color: '#94A3B8',
  },
  headerRight: {
    textAlign: 'right',
  },
  clock: {
    fontSize: '32px',
    fontWeight: 700,
    letterSpacing: '1px',
    color: COLORS.white,
    fontVariantNumeric: 'tabular-nums',
  },
  main: {
    flex: 1,
    display: 'flex',
    padding: '40px 60px',
    gap: '60px',
    overflow: 'hidden',
  },
  heroSection: {
    flex: '1.4',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
  },
  heroCard: {
    background: 'rgba(255,255,255,0.02)',
    border: `1px solid ${COLORS.border}`,
    borderRadius: '40px',
    padding: '80px 40px',
    textAlign: 'center',
    animation: 'heroPulse 3s cubic-bezier(0.16, 1, 0.3, 1)',
    position: 'relative',
    overflow: 'hidden',
  },
  heroCardGlow: {
    animation: 'heroPulse 3s cubic-bezier(0.16, 1, 0.3, 1), cardGlow 3s ease-in-out',
    borderColor: 'rgba(34,197,94,0.3)',
  },
  heroSub: {
    fontSize: '16px',
    fontWeight: 600,
    letterSpacing: '6px',
    color: '#64748B',
    marginBottom: '24px',
    textTransform: 'uppercase',
  },
  heroCode: {
    fontSize: '180px',
    fontWeight: 900,
    lineHeight: '0.9',
    margin: 0,
    color: COLORS.white,
    letterSpacing: '-4px',
    textShadow: '0 10px 40px rgba(0,0,0,0.5)',
  },
  heroStatus: {
    marginTop: '48px',
    fontSize: '32px',
    fontWeight: 500,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
    color: '#CBD5E1',
  },
  heroDot: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    background: COLORS.inService,
    boxShadow: `0 0 15px ${COLORS.inService}`,
    animation: 'activeDot 1.5s infinite',
  },
  heroBullet: {
    color: '#334155',
  },
  emptyState: {
    textAlign: 'center',
    opacity: 0.3,
  },
  emptyIcon: { fontSize: '80px', marginBottom: '20px' },
  emptyText: { fontSize: '24px', fontWeight: 500 },

  listSection: {
    flex: '1',
    display: 'flex',
    flexDirection: 'column',
    background: 'rgba(255,255,255,0.01)',
    borderRadius: '30px',
    padding: '30px',
    border: `1px solid ${COLORS.border}`,
  },
  listHeader: {
    marginBottom: '30px',
    paddingLeft: '10px',
  },
  listTitle: {
    fontSize: '14px',
    fontWeight: 700,
    letterSpacing: '3px',
    color: '#475569',
    margin: 0,
  },
  gridContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: '16px',
    flex: 1,
    overflow: 'auto',
    paddingRight: '10px',
  },
  gridItem: {
    height: '140px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '24px',
    border: '1px solid',
    animation: 'itemFadeIn 0.5s ease-out both',
  },
  gridCode: {
    fontSize: '32px',
    fontWeight: 800,
    letterSpacing: '1px',
  },
  noQueue: {
    textAlign: 'center',
    padding: '40px',
    color: '#334155',
    fontStyle: 'italic',
  },
  footer: {
    height: '60px',
    padding: '0 60px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTop: `1px solid ${COLORS.border}`,
    background: 'rgba(0,0,0,0.2)',
  },
  legend: {
    display: 'flex',
    gap: '24px',
    fontSize: '13px',
    color: '#475569',
  },
  legendItem: {
    display: 'flex',
    gap: '8px',
  },
  legendSep: { opacity: 0.2 },
  backBtn: {
    fontSize: '11px',
    color: '#1E293B',
    textDecoration: 'none',
    transition: 'color 0.2s',
  },
};

export default QueueDisplay;
