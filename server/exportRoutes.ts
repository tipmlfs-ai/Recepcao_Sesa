import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';
import PdfPrinter from 'pdfmake';
import { format } from 'date-fns';

const router = Router();
const prisma = new PrismaClient();

// Shared filtering logic
async function getFilteredVisits(req: Request) {
    const { date, filterType, code, cpf, sectorId, ticketStatus } = req.query;

    let queryOptions: any = {
        include: {
            citizen: true,
            sector: true,
            user: { select: { email: true } }
        },
        orderBy: { timestamp: 'desc' },
        where: {}
    };

    if (sectorId) {
        queryOptions.where.sectorId = sectorId as string;
    }
    if (ticketStatus) {
        queryOptions.where.ticketStatus = ticketStatus as string;
    }
    if (code) {
        queryOptions.where.code = { contains: code as string, mode: 'insensitive' };
        return await prisma.visit.findMany(queryOptions);
    }
    if (cpf) {
        queryOptions.where.citizenId = { contains: cpf as string };
        return await prisma.visit.findMany(queryOptions);
    }

    if (filterType) {
        let startDate: Date;
        let endDate: Date;

        if (filterType === 'custom') {
            const customStart = req.query.startDate as string;
            const customEnd = req.query.endDate as string;
            if (customStart && customEnd) {
                startDate = new Date(customStart + 'T00:00:00');
                endDate = new Date(customEnd + 'T23:59:59.999');
            } else {
                startDate = new Date();
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date();
                endDate.setHours(23, 59, 59, 999);
            }
        } else {
            const targetDate = date ? new Date(date as string + 'T00:00:00') : new Date();
            startDate = new Date(targetDate);
            endDate = new Date(targetDate);

            if (filterType === 'day') {
                startDate.setHours(0, 0, 0, 0);
                endDate.setHours(23, 59, 59, 999);
            } else if (filterType === 'week') {
                const day = startDate.getDay();
                startDate.setDate(startDate.getDate() - day);
                startDate.setHours(0, 0, 0, 0);
                endDate.setDate(endDate.getDate() + (6 - day));
                endDate.setHours(23, 59, 59, 999);
            } else if (filterType === 'month') {
                startDate.setDate(1);
                startDate.setHours(0, 0, 0, 0);
                endDate.setMonth(endDate.getMonth() + 1);
                endDate.setDate(0);
                endDate.setHours(23, 59, 59, 999);
            }
        }
        queryOptions.where.timestamp = { gte: startDate, lte: endDate };
    } else if (!code && !cpf && !ticketStatus) {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);
        queryOptions.where.timestamp = { gte: todayStart, lte: todayEnd };
    }

    return await prisma.visit.findMany(queryOptions);
}

