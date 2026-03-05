export type SectorStatus = 'AVAILABLE' | 'BUSY' | 'AWAY';

export interface Sector {
    id: string;
    name: string;
    status: SectorStatus;
    queueCount: number;
    updatedAt: string;
}
