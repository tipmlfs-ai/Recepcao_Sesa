export type SectorStatus = 'AVAILABLE' | 'BUSY' | 'AWAY';

export interface Sector {
    id: string;
    name: string;
    status: SectorStatus;
    queueCount: number;
    soundUrl?: string;
    updatedAt: string;
}

export interface Visit {
    id: string;
    code?: string | null;
    ticketStatus?: 'WAITING' | 'IN_SERVICE' | 'FINISHED' | null;
    citizenId: string;
    sectorId: string;
    timestamp: string;
    citizen: { cpf: string; name: string };
    sector: { id: string; name: string; soundUrl?: string };
}

export interface Ticket {
    id: string;
    code?: string | null;
    ticketStatus?: 'WAITING' | 'IN_SERVICE' | 'FINISHED' | null;
    citizenId: string;
    sectorId: string;
    timestamp: string;
    citizen: { cpf: string; name: string };
    sector: { id: string; name: string; soundUrl?: string };
}
