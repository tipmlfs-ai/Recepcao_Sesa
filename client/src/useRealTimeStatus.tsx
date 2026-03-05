import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { type Sector } from './types';

const SOCKET_URL = 'http://localhost:3001';

export function useRealTimeStatus() {
    const [sectors, setSectors] = useState<Sector[]>([]);
    const [socket, setSocket] = useState<Socket | null>(null);

    useEffect(() => {
        // Busca estado inicial via API Rest
        fetch(`${SOCKET_URL}/api/sectors`)
            .then((res) => res.json())
            .then((data) => setSectors(data))
            .catch((err) => console.error('Failed to load initial data:', err));

        // Conecta WebSocket para tempo real
        const newSocket = io(SOCKET_URL);
        setSocket(newSocket);

        newSocket.on('connect', () => {
            console.log('Connected to WebSocket server');
        });

        // Escuta evento de broadcast quando alguém, em qualquer lugar da clínica mudar o status via controlador
        newSocket.on('status_changed', (updatedSector: Sector) => {
            setSectors((prevSectors) =>
                prevSectors.map((sector) =>
                    sector.id === updatedSector.id ? updatedSector : sector
                )
            );
        });

        return () => {
            newSocket.disconnect();
        };
    }, []);

    const updateStatus = (sectorId: string, status: Sector['status']) => {
        if (socket) {
            // Envia comando para alterar status via WS que vai salvar no banco
            socket.emit('update_status', { sectorId, status });
        }
    };

    const updateQueue = (sectorId: string, action: 'add' | 'remove') => {
        if (socket) {
            socket.emit('update_queue', { sectorId, action });
        }
    };

    return { sectors, updateStatus, updateQueue };
}
