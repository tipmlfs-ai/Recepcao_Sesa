export type SectorStatus = 'AVAILABLE' | 'BUSY' | 'AWAY';

export interface Sector {
    id: string;
    name: string;
    status: SectorStatus;
    queueCount: number;
    maxBatchSize?: number;
    soundUrl?: string;
    callCooldown?: number;
    hasWaitingRoom?: boolean;
    waitingRoomCapacity?: number;
    updatedAt: string;
}

export interface Visit {
    id: string;
    code?: string | null;
    ticketStatus?: 'WAITING' | 'IN_WAITING_ROOM' | 'IN_SERVICE' | 'FINISHED' | null;
    isPriority?: boolean;
    citizenId: string;
    sectorId: string;
    timestamp: string;
    calledToWaitingRoomAt?: string | null;
    calledAt?: string | null;
    citizen: { cpf: string; name: string; phone?: string | null };
    sector: { id: string; name: string; soundUrl?: string };
}

export interface Ticket {
    id: string;
    code?: string | null;
    ticketStatus?: 'WAITING' | 'IN_WAITING_ROOM' | 'IN_SERVICE' | 'FINISHED' | null;
    isPriority?: boolean;
    citizenId: string;
    sectorId: string;
    timestamp: string;
    calledToWaitingRoomAt?: string | null;
    calledAt?: string | null;
    citizen: { cpf: string; name: string; phone?: string | null };
    sector: { id: string; name: string; soundUrl?: string };
}
