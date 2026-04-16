import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { API_URL } from '../config/apiConfig';
import { supabase } from '../config/supabaseConfig';
import { RealtimeChannel } from '@supabase/supabase-js';
import { audioManager } from '../utils/audioManager';
import { motion, AnimatePresence } from 'framer-motion';
import { useAudioUnlock } from '../hooks/useAudioUnlock';
// ── Types ────────────────────────────────────────────────────────────────────
interface Ticket {
  id: string;
  code: string;
  sectorName: string;
  sectorCooldown: number;
  citizenName: string;
  status: 'IN_SERVICE' | 'WAITING' | 'IN_WAITING_ROOM' | 'NO_SHOW';
  timestamp: string;
  calledAt?: string | null;
  isPriority?: boolean;
  resourceName?: string;
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
// Audio handled by global audioManager

// ── Helper to determine ticket visual status ────────────────────────────────
const getTicketStatusInfo = (ticket: Ticket, indexInList: number, _nowMs: number) => {
  // Orange ONLY when explicitly marked as NO_SHOW by attendant — never by timer
  if (ticket.status === 'NO_SHOW') {
    return { label: 'Não compareceu', color: '#F97316', bg: 'rgba(249, 115, 22, 0.15)', isExpired: true };
  }

  // Green for any actively called ticket (in service or in waiting room)
  if (ticket.status === 'IN_SERVICE' || ticket.status === 'IN_WAITING_ROOM') {
    if (ticket.isPriority) {
        return { label: 'Aguardando', color: '#A855F7', bg: 'rgba(168, 85, 247, 0.1)', isExpired: false };
    }
    return { label: 'Aguardando', color: COLORS.inService, bg: 'rgba(34,197,94,0.1)', isExpired: false };
  }

  // Waiting queue — highlight the first two as “Próximo”
  if (indexInList < 2) {
    return { label: 'Próximo', color: COLORS.next, bg: 'rgba(245,158,11,0.1)', isExpired: false };
  }
  return { label: 'Aguardando', color: COLORS.waiting, bg: 'rgba(148,163,184,0.05)', isExpired: false };
};

// ── Component ─────────────────────────────────────────────────────────────────
const QueueDisplay: React.FC = () => {
  const { isUnlocked, unlockManual } = useAudioUnlock();
  const [data, setData] = useState<DisplayData>({ tickets: [], avgWaitMinutes: null });
  const [clock, setClock] = useState('');
  const [nowMs, setNowMs] = useState(Date.now());
  const [heroGlow, setHeroGlow] = useState(false);
  const [callQueue, setCallQueue] = useState<Ticket[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [displayHero, setDisplayHero] = useState<Ticket | null>(null);
  const processedIdsRef = useRef<Set<string>>(new Set());
  const isFirstFetchRef = useRef(true); // Evita anunciar o que já estava em atendimento ao carregar
  const channelRef = useRef<RealtimeChannel | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callQueueRef = useRef<Ticket[]>([]);

  // Mantém a ref sincronizada para usarmos o valor atualizado no processo async
  useEffect(() => {
    callQueueRef.current = callQueue;
  }, [callQueue]);

  // ── Clock ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClock(now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
      setNowMs(now.getTime());
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

      const filteredTickets = json.tickets.filter(t => t.status === 'IN_SERVICE' || t.status === 'IN_WAITING_ROOM' || t.status === 'WAITING' || t.status === 'NO_SHOW');
      const inService = filteredTickets.filter(t => t.status === 'IN_SERVICE' || t.status === 'IN_WAITING_ROOM');

      // Detect new calls
      const newCalls = inService.filter(t => !processedIdsRef.current.has(t.id));
      
      if (newCalls.length > 0) {
        // Se for a primeira carga, apenas marca como processado sem colocar na fila de anúncio
        if (isFirstFetchRef.current) {
          newCalls.forEach(t => processedIdsRef.current.add(t.id));
        } else {
          // Add new calls to the buffer queue, prioritizing strictly by timestamp
          const sortedNewCalls = [...newCalls].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          setCallQueue(prev => [...prev, ...sortedNewCalls]);
          // Update processed set
          newCalls.forEach(t => processedIdsRef.current.add(t.id));
        }
      }
      isFirstFetchRef.current = false;

      // Bug fix: track IN_SERVICE + IN_WAITING_ROOM + NO_SHOW for cleanup,
      // so NO_SHOW tickets aren't re-announced if realtime fires again
      const currentActiveIds = new Set(
        filteredTickets
          .filter(t => t.status === 'IN_SERVICE' || t.status === 'IN_WAITING_ROOM' || t.status === 'NO_SHOW')
          .map(t => t.id)
      );
      processedIdsRef.current.forEach(id => {
        if (!currentActiveIds.has(id)) processedIdsRef.current.delete(id);
      });

      setData({ ...json, tickets: filteredTickets });
    } catch (_) { }
  }, []);

  // ── Database Subscription & Polling ─────────────────────────────────────────
  useEffect(() => {
    fetchData();

    // 1. Setup Supabase Realtime
    const channel = supabase
      .channel('public:Visit')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'Visit' }, () => {
        fetchData();
      })
      .subscribe();
      
    channelRef.current = channel;

    // 2. Setup Polling as fallback (every 3s)
    pollRef.current = setInterval(() => {
      fetchData();
    }, 3000);

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, [fetchData]);

  // ── Process Call Queue (Staggered Delay) ──────────────────────────────────
  useEffect(() => {
    if (callQueue.length > 0 && !isProcessing) {
      const processNext = async () => {
        setIsProcessing(true);
        const next = callQueue[0];

        // Remove from queue
        setCallQueue(prev => prev.slice(1));

        setDisplayHero(next);
        setHeroGlow(true);

        try {
          // Garante a permanência de EXATOS 7 segundos na tela a partir da montagem do card
          const visualTimerPromise = new Promise(resolve => setTimeout(resolve, 7000));

          audioManager.playLoudSmoothChime();
          // Wait 1.5s for the chime to settle before speaking
          await new Promise(resolve => setTimeout(resolve, 1500));

          let name = next.citizenName || "Cidadão";
          name = name.replace(/^paciente\s+/i, '');

          // Fala o nome apenas 1 vez (Single Call)
          const audioPromise = audioManager.speak(name, 1, 1000);
          
          audioPromise.then(() => setHeroGlow(false)).catch(() => setHeroGlow(false));

          // A processNext só avança pro próximo chamado se e somente se as duas condições encerrarem:
          // 1. Áudio ter terminado 2. O tempo de 7 segundos total tiverem passado
          await Promise.all([audioPromise, visualTimerPromise]);
        } catch (e) {
          console.error("Erro no processamento da chamada", e);
          setHeroGlow(false);
        }

        // Importante: NÃO limpamos o displayHero como nulo para manter a senha visível fixa.
        // E nenhum setTimeout vazio entre as chamadas (fila engata perfeitamente nos ciclos de 7s).

        // Libera para a próxima execução
        setIsProcessing(false);
      };

      processNext();
    }

    return () => {
      // Cleanup not strictly handled as its managed by state timeout logic
    }
  }, [callQueue, isProcessing]);

  // Derived state
  // "calledTickets" = every ticket actively called (IN_SERVICE, IN_WAITING_ROOM, or NO_SHOW).
  // NO_SHOW must persist on the display panel (orange) - never disappears.
  const calledTickets = data.tickets.filter(
    t => t.status === 'IN_SERVICE' || t.status === 'IN_WAITING_ROOM' || t.status === 'NO_SHOW'
  );

  // Exclude tickets still sitting in the async announcement queue (avoids flickering)
  const callQueueIds = new Set(callQueue.map(t => t.id));
  const processedTickets = calledTickets.filter(t => !callQueueIds.has(t.id));

  // If the stored displayHero is still present in processedTickets (any status), keep it as hero
  let activeHero: Ticket | null = null;
  if (displayHero) {
    activeHero = processedTickets.find(t => t.id === displayHero.id) || null;
  }

  // Hero = persisted visual hero OR the most recently called ticket from DB
  const heroTicket = activeHero || (processedTickets.length > 0 ? processedTickets[processedTickets.length - 1] : null);

  // List = all called tickets except the hero - most recent first, max 12
  // Ordered by calledAt descending so the panel shows newest at top.
  const listTickets: Ticket[] = processedTickets
    .filter(t => t.id !== heroTicket?.id)
    .sort((a, b) => {
      const tA = a.calledAt ? new Date(a.calledAt).getTime() : new Date(a.timestamp).getTime();
      const tB = b.calledAt ? new Date(b.calledAt).getTime() : new Date(b.timestamp).getTime();
      return tB - tA;
    })
    .slice(0, 12);

  const heroInfo = heroTicket ? getTicketStatusInfo(heroTicket, 0, nowMs) : null;
  const isHeroExpired = heroInfo?.isExpired;
  
  // Custom styling overlays for Priority
  const heroPriorityOverlay = heroTicket?.isPriority ? { borderColor: '#A855F7', background: 'rgba(168, 85, 247, 0.08)' } : {};

  return (
    <div style={styles.page}>
      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
        <header style={styles.header}>
          <div style={styles.headerLeft}>
            <img src="/logo.png" alt="Logo" style={styles.logo} onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
            <div style={styles.logoDivider} />
            <span style={styles.headerTitle}>SESA-LAURO</span>
          </div>

          <div style={styles.headerCenter}>
            <div style={styles.legendWrapper}>
              <div style={styles.legendItemTop}>
                <div style={{...styles.legendCircle, background: COLORS.inService, boxShadow: `0 0 10px ${COLORS.inService}`}} />
                <span>AGUARDANDO</span>
              </div>
              <div style={styles.legendItemTop}>
                <div style={{...styles.legendCircle, background: '#F97316', boxShadow: `0 0 10px #F97316`}} />
                <span>EXPIRADO</span>
              </div>
              <div style={styles.legendItemTop}>
                <div style={{...styles.legendCircle, background: '#A855F7', boxShadow: `0 0 10px #A855F7`}} />
                <span>PREFERENCIAL</span>
              </div>
            </div>
          </div>

          <div style={styles.headerRight}>
            <div style={styles.clock}>{clock}</div>
          </div>
        </header>

      {/* ── HERO TICKET ────────────────────────────────────────────────────── */}
      <main style={styles.main}>
        <section style={styles.heroSection}>
          <AnimatePresence mode="popLayout">
            {heroTicket ? (
              <motion.div 
                layoutId={heroTicket.id}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ type: 'spring', bounce: 0.35, duration: 0.8 }}
                key={heroTicket.id} 
                style={{ 
                  ...styles.heroCard, 
                  ...(heroGlow ? styles.heroCardGlow : {}), 
                  ...(isHeroExpired ? { borderColor: 'rgba(249, 115, 22, 0.4)', background: 'rgba(249, 115, 22, 0.08)' } : {}),
                  ...(!isHeroExpired && heroPriorityOverlay) 
                }}
              >
                {heroTicket.isPriority && (
                   <span style={{
                     position: 'absolute', top: 24, padding: '6px 16px', right: 24,
                     background: '#A855F7', color: '#fff', fontSize: '18px', fontWeight: 900, 
                     borderRadius: '8px', letterSpacing: '2px', boxShadow: '0 0 20px rgba(168, 85, 247, 0.5)'
                   }}>
                     PREFERENCIAL ♿
                   </span>
                )}
                <p style={{...styles.heroSub, color: isHeroExpired ? '#F97316' : (heroTicket.isPriority ? '#D8B4FE' : '#64748B')}}>{isHeroExpired ? 'NÃO COMPARECEU' : 'AGUARDANDO'}</p>
                <h1 style={{...styles.heroCode, color: isHeroExpired ? '#FB923C' : (heroTicket.isPriority ? '#F3E8FF' : COLORS.white)}}>{heroTicket.code}</h1>
                <div style={styles.heroStatus}>
                  <div style={{...styles.heroDot, background: isHeroExpired ? '#F97316' : (heroTicket.isPriority ? '#A855F7' : COLORS.inService), boxShadow: isHeroExpired ? `0 0 15px #F97316` : (heroTicket.isPriority ? `0 0 15px #A855F7` : `0 0 15px ${COLORS.inService}`)}} />
                  <span style={{color: isHeroExpired ? '#FB923C' : '#CBD5E1'}}>{heroTicket.sectorName}{heroTicket.resourceName ? ` | ${heroTicket.resourceName}` : ''}</span>
                </div>
                
                {/* Batch feedback */}
                {callQueue.length > 0 && (
                  <div style={styles.batchFeedback}>
                    <div style={styles.batchProgress} className="batch-progress-bar" />
                    <span>Mais {callQueue.length} {callQueue.length === 1 ? 'pessoa sendo chamada' : 'pessoas sendo chamadas'}...</span>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={styles.emptyState}
              >
                <div style={styles.emptyIcon}>⏳</div>
                <p style={styles.emptyText}>Aguardando próxima chamada</p>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* ── CALL HISTORY GRID ──────────────────────────────────────────────── */}
        <section style={styles.listSection}>
          <header style={styles.listHeader}>
            <h2 style={styles.listTitle}>ÚLTIMAS CHAMADAS</h2>
          </header>

          <div style={styles.gridContainer}>
            <AnimatePresence mode="popLayout">
              {listTickets.length > 0 ? (
                listTickets.map((t, idx) => {
                  const info = getTicketStatusInfo(t, idx, nowMs);
                  return (
                    <motion.div
                      layoutId={t.id}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ type: 'spring', bounce: 0.35, duration: 0.8 }}
                      key={t.id}
                      style={{
                        ...styles.gridItem,
                        background: info.isExpired ? 'rgba(249, 115, 22, 0.12)' : (t.isPriority ? 'rgba(168, 85, 247, 0.08)' : 'rgba(255,255,255,0.03)'),
                        borderColor: info.isExpired ? 'rgba(249, 115, 22, 0.3)' : (t.isPriority ? 'rgba(168, 85, 247, 0.3)' : 'rgba(255,255,255,0.08)'),
                        flexDirection: 'column',
                        justifyContent: 'center',
                        gap: '2px',
                        position: 'relative'
                      }}
                    >
                      {t.isPriority && (
                          <span style={{ 
                            position: 'absolute', top: 4, right: 8, fontSize: '9px', fontWeight: 900, 
                            color: '#e9d5ff', background: '#9333ea', padding: '1px 4px', borderRadius: '4px' 
                          }}>
                            ★
                          </span>
                      )}
                      <span style={{ ...styles.gridCode, color: info.color }}>{t.code}</span>
                      <span style={{ ...styles.gridSector, color: info.color + '80' }}>
                        {t.sectorName}{t.resourceName ? ` | ${t.resourceName}` : ''}
                      </span>
                    </motion.div>
                  );
                })
              ) : (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={styles.noQueue}>Nenhuma chamada anterior</motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>
      </main>

      {/* ── ALERTA DE ÁUDIO (UX Melhorado) ─────────────────────────────────── */}
      {!isUnlocked && (
        <div style={styles.audioAlert} onClick={unlockManual}>
          🔔 Clique aqui (ou em qualquer lugar) para ativar os avisos sonoros
        </div>
      )}

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

        @keyframes progressMove {
          0% { left: -30%; }
          100% { left: 100%; }
        }

        .batch-progress-bar::after {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          height: 100%;
          width: 30%;
          background: #818CF8;
          border-radius: 2px;
          animation: progressMove 2s infinite linear;
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
  headerCenter: {
    flex: 1,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  legendWrapper: {
    display: 'flex',
    gap: '32px',
    background: 'rgba(255,255,255,0.03)',
    padding: '8px 24px',
    borderRadius: '100px',
    border: `1px solid ${COLORS.border}`,
  },
  legendItemTop: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '1px',
    color: '#94A3B8',
  },
  legendCircle: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
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
    animation: 'heroPulse 3s cubic-bezier(0.16, 1, 0.3, 1), cardGlow 2s ease-in-out infinite',
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
    gridTemplateColumns: 'repeat(3, 1fr)',
    gridAutoRows: '100px',
    alignContent: 'start',
    gap: '12px',
    flex: 1,
    overflow: 'auto',
    paddingRight: '10px',
  },
  gridItem: {
    height: '100px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '24px',
    border: '1px solid',
    animation: 'itemFadeIn 0.5s ease-out both',
  },
  gridCode: {
    fontSize: '28px',
    fontWeight: 800,
    letterSpacing: '1px',
    margin: 0,
    lineHeight: '1.2',
  },
  gridSector: {
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '2px',
    textTransform: 'uppercase',
    opacity: 0.8,
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
  audioAlert: {
    position: 'absolute' as const,
    top: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(245, 158, 11, 0.95)',
    color: '#000',
    padding: '12px 24px',
    borderRadius: '12px',
    fontWeight: 'bold',
    zIndex: 9999,
    cursor: 'pointer',
    boxShadow: '0 4px 15px rgba(245, 158, 11, 0.4)',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  batchFeedback: {
    marginTop: '30px',
    padding: '12px 24px',
    background: 'rgba(79, 70, 229, 0.15)',
    border: '1px solid rgba(79, 70, 229, 0.3)',
    borderRadius: '16px',
    fontSize: '14px',
    fontWeight: 700,
    color: '#818CF8',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '8px',
    animation: 'itemFadeIn 0.5s ease-out',
  },
  batchProgress: {
    width: '100%',
    height: '4px',
    background: 'rgba(79, 70, 229, 0.2)',
    borderRadius: '2px',
    overflow: 'hidden',
    position: 'relative' as const,
  }
};

export default QueueDisplay;