// XLSX Inteligente
router.get('/xlsx', async (req, res) => {
    try {
        const visits = await getFilteredVisits(req);
        const sectorName = req.query.sectorId ? visits[0]?.sector?.name || 'Setor' : 'Visão Geral';

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Recepção SESA';
        workbook.created = new Date();

        // Aba 1: Dashboard Summary
        const summarySheet = workbook.addWorksheet('Dashboard Summary');
        summarySheet.columns = [
            { header: 'Métrica', key: 'metric', width: 30 },
            { header: 'Valor', key: 'value', width: 20 }
        ];

        const totalVisits = visits.length;
        const finished = visits.filter((v: any) => v.ticketStatus === 'FINISHED').length;
        const waiting = visits.filter((v: any) => v.ticketStatus === 'WAITING').length;
        const inService = visits.filter((v: any) => v.ticketStatus === 'IN_SERVICE').length;

        summarySheet.addRows([
            { metric: 'Setor Analisado', value: sectorName },
            { metric: 'Total de Atendimentos', value: totalVisits },
            { metric: 'Finalizados', value: finished },
            { metric: 'Aguardando', value: waiting },
            { metric: 'Em Atendimento', value: inService },
            { metric: 'Data de Geração', value: format(new Date(), 'dd/MM/yyyy HH:mm') }
        ]);

        summarySheet.getRow(1).font = { bold: true };
        summarySheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
        summarySheet.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };

        // Aba 2: Raw Data
        const rawSheet = workbook.addWorksheet('Raw Data', { views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }] });
        rawSheet.columns = [
            { header: 'Data/Hora', key: 'timestamp', width: 20 },
            { header: 'Ticket', key: 'code', width: 15 },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'Cidadão', key: 'citizenName', width: 30 },
            { header: 'CPF', key: 'citizenCpf', width: 20 },
            { header: 'Setor', key: 'sectorName', width: 25 },
            { header: 'Atendente', key: 'userEmail', width: 30 }
        ];

        rawSheet.getRow(1).font = { bold: true };
        rawSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
        rawSheet.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };
        rawSheet.autoFilter = 'A1:G1';

        visits.forEach((v: any) => {
            const row = rawSheet.addRow({
                timestamp: v.timestamp,
                code: v.code,
                status: v.ticketStatus,
                citizenName: v.citizen?.name,
                citizenCpf: v.citizenId,
                sectorName: v.sector?.name,
                userEmail: v.user?.email || '-'
            });
            // formatting timestamp column as native excel date
            row.getCell('timestamp').numFmt = 'dd/mm/yyyy hh:mm';
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=Relatorio_${sectorName.replace(/\s/g, '_')}_${format(new Date(), 'yyyyMMdd')}.xlsx`);

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('XLSX Export Error:', error);
        res.status(500).json({ error: 'Falha ao exportar planilha' });
    }
});

// PDF Premium
router.get('/pdf', async (req, res) => {
    try {
        const visits = await getFilteredVisits(req);
        const sectorName = req.query.sectorId ? visits[0]?.sector?.name || 'Setor' : 'Visão Geral';

        const fonts = {
            Helvetica: {
                normal: 'Helvetica',
                bold: 'Helvetica-Bold',
                italics: 'Helvetica-Oblique',
                bolditalics: 'Helvetica-BoldOblique'
            }
        };

        const printer = new PdfPrinter(fonts);

        const tableBody = [
            [
                { text: 'Data/Hora', style: 'tableHeader' },
                { text: 'Ticket', style: 'tableHeader' },
                { text: 'Status', style: 'tableHeader' },
                { text: 'Cidadão', style: 'tableHeader' },
                { text: 'Setor', style: 'tableHeader' }
            ]
        ];

        visits.forEach((v: any, index: number) => {
            const isEven = index % 2 === 0;
            const fillColor = isEven ? '#f8fafc' : '#ffffff';
            
            tableBody.push([
                { text: format(v.timestamp, 'dd/MM/yyyy HH:mm'), fillColor, fontSize: 10 },
                { text: v.code || '-', fillColor, fontSize: 10 },
                { text: v.ticketStatus || '-', fillColor, fontSize: 10 },
                { text: v.citizen?.name || '-', fillColor, fontSize: 10 },
                { text: v.sector?.name || '-', fillColor, fontSize: 10 }
            ]);
        });

        const docDefinition: any = {
            pageOrientation: 'landscape',
            defaultStyle: { font: 'Helvetica' },
            header: {
                margin: [40, 20, 40, 0],
                columns: [
                    { text: 'Recepção SESA', style: 'headerTitle' },
                    { text: `Relatório: ${sectorName}`, alignment: 'right', style: 'headerSubtitle' }
                ]
            },
            footer: (currentPage: number, pageCount: number) => {
                return {
                    margin: [40, 0, 40, 20],
                    columns: [
                        { text: `Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')} | Filtro Aplicado`, fontSize: 8, color: '#64748b' },
                        { text: `Página ${currentPage} de ${pageCount}`, alignment: 'right', fontSize: 8, color: '#64748b' }
                    ]
                };
            },
            content: [
                { text: 'Dashboard Summary', style: 'sectionHeader', margin: [0, 20, 0, 10] },
                {
                    columns: [
                        { text: `Total: ${visits.length}`, style: 'kpi' },
                        { text: `Finalizados: ${visits.filter((v: any) => v.ticketStatus === 'FINISHED').length}`, style: 'kpi' },
                        { text: `Aguardando: ${visits.filter((v: any) => v.ticketStatus === 'WAITING').length}`, style: 'kpi' }
                    ],
                    columnGap: 10,
                    margin: [0, 0, 0, 20]
                },
                { text: 'Raw Data', style: 'sectionHeader', margin: [0, 10, 0, 10] },
                {
                    table: {
                        headerRows: 1,
                        widths: ['auto', 'auto', 'auto', '*', 'auto'],
                        body: tableBody
                    },
                    layout: {
                        hLineWidth: () => 0.5,
                        vLineWidth: () => 0,
                        hLineColor: () => '#e2e8f0',
                        paddingLeft: () => 8,
                        paddingRight: () => 8,
                        paddingTop: () => 4,
                        paddingBottom: () => 4
                    }
                }
            ],
            styles: {
                headerTitle: { fontSize: 18, bold: true, color: '#0f172a' },
                headerSubtitle: { fontSize: 14, color: '#475569', margin: [0, 4, 0, 0] },
                sectionHeader: { fontSize: 14, bold: true, color: '#0f172a' },
                tableHeader: { bold: true, fontSize: 11, color: '#ffffff', fillColor: '#0f172a' },
                kpi: { fontSize: 12, bold: true, color: '#334155', fillColor: '#f1f5f9', margin: [0, 4, 0, 4] }
            }
        };

        const pdfDoc = printer.createPdfKitDocument(docDefinition);
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Relatorio_${sectorName.replace(/\s/g, '_')}_${format(new Date(), 'yyyyMMdd')}.pdf`);
        
        pdfDoc.pipe(res);
        pdfDoc.end();

    } catch (error) {
        console.error('PDF Export Error:', error);
        res.status(500).json({ error: 'Falha ao exportar PDF' });
    }
});

export default router;
